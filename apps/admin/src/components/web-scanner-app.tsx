"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LookupResult,
  MarkAttendanceRequest,
  Room,
  User
} from "@algo-attendance/shared";
import { ExamPulseLogo } from "@/components/exam-pulse-logo";
import {
  ScannerRequestError,
  createIdempotencyTracker,
  createRequestCoordinator
} from "@/lib/scanner-requests.mjs";
import {
  classifyOutboxError,
  createScannerOutbox,
  getRetryDelayMs,
  summarizeOutbox
} from "@/lib/scanner-outbox.mjs";
import {
  describeOcrLoadError,
  getOcrCanvasWidth,
  preprocessLowLightImageData,
  supportsWasmSimd
} from "@/lib/scanner-ocr-runtime.mjs";
import {
  createSingleFlightLoop,
  getScannerBackAction
} from "@/lib/scanner-runtime.mjs";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type RoomWithSession = Room & {
  session?: {
    id: string;
    name: string;
    examDate: string;
    startTime: string;
  };
};

type LiveRoomState = {
  summary?: {
    allocatedCount: number;
    presentCount: number;
    mismatchPresentCount: number;
    redirectedCount: number;
  };
  recentAttendance: Array<{
    studentId: string;
    createdAt: string;
    roomMismatch: boolean;
    comment?: string;
  }>;
  recentIncidents: Array<{
    incidentType: string;
    studentId?: string;
    createdAt: string;
    comment?: string;
  }>;
};

type RecentScanChip = {
  key: string;
  label: string;
  detail: string;
  tone: "ok" | "warn";
};

type MarkResponse = {
  event?: { id: string; roomMismatch: boolean; createdAt: string };
  incident?: { id: string; incidentType: string; createdAt: string };
  result: LookupResult;
};

type ScannerOutboxItem = {
  id: string;
  request: MarkAttendanceRequest;
  examSessionId: string;
  roomId: string;
  studentId: string;
  source: "ocr" | "manual";
  comment?: string;
  overrideWrongRoom: boolean;
  action: "mark_present" | "redirect_only";
  deviceId: string;
  userId: string;
  queuedAt: string;
  status: "pending" | "syncing" | "failed" | "conflict";
  attempts: number;
  nextAttemptAt: number;
  leaseUntil: number;
  lastError?: string | null;
};

type OcrWorker = {
  predict(
    image: HTMLCanvasElement,
    params?: Record<string, string | number>
  ): Promise<
    Array<{
      items: Array<{ text: string; score: number }>;
      metrics?: { totalMs: number; detectedBoxes: number; recognizedCount: number };
    }>
  >;
  dispose(): Promise<unknown>;
};

type TorchMediaTrack = MediaStreamTrack & {
  getCapabilities(): MediaTrackCapabilities & { torch?: boolean };
  applyConstraints(constraints: MediaTrackConstraints & {
    advanced?: Array<MediaTrackConstraintSet & { torch?: boolean }>;
  }): Promise<void>;
};

const deviceIdStorageKey = "ams-web-scanner-device-id";
const onnxModelTimeoutMs = 45000;

function normalizeAccessCode(input: string) {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const withoutPrefix = compact.startsWith("AMS") ? compact.slice(3) : compact;
  const body = withoutPrefix.slice(0, 8);

  if (!body) {
    return "";
  }

  return `AMS-${body.slice(0, 4)}${body.length > 4 ? `-${body.slice(4)}` : ""}`;
}

function extractStudentIdCandidate(text: string) {
  const candidates = new Set<string>();
  const normalizedGroups = text.replace(/[^\d]/g, " ").split(/\s+/).filter(Boolean);

  for (const group of normalizedGroups) {
    if (group.length >= 6 && group.length <= 10) {
      candidates.add(group);
    }
  }

  const collapsedDigits = text.replace(/\D/g, "");
  if (collapsedDigits.length >= 6 && collapsedDigits.length <= 10) {
    candidates.add(collapsedDigits);
  }

  const preferred = Array.from(candidates).sort((left, right) => {
    const leftScore = left.length === 7 ? 0 : Math.abs(left.length - 7) + 1;
    const rightScore = right.length === 7 ? 0 : Math.abs(right.length - 7) + 1;
    return leftScore - rightScore;
  });

  return preferred[0] || null;
}

function getDeviceId() {
  const existing = window.localStorage.getItem(deviceIdStorageKey);
  if (existing) {
    return existing;
  }

  const nextId =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(deviceIdStorageKey, nextId);
  return nextId;
}

function createRequestId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out. Check the connection and try again.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }
}

async function createDigitOcrWorker(
  onStatus: (message: string) => void
): Promise<OcrWorker> {
  onStatus("Loading ONNX OCR models... first load can take 20-40 seconds.");
  const { PaddleOCR } = await import("@paddleocr/paddleocr-js");
  const ocr = await PaddleOCR.create({
    lang: "en",
    ocrVersion: "PP-OCRv5",
    worker: false,
    textDetectionBatchSize: 1,
    textRecognitionBatchSize: 4,
    ortOptions: {
      backend: "wasm",
      numThreads: 1,
      simd: supportsWasmSimd(),
      wasmPaths: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/"
    }
  });

  onStatus("ONNX OCR ready.");
  return ocr as OcrWorker;
}

function trackSupportsTorch(track?: MediaStreamTrack | null) {
  if (!track?.getCapabilities) {
    return false;
  }

  const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
    torch?: boolean;
  };
  return Boolean(capabilities.torch);
}

export function WebScannerApp() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanRegionRef = useRef<HTMLDivElement | null>(null);
  const manualInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ocrWorkerRef = useRef<OcrWorker | null>(null);
  const ocrLoadPromiseRef = useRef<Promise<OcrWorker> | null>(null);
  const preprocessingBuffersRef = useRef<ReturnType<typeof preprocessLowLightImageData> | null>(null);
  const componentActiveRef = useRef(true);
  const startOcrLoopRef = useRef<() => void>(() => undefined);
  const runOcrScanRef = useRef<() => Promise<void>>(async () => undefined);
  const ocrLoopRef = useRef<ReturnType<typeof createSingleFlightLoop> | null>(null);
  const authExpiryHandlerRef = useRef<() => void>(() => undefined);
  const requestCoordinatorRef = useRef<ReturnType<typeof createRequestCoordinator> | null>(null);
  const outboxRef = useRef<ReturnType<typeof createScannerOutbox> | null>(null);
  const outboxFlushActiveRef = useRef(false);
  const userRef = useRef<User | null>(null);
  const selectedRoomRef = useRef<RoomWithSession | null>(null);
  const busyRef = useRef(false);
  const scanPausedRef = useRef(false);
  const lookupPendingRef = useRef(false);
  const historyGuardActiveRef = useRef(false);
  const historyGuardIdRef = useRef("");
  const lastBackHandledAtRef = useRef(0);
  const markIdempotencyRef = useRef<ReturnType<typeof createIdempotencyTracker> | null>(null);
  const lastCandidateRef = useRef<{ value: string; count: number; seenAt: number } | null>(
    null
  );

  const [accessCode, setAccessCode] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<RoomWithSession[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<RoomWithSession | null>(null);
  const [liveState, setLiveState] = useState<LiveRoomState | null>(null);
  const [studentId, setStudentId] = useState("");
  const [comment, setComment] = useState("");
  const [lastSource, setLastSource] = useState<"ocr" | "manual">("ocr");
  const [lastLookup, setLastLookup] = useState<LookupResult | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [ocrStatus, setOcrStatus] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [sessionRestoring, setSessionRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [lookupPending, setLookupPending] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraRecoveryNeeded, setCameraRecoveryNeeded] = useState(false);
  const [scanPaused, setScanPaused] = useState(false);
  const [optimisticStats, setOptimisticStats] = useState({
    present: 0,
    mismatch: 0,
    redirected: 0
  });
  const [localRecentChips, setLocalRecentChips] = useState<RecentScanChip[]>([]);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [torchMessage, setTorchMessage] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [scanHold, setScanHold] = useState(false);
  const [outboxItems, setOutboxItems] = useState<ScannerOutboxItem[]>([]);
  const [backendState, setBackendState] = useState<
    "checking" | "online" | "offline" | "unreachable" | "syncing"
  >("checking");

  authExpiryHandlerRef.current = () => {
    ocrLoopRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    userRef.current = null;
    selectedRoomRef.current = null;
    setUser(null);
    setRooms([]);
    setSelectedRoom(null);
    setLiveState(null);
    setCameraActive(false);
    setTorchEnabled(false);
    setTorchSupported(false);
    setStatusMessage("Your invigilator session has expired. Sign in again to continue.");
  };

  if (!requestCoordinatorRef.current) {
    requestCoordinatorRef.current = createRequestCoordinator({
      onAuthExpired: () => authExpiryHandlerRef.current()
    });
  }

  if (!markIdempotencyRef.current) {
    markIdempotencyRef.current = createIdempotencyTracker(createRequestId);
  }

  if (!ocrLoopRef.current) {
    ocrLoopRef.current = createSingleFlightLoop({
      delayMs: 900,
      task: () => runOcrScanRef.current(),
      onError: (error: unknown) => {
        setOcrStatus(error instanceof Error ? error.message : "OCR scan failed.");
      }
    });
  }

  const roomStats = useMemo(
    () => ({
      allocated: liveState?.summary?.allocatedCount ?? 0,
      present: (liveState?.summary?.presentCount ?? 0) + optimisticStats.present,
      mismatch: (liveState?.summary?.mismatchPresentCount ?? 0) + optimisticStats.mismatch,
      redirected: (liveState?.summary?.redirectedCount ?? 0) + optimisticStats.redirected
    }),
    [liveState, optimisticStats]
  );
  const outboxCounts = useMemo(() => summarizeOutbox(outboxItems), [outboxItems]);
  const backendLabel = {
    checking: "Checking backend",
    online: "Backend connected",
    offline: "Device offline",
    unreachable: "Backend unreachable",
    syncing: "Synchronizing"
  }[backendState];

  const requestJson = useCallback(async <T,>(
    key: string,
    input: RequestInfo | URL,
    init?: RequestInit,
    timeoutMs = 10000
  ): Promise<T> => {
    return requestCoordinatorRef.current!.requestJson<T>(key, input, init, timeoutMs);
  }, []);

  const cancelRequests = useCallback((...keys: string[]) => {
    requestCoordinatorRef.current?.cancel(...keys);
  }, []);

  const cancelAllRequests = useCallback(() => {
    requestCoordinatorRef.current?.cancelAll();
  }, []);

  const getOutbox = useCallback(() => {
    if (!outboxRef.current) {
      outboxRef.current = createScannerOutbox({ indexedDb: window.indexedDB });
    }
    return outboxRef.current;
  }, []);

  const refreshOutbox = useCallback(async () => {
    const items = await getOutbox().list() as ScannerOutboxItem[];
    const currentUserId = userRef.current?.id;
    const visibleItems = currentUserId
      ? items.filter((item) => item.userId === currentUserId)
      : [];
    setOutboxItems(visibleItems);
    return visibleItems;
  }, [getOutbox]);

  const resetForNextScan = useCallback(() => {
    markIdempotencyRef.current?.clear();
    setStudentId("");
    setComment("");
    setLastLookup(null);
    setStatusMessage("");
    setLookupPending(false);
    scanPausedRef.current = false;
    setScanPaused(false);
    lastCandidateRef.current = null;
  }, []);

  const loadCurrentUser = useCallback(async () => {
    const payload = await requestJson<{ user: User }>("current-user", "/api/auth/me");
    userRef.current = payload.user;
    setUser(payload.user);
    return payload.user;
  }, [requestJson]);

  const loadRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const payload = await requestJson<{ rooms: RoomWithSession[] }>(
        "rooms",
        "/api/mobile/my-rooms"
      );
      setRooms(payload.rooms);
      return payload.rooms;
    } finally {
      setRoomsLoading(false);
    }
  }, [requestJson]);

  const loadLiveState = useCallback(async (roomId: string) => {
    const payload = await requestJson<LiveRoomState>(
      "live-state",
      `/api/rooms/${roomId}/live`,
      undefined,
      8000
    );
    setLiveState(payload);
    setOptimisticStats({
      present: 0,
      mismatch: 0,
      redirected: 0
    });
    setLocalRecentChips([]);
    setLastSyncAt(new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }));
    setBackendState("online");
  }, []);

  const applyMarkSuccess = useCallback((payload: MarkResponse, normalizedId: string) => {
    const successMessage = payload.event?.roomMismatch
      ? "Present marked with room mismatch flag."
      : payload.event
        ? "Attendance marked."
        : "Incident logged.";
    const chip: RecentScanChip = {
      key: `local-${Date.now()}-${normalizedId}`,
      label: normalizedId,
      detail: payload.event?.roomMismatch
        ? "Mismatch"
        : payload.event
          ? "Present"
          : payload.incident?.incidentType.replaceAll("_", " ") || "Incident",
      tone: payload.event && !payload.event.roomMismatch ? "ok" : "warn"
    };

    setStatusMessage(successMessage);
    setOptimisticStats((current) => ({
      present: current.present + (payload.event ? 1 : 0),
      mismatch: current.mismatch + (payload.event?.roomMismatch ? 1 : 0),
      redirected:
        current.redirected +
        (payload.incident?.incidentType === "wrong_room_redirected" ? 1 : 0)
    }));
    setLocalRecentChips((current) => [chip, ...current].slice(0, 3));
    setLastSyncAt(new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }));
    setBackendState("online");
  }, []);

  const flushOutbox = useCallback(async () => {
    if (outboxFlushActiveRef.current || !userRef.current || !navigator.onLine) {
      return;
    }

    outboxFlushActiveRef.current = true;
    let retryBlocked = false;
    let madeRequest = false;
    try {
      while (userRef.current && navigator.onLine) {
        const item = await getOutbox().claimNext(userRef.current.id) as ScannerOutboxItem | null;
        if (!item) {
          break;
        }

        madeRequest = true;
        setBackendState("syncing");
        try {
          await requestJson<MarkResponse>(
            `outbox-${item.id}`,
            "/api/attendance/mark",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(item.request)
            },
            12000
          );
          await getOutbox().complete(item.id);
          setLastSyncAt(new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
          }));
          if (selectedRoomRef.current?.id === item.roomId) {
            await loadLiveState(item.roomId).catch(() => undefined);
          }
        } catch (error) {
          const disposition = classifyOutboxError(error);
          const message = error instanceof Error ? error.message : "Unable to synchronize attendance.";
          if (disposition === "retry") {
            await getOutbox().markRetry(item.id, message, getRetryDelayMs(item.attempts + 1));
            setBackendState(navigator.onLine ? "unreachable" : "offline");
            retryBlocked = true;
            break;
          }
          await getOutbox().markTerminal(item.id, disposition, message);
        }
      }
    } finally {
      outboxFlushActiveRef.current = false;
      await refreshOutbox().catch(() => undefined);
      if (navigator.onLine && madeRequest && !retryBlocked) {
        setBackendState("online");
      }
    }
  }, [getOutbox, loadLiveState, refreshOutbox, requestJson]);

  useEffect(() => {
    const handleOnline = () => {
      setBackendState("checking");
      void flushOutbox();
    };
    const handleOffline = () => setBackendState("offline");

    setBackendState(navigator.onLine ? "checking" : "offline");
    refreshOutbox().catch(() => undefined);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    const intervalId = window.setInterval(() => {
      if (navigator.onLine) {
        void flushOutbox();
      }
    }, 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(intervalId);
    };
  }, [flushOutbox, refreshOutbox]);

  const retryOutboxItem = useCallback(async (id: string) => {
    await getOutbox().retry(id);
    await refreshOutbox();
    void flushOutbox();
  }, [flushOutbox, getOutbox, refreshOutbox]);

  const acknowledgeOutboxItem = useCallback(async (item: ScannerOutboxItem) => {
    const confirmed = window.confirm(
      `Remove the unresolved attendance for ${item.studentId} from this device? Only continue after checking the admin attendance record.`
    );
    if (!confirmed) {
      return;
    }
    await getOutbox().complete(item.id);
    await refreshOutbox();
  }, [getOutbox, refreshOutbox]);

  useEffect(() => {
    if (user) {
      void flushOutbox();
    }
  }, [flushOutbox, user]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    selectedRoomRef.current = selectedRoom;
  }, [selectedRoom]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    scanPausedRef.current = scanPaused;
  }, [scanPaused]);

  useEffect(() => {
    lookupPendingRef.current = lookupPending;
  }, [lookupPending]);

  useEffect(() => {
    if (scanPaused) {
      return;
    }

    scanPausedRef.current = scanHold;
  }, [scanHold, scanPaused]);

  useEffect(() => {
    if (!selectedRoom) {
      return undefined;
    }

    loadLiveState(selectedRoom.id).catch((error) => {
      setBackendState(navigator.onLine ? "unreachable" : "offline");
      setStatusMessage(error instanceof Error ? error.message : "Unable to load room state.");
    });
    const intervalId = window.setInterval(() => {
      loadLiveState(selectedRoom.id).catch(() => undefined);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [loadLiveState, selectedRoom]);

  const stopOcrLoop = useCallback(() => {
    ocrLoopRef.current?.stop();
  }, []);

  const releaseCameraStream = useCallback((updateState = true) => {
    streamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (updateState) {
      setCameraActive(false);
      setTorchSupported(false);
      setTorchEnabled(false);
      setTorchMessage("");
    }
  }, [requestJson]);

  useEffect(() => {
    let active = true;

    const restoreInvigilatorSession = async () => {
      try {
        const payload = await requestJson<{ user: User }>(
          "session-restore",
          "/api/auth/me",
          undefined,
          8000
        );
        if (!active || payload.user.role !== "invigilator") {
          return;
        }

        userRef.current = payload.user;
        setUser(payload.user);
        await loadRooms();
      } catch {
        // No valid invigilator session is the normal signed-out state.
      } finally {
        if (active) {
          setSessionRestoring(false);
        }
      }
    };

    void restoreInvigilatorSession();
    return () => {
      active = false;
      cancelRequests("session-restore", "rooms");
    };
  }, [cancelRequests, loadRooms, requestJson]);

  useEffect(() => {
    componentActiveRef.current = true;
    return () => {
      componentActiveRef.current = false;
      cancelAllRequests();
      stopOcrLoop();
      releaseCameraStream(false);
      ocrWorkerRef.current?.dispose().catch(() => undefined);
      preprocessingBuffersRef.current = null;
      if (canvasRef.current) {
        canvasRef.current.width = 1;
        canvasRef.current.height = 1;
      }
    };
  }, [cancelAllRequests, releaseCameraStream, stopOcrLoop]);

  const stopCamera = useCallback(() => {
    cancelRequests("lookup", "live-state");
    stopOcrLoop();
    releaseCameraStream();
    setCameraRecoveryNeeded(false);
    setScanHold(false);
    scanPausedRef.current = false;
    setScanPaused(false);
    selectedRoomRef.current = null;
    setSelectedRoom(null);
  }, [cancelRequests, releaseCameraStream, stopOcrLoop]);

  useEffect(() => {
    const pauseScanner = () => {
      if (!selectedRoomRef.current) {
        return;
      }
      stopOcrLoop();
      setOcrStatus("Scanner paused while the app is in the background.");
    };

    const resumeScanner = async () => {
      if (!selectedRoomRef.current || document.visibilityState === "hidden") {
        return;
      }

      const stream = streamRef.current;
      const track = stream?.getVideoTracks()[0];
      if (!stream || !track || track.readyState !== "live") {
        setCameraActive(false);
        setCameraRecoveryNeeded(true);
        setOcrStatus("Camera stopped while the app was in the background.");
        return;
      }

      try {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraActive(true);
        setCameraRecoveryNeeded(false);
        if (ocrWorkerRef.current) {
          setOcrStatus("Looking for a student number...");
          startOcrLoopRef.current();
        }
      } catch {
        setCameraActive(false);
        setCameraRecoveryNeeded(true);
        setOcrStatus("Camera could not resume. Restart the camera to continue.");
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        pauseScanner();
      } else {
        void resumeScanner();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", pauseScanner);
    window.addEventListener("pageshow", resumeScanner);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", pauseScanner);
      window.removeEventListener("pageshow", resumeScanner);
    };
  }, [stopOcrLoop]);

  const pushScannerHistoryGuard = useCallback(() => {
    if (!historyGuardIdRef.current) {
      historyGuardIdRef.current =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `scanner-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    if (
      window.history.state?.examPulseScannerGuard === true &&
      window.history.state?.examPulseScannerGuardId === historyGuardIdRef.current
    ) {
      return;
    }

    window.history.pushState(
      {
        ...(window.history.state || {}),
        examPulseScannerGuard: true,
        examPulseScannerGuardId: historyGuardIdRef.current
      },
      "",
      window.location.href
    );
  }, []);

  const initializeScannerHistory = useCallback(() => {
    const currentState = window.history.state || {};
    if (
      currentState.examPulseScannerGuard === true &&
      typeof currentState.examPulseScannerGuardId === "string"
    ) {
      historyGuardIdRef.current = currentState.examPulseScannerGuardId;
      return;
    }

    if (!historyGuardIdRef.current) {
      historyGuardIdRef.current =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `scanner-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    window.history.replaceState(
      {
        ...currentState,
        examPulseScannerBase: true,
        examPulseScannerGuard: false,
        examPulseScannerGuardId: historyGuardIdRef.current
      },
      "",
      window.location.href
    );
    pushScannerHistoryGuard();
  }, [pushScannerHistoryGuard]);

  useEffect(() => {
    if (!user) {
      historyGuardActiveRef.current = false;
      return undefined;
    }

    historyGuardActiveRef.current = true;
    lastBackHandledAtRef.current = 0;
    initializeScannerHistory();

    function handleBrowserBack() {
      if (!historyGuardActiveRef.current) {
        return;
      }

      const now = Date.now();
      if (now - lastBackHandledAtRef.current < 450) {
        pushScannerHistoryGuard();
        setStatusMessage("Back already handled. Use the on-screen controls if needed.");
        return;
      }
      lastBackHandledAtRef.current = now;

      const action = getScannerBackAction({
        busy: busyRef.current,
        lookupPending: lookupPendingRef.current,
        scanPaused: scanPausedRef.current,
        hasRoom: Boolean(selectedRoomRef.current)
      });

      if (action === "wait") {
        pushScannerHistoryGuard();
        setStatusMessage("Please wait for the current action to finish.");
        return;
      }

      if (action === "cancel-review") {
        resetForNextScan();
        pushScannerHistoryGuard();
        setStatusMessage("Scan cancelled. Continue with the next student.");
        return;
      }

      if (action === "room-selection") {
        stopCamera();
        pushScannerHistoryGuard();
        setStatusMessage("Returned to room selection.");
        return;
      }

      pushScannerHistoryGuard();
      setStatusMessage("Use Sign Out if you want to leave the scanner.");
    }

    window.addEventListener("popstate", handleBrowserBack);

    return () => {
      historyGuardActiveRef.current = false;
      window.removeEventListener("popstate", handleBrowserBack);
    };
  }, [initializeScannerHistory, pushScannerHistoryGuard, resetForNextScan, stopCamera, user]);

  async function signIn() {
    const normalizedCode = normalizeAccessCode(accessCode);
    if (!normalizedCode) {
      setStatusMessage("Enter your invigilator access code.");
      return;
    }

    setBusy(true);
    setStatusMessage("");
    try {
      const loginPayload = await requestJson<{ email: string }>(
        "access-login",
        "/api/mobile/access-login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessCode: normalizedCode })
        },
        10000
      );

      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      const { error } = await supabase.auth.signInWithPassword({
        email: loginPayload.email,
        password: normalizedCode
      });

      if (error) {
        throw new Error(error.message);
      }

      await loadCurrentUser();
      await loadRooms();
      setAccessCode("");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      cancelAllRequests();
      await getSupabaseBrowserClient().auth.signOut();
    } finally {
      stopCamera();
      setUser(null);
      setRooms([]);
      setSelectedRoom(null);
      setRoomsLoading(false);
      setBusy(false);
    }
  }

  async function lookupStudent(nextStudentId: string, source: "ocr" | "manual" = "ocr") {
    const currentRoom = selectedRoomRef.current;
    if (!currentRoom) {
      return;
    }

    const normalizedId = nextStudentId.trim();
    if (!normalizedId) {
      return;
    }

    setBusy(true);
    setLastSource(source);
    setStudentId(normalizedId);
    setLookupPending(true);
    setLastLookup(null);
    setStatusMessage("Checking student...");
    scanPausedRef.current = true;
    setScanPaused(true);
    try {
      const payload = await requestJson<{ result: LookupResult }>(
        "lookup",
        "/api/attendance/lookup",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examSessionId: currentRoom.examSessionId,
            roomId: currentRoom.id,
            studentId: normalizedId
          })
        },
        8000
      );

      setLastLookup(payload.result);
      if (payload.result.status === "ready_to_mark") {
        setStatusMessage("Student is in the correct room.");
      } else if (payload.result.status === "wrong_room") {
        setStatusMessage(
          `Wrong room. Expected ${payload.result.expectedRoom.code}, zone ${payload.result.allocation.zone}.`
        );
      } else if (payload.result.status === "already_marked") {
        setStatusMessage(`Already marked at ${payload.result.attendance.createdAt}.`);
      } else {
        setStatusMessage("Student not found. Edit the number if OCR misread it, then look up again.");
      }
    } catch (error) {
      if (!(error instanceof ScannerRequestError && error.kind === "cancelled")) {
        setStatusMessage(error instanceof Error ? error.message : "Lookup failed.");
      }
    } finally {
      setLookupPending(false);
      setBusy(false);
    }
  }

  async function markStudent(overrides: Partial<MarkAttendanceRequest> = {}) {
    const currentRoom = selectedRoomRef.current;
    const currentUser = userRef.current;
    if (!currentRoom || !currentUser) {
      return;
    }

    const normalizedId = (overrides.studentId || studentId).trim();
    if (!normalizedId) {
      setStatusMessage("No student number selected.");
      return;
    }

    setBusy(true);
    let queuedRequestId: string | null = null;
    try {
      const deviceId = getDeviceId();
      const action = overrides.action || "mark_present";
      const nextComment = comment.trim() || undefined;
      const fingerprint = JSON.stringify({
        examSessionId: currentRoom.examSessionId,
        roomId: currentRoom.id,
        studentId: normalizedId,
        source: lastSource,
        deviceId,
        action,
        overrideWrongRoom: overrides.overrideWrongRoom ?? false,
        comment: nextComment || null
      });
      const requestId = markIdempotencyRef.current!.get(fingerprint);
      const requestBody: MarkAttendanceRequest = {
        requestId,
        examSessionId: currentRoom.examSessionId,
        roomId: currentRoom.id,
        studentId: normalizedId,
        source: lastSource,
        userId: currentUser.id,
        deviceId,
        action,
        comment: nextComment,
        ...overrides
      };
      queuedRequestId = requestId;

      await getOutbox().enqueue({
        id: requestId,
        request: requestBody,
        examSessionId: currentRoom.examSessionId,
        roomId: currentRoom.id,
        studentId: normalizedId,
        source: lastSource,
        comment: nextComment,
        overrideWrongRoom: requestBody.overrideWrongRoom ?? false,
        action,
        deviceId,
        userId: currentUser.id,
        queuedAt: new Date().toISOString()
      });
      await refreshOutbox();

      const payload = await requestJson<MarkResponse>(
        `mark-${requestId}`,
        "/api/attendance/mark",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        },
        12000
      );

      await getOutbox().complete(requestId);
      await refreshOutbox();
      applyMarkSuccess(payload, normalizedId);
      markIdempotencyRef.current?.clear();
      window.setTimeout(resetForNextScan, 180);
      loadLiveState(currentRoom.id).catch(() => undefined);
    } catch (error) {
      if (!queuedRequestId) {
        setStatusMessage(
          error instanceof Error
            ? error.message
            : "Unable to save attendance safely on this device."
        );
      } else {
        const disposition = classifyOutboxError(error);
        const message = error instanceof Error ? error.message : "Unable to mark attendance.";
        if (disposition === "retry") {
          await getOutbox().markRetry(queuedRequestId, message, getRetryDelayMs(1));
          setBackendState(navigator.onLine ? "unreachable" : "offline");
          setStatusMessage("Saved on this device. Attendance is pending synchronization.");
          setLocalRecentChips((current) => [{
            key: `pending-${queuedRequestId}`,
            label: normalizedId,
            detail: "Pending sync",
            tone: "warn" as const
          }, ...current].slice(0, 3));
          markIdempotencyRef.current?.clear();
          window.setTimeout(resetForNextScan, 450);
        } else {
          await getOutbox().markTerminal(queuedRequestId, disposition, message);
          setStatusMessage(
            disposition === "conflict"
              ? `Attendance needs review: ${message}`
              : `Attendance was not marked: ${message}`
          );
        }
        await refreshOutbox();
      }
    } finally {
      setBusy(false);
    }
  }

  async function startCamera(room: RoomWithSession) {
    cancelRequests("lookup", "live-state");
    stopOcrLoop();
    releaseCameraStream();
    selectedRoomRef.current = room;
    setSelectedRoom(room);
    setStatusMessage("");
    setOcrStatus("Starting camera...");
    setCameraActive(true);
    setCameraRecoveryNeeded(false);
    setScanHold(false);
    resetForNextScan();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      streamRef.current = stream;
      const videoTrack = stream.getVideoTracks()[0] as TorchMediaTrack | undefined;
      if (videoTrack) {
        videoTrack.onended = () => {
          if (!selectedRoomRef.current) {
            return;
          }
          stopOcrLoop();
          streamRef.current = null;
          if (videoRef.current) {
            videoRef.current.srcObject = null;
          }
          setCameraActive(false);
          setCameraRecoveryNeeded(true);
          setTorchSupported(false);
          setTorchEnabled(false);
          setTorchMessage("");
          setOcrStatus("Camera stopped. Restart the camera to continue.");
        };
      }
      const supportsTorch = trackSupportsTorch(videoTrack);
      setTorchSupported(supportsTorch);
      setTorchEnabled(false);
      setTorchMessage(
        supportsTorch ? "" : "Torch is not available in this browser."
      );

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if (!ocrWorkerRef.current) {
        setOcrStatus("Loading OCR engine...");
        try {
          await loadOcrWorker();
        } catch (error) {
          setOcrStatus("");
          setStatusMessage(
            describeOcrLoadError(error)
          );
          return;
        }
      }

      setOcrStatus("Looking for a student number...");
      startOcrLoop();
    } catch (error) {
      setCameraActive(false);
      setOcrStatus("");
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Camera permission failed. Check browser permissions."
      );
    }
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0] as TorchMediaTrack | undefined;
    if (!track || !trackSupportsTorch(track)) {
      setTorchSupported(false);
      setTorchMessage("Torch is not available in this browser.");
      return;
    }

    const nextTorchState = !torchEnabled;
    try {
      await track.applyConstraints({
        advanced: [{ torch: nextTorchState }]
      });
      setTorchEnabled(nextTorchState);
      setTorchSupported(true);
      setTorchMessage(nextTorchState ? "Torch on." : "Torch off.");
    } catch (error) {
      setTorchMessage(
        error instanceof Error
          ? `Torch failed: ${error.message}`
          : "Torch failed in this browser."
      );
    }
  }

  async function runOcrScan() {
    if (
      busyRef.current ||
      scanPausedRef.current ||
      !ocrWorkerRef.current ||
      !videoRef.current ||
      !canvasRef.current
    ) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const scanRegion = scanRegionRef.current;
    if (!video.videoWidth || !video.videoHeight || !scanRegion) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const videoRect = video.getBoundingClientRect();
    const regionRect = scanRegion.getBoundingClientRect();
    const coverScale = Math.max(
      videoRect.width / video.videoWidth,
      videoRect.height / video.videoHeight
    );
    const renderedVideoWidth = video.videoWidth * coverScale;
    const renderedVideoHeight = video.videoHeight * coverScale;
    const hiddenX = Math.max(0, (renderedVideoWidth - videoRect.width) / 2);
    const hiddenY = Math.max(0, (renderedVideoHeight - videoRect.height) / 2);
    const sourceX = Math.max(
      0,
      Math.round((regionRect.left - videoRect.left + hiddenX) / coverScale)
    );
    const sourceY = Math.max(
      0,
      Math.round((regionRect.top - videoRect.top + hiddenY) / coverScale)
    );
    const sourceWidth = Math.min(
      video.videoWidth - sourceX,
      Math.round(regionRect.width / coverScale)
    );
    const sourceHeight = Math.min(
      video.videoHeight - sourceY,
      Math.round(regionRect.height / coverScale)
    );

    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return;
    }

    const outputWidth = getOcrCanvasWidth(sourceWidth);
    const outputHeight = Math.round(outputWidth * (sourceHeight / sourceWidth));
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    context.drawImage(
      video,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      outputWidth,
      outputHeight
    );

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    preprocessingBuffersRef.current = preprocessLowLightImageData(
      imageData,
      preprocessingBuffersRef.current
    );
    context.putImageData(imageData, 0, 0);

    setOcrStatus("Reading red box with ONNX OCR...");
    const [result] = await ocrWorkerRef.current.predict(canvas, {
      textDetLimitSideLen: 640,
      textDetLimitType: "max",
      textDetThresh: 0.25,
      textDetBoxThresh: 0.35,
      textDetUnclipRatio: 1.6,
      textRecScoreThresh: 0.15
    });
    const recognizedText = (result?.items || []).map((item) => item.text).join(" ");
    const candidate = extractStudentIdCandidate(recognizedText);

    if (!candidate) {
      setOcrStatus("Looking for a student number...");
      lastCandidateRef.current = null;
      return;
    }

    setOcrStatus(`Detected candidate: ${candidate}`);
    const now = Date.now();
    if (
      lastCandidateRef.current?.value === candidate &&
      now - lastCandidateRef.current.seenAt < 2500
    ) {
      lastCandidateRef.current = {
        value: candidate,
        count: lastCandidateRef.current.count + 1,
        seenAt: now
      };
    } else {
      lastCandidateRef.current = { value: candidate, count: 1, seenAt: now };
    }

    if (lastCandidateRef.current.count >= 2) {
      await lookupStudent(candidate, "ocr");
    }
  }

  runOcrScanRef.current = runOcrScan;

  async function loadOcrWorker() {
    if (ocrWorkerRef.current) {
      return ocrWorkerRef.current;
    }

    if (!ocrLoadPromiseRef.current) {
      const loadPromise = createDigitOcrWorker(setOcrStatus).then(async (worker) => {
        if (!componentActiveRef.current) {
          await worker.dispose();
          throw new Error("OCR loading was cancelled because the scanner was closed.");
        }

        ocrWorkerRef.current = worker;
        return worker;
      });
      ocrLoadPromiseRef.current = loadPromise;
      void loadPromise.catch(() => {
        if (ocrLoadPromiseRef.current === loadPromise) {
          ocrLoadPromiseRef.current = null;
        }
      });
    }

    return withTimeout(
      ocrLoadPromiseRef.current,
      onnxModelTimeoutMs,
      "ONNX OCR model loading"
    );
  }

  async function retryOcrLoad() {
    if (ocrLoading || ocrWorkerRef.current) {
      return;
    }

    setOcrLoading(true);
    setStatusMessage("");
    try {
      await loadOcrWorker();
      setOcrStatus("Looking for a student number...");
      startOcrLoop();
    } catch (error) {
      setOcrStatus("");
      setStatusMessage(
          describeOcrLoadError(error)
      );
    } finally {
      setOcrLoading(false);
    }
  }

  function startOcrLoop() {
    stopOcrLoop();
    if (document.visibilityState === "hidden") {
      return;
    }
    ocrLoopRef.current?.start();
  }

  startOcrLoopRef.current = startOcrLoop;

  if (sessionRestoring) {
    return (
      <div className="web-scan-shell">
        <section className="web-scan-card">
          <ExamPulseLogo className="web-brand-logo" />
          <h1>Preparing Scanner</h1>
          <p className="subtle">Checking your secure invigilator session...</p>
        </section>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="web-scan-shell">
        <section className="web-scan-card">
          <ExamPulseLogo className="web-brand-logo" />
          <h1>Invigilator Web Login</h1>
          <p className="subtle">
            Use the same access code as the Android app. This scanner works from
            Safari or Chrome using the browser camera.
          </p>
          <input
            autoCapitalize="characters"
            autoComplete="one-time-code"
            value={accessCode}
            onChange={(event) => setAccessCode(event.target.value)}
            placeholder="AMS-XXXX-XXXX"
          />
          <button type="button" onClick={signIn} disabled={busy}>
            {busy ? "Signing in..." : "Sign In"}
          </button>
          {statusMessage ? <p className="pill warn">{statusMessage}</p> : null}
        </section>
      </div>
    );
  }

  if (!selectedRoom) {
    return (
      <div className="web-scan-shell">
        <section className="web-scan-card">
          <ExamPulseLogo className="web-brand-logo" />
          <div className="inline-actions" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="kicker">Assigned rooms</div>
              <h1>Choose Room</h1>
              <p className="subtle">{user.fullName}</p>
            </div>
            <button className="secondary" type="button" onClick={signOut} disabled={busy}>
              Sign Out
            </button>
          </div>
          {statusMessage ? <p className="pill warn">{statusMessage}</p> : null}
          {roomsLoading ? (
            <div className="web-loading-card">
              <strong>Loading your assigned rooms...</strong>
              <span>Please wait while we check active exam room assignments.</span>
            </div>
          ) : (
            <div className="web-room-grid">
              {rooms.map((room) => (
                <button
                  key={room.id}
                  className="web-room-card"
                  type="button"
                  onClick={() => startCamera(room)}
                >
                  <strong>{room.code}</strong>
                  <span>
                    {room.session?.name || "Exam"} | {room.session?.startTime || ""}
                  </span>
                </button>
              ))}
            </div>
          )}
          {!roomsLoading && !rooms.length ? (
            <div className="web-empty-state">
              <strong>No active rooms assigned</strong>
              <span>
                Ask the administrator to assign this invigilator to an active exam room.
              </span>
              <button
                className="secondary"
                type="button"
                onClick={() =>
                  loadRooms().catch((error) =>
                    setStatusMessage(
                      error instanceof Error ? error.message : "Unable to load rooms."
                    )
                  )
                }
                disabled={busy || roomsLoading}
              >
                Refresh Rooms
              </button>
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  const reviewTone = lookupPending
    ? "pending"
    : lastLookup?.status === "ready_to_mark"
      ? "ready"
      : lastLookup?.status === "wrong_room"
        ? "wrong"
        : lastLookup?.status === "already_marked"
          ? "done"
          : lastLookup?.status === "student_not_found"
            ? "not-found"
            : "neutral";
  const recentAttendance = liveState?.recentAttendance || [];
  const recentMismatchStudentIds = new Set(
    recentAttendance
      .filter((item) => item.roomMismatch)
      .map((item) => item.studentId)
  );
  const serverRecentScanChips: RecentScanChip[] = [
    ...recentAttendance.map((item) => ({
      key: `attendance-${item.createdAt}-${item.studentId}`,
      label: item.studentId,
      detail: item.roomMismatch ? "Mismatch" : "Present",
      tone: item.roomMismatch ? "warn" as const : "ok" as const
    })),
    ...(liveState?.recentIncidents || [])
      .filter(
        (item) =>
          item.incidentType !== "wrong_room_present_override" ||
          !item.studentId ||
          !recentMismatchStudentIds.has(item.studentId)
      )
      .map((item) => ({
        key: `incident-${item.createdAt}-${item.studentId || item.incidentType}`,
        label: item.studentId || "Unknown",
        detail: item.incidentType.replaceAll("_", " "),
        tone: "warn" as const
      }))
  ];
  const serverChipStudentIds = new Set(serverRecentScanChips.map((chip) => chip.label));
  const recentScanChips = [
    ...localRecentChips.filter((chip) => !serverChipStudentIds.has(chip.label)),
    ...serverRecentScanChips
  ].slice(0, 3);

  return (
    <div className="web-camera-page">
      <video ref={videoRef} className="web-camera-video" playsInline muted />
      <canvas ref={canvasRef} hidden />
      <div className="web-camera-overlay">
        <div className="web-camera-top">
          <button className="secondary" type="button" onClick={stopCamera}>
            Back
          </button>
          <div>
            <div className="kicker">Live attendance</div>
            <h1>{selectedRoom.code}</h1>
            <p>{selectedRoom.session?.name || "Exam"} | {selectedRoom.session?.startTime}</p>
          </div>
          <button
            className="secondary web-torch-button"
            type="button"
            onClick={toggleTorch}
            disabled={!torchSupported}
          >
            {torchEnabled ? "Torch Off" : "Torch On"}
          </button>
        </div>

        <div className={`web-status-strip state-${backendState}`}>
          <span>{backendLabel}</span>
          <span>Room {selectedRoom.code}</span>
          <span>Last sync {lastSyncAt || "not yet"}</span>
          {outboxCounts.total ? (
            <span>
              Queue {outboxCounts.pending} pending
              {outboxCounts.syncing ? `, ${outboxCounts.syncing} syncing` : ""}
              {outboxCounts.failed ? `, ${outboxCounts.failed} failed` : ""}
              {outboxCounts.conflict ? `, ${outboxCounts.conflict} conflict` : ""}
            </span>
          ) : null}
        </div>

        <div className="web-ocr-status web-ocr-status-top">
          {scanHold && !scanPaused
            ? "Scanning paused. Use manual mode or resume scanning."
            : cameraActive
              ? ocrStatus || "Camera active"
              : "Camera stopped"}
        </div>

        <div className="web-scan-guide">
          <div ref={scanRegionRef} className="web-scan-region" />
          <span>Place student number here</span>
        </div>

        <div className="web-camera-bottom">
          <div className="web-manual-row">
            <input
              ref={manualInputRef}
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              inputMode="numeric"
              placeholder="Manual student number"
            />
            <button
              className="secondary"
              type="button"
              onClick={() => lookupStudent(studentId, "manual")}
              disabled={busy}
            >
              Lookup
            </button>
          </div>
          <div className="web-camera-actions">
            <button
              className="secondary"
              type="button"
              onClick={() => setScanHold((value) => !value)}
              disabled={scanPaused}
            >
              {scanHold ? "Resume Scanning" : "Pause Scanning"}
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => manualInputRef.current?.focus()}
            >
              Manual Mode
            </button>
          </div>
          <div className="web-stat-row">
            <div>
              <strong>{roomStats.present}</strong>
              <span>Present</span>
            </div>
            <div>
              <strong>{roomStats.allocated}</strong>
              <span>Allocated</span>
            </div>
            <div>
              <strong>{roomStats.mismatch}</strong>
              <span>Mismatch</span>
            </div>
            <div>
              <strong>{roomStats.redirected}</strong>
              <span>Redirected</span>
            </div>
          </div>
          {recentScanChips.length ? (
            <div className="recent-chip-row">
              {recentScanChips.map((chip) => (
                <span key={chip.key} className={`recent-chip ${chip.tone}`}>
                  <strong>{chip.label}</strong>
                  <span>{chip.detail}</span>
                </span>
              ))}
            </div>
          ) : null}
          {outboxCounts.total ? (
            <details className="scanner-outbox-panel">
              <summary>
                Attendance sync queue
                <span>{outboxCounts.total} item{outboxCounts.total === 1 ? "" : "s"}</span>
              </summary>
              <div className="scanner-outbox-list">
                {outboxItems.map((item) => (
                  <div className={`scanner-outbox-item state-${item.status}`} key={item.id}>
                    <div>
                      <strong>{item.studentId}</strong>
                      <span>
                        {item.status === "pending"
                          ? "Pending synchronization"
                          : item.status === "syncing"
                            ? "Synchronizing"
                            : item.status === "conflict"
                              ? "Conflict needs review"
                              : "Could not synchronize"}
                      </span>
                      {item.lastError ? <small>{item.lastError}</small> : null}
                    </div>
                    {item.status === "failed" || item.status === "conflict" ? (
                      <div className="scanner-outbox-actions">
                        <button
                          className="secondary compact"
                          type="button"
                          onClick={() => retryOutboxItem(item.id)}
                        >
                          Retry
                        </button>
                        <button
                          className="secondary compact"
                          type="button"
                          onClick={() => acknowledgeOutboxItem(item)}
                        >
                          Acknowledge
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          {torchMessage ? <div className="web-camera-note">{torchMessage}</div> : null}
          {cameraRecoveryNeeded ? (
            <button
              className="secondary"
              type="button"
              onClick={() => startCamera(selectedRoom)}
              disabled={busy}
            >
              Restart Camera
            </button>
          ) : null}
          {cameraActive && !ocrWorkerRef.current && statusMessage ? (
            <button
              className="secondary"
              type="button"
              onClick={retryOcrLoad}
              disabled={busy || ocrLoading}
            >
              {ocrLoading ? "Loading OCR..." : "Retry OCR Load"}
            </button>
          ) : null}
        </div>
      </div>

      {scanPaused ? (
        <div className="web-review-sheet">
          <div className={`web-review-card state-${reviewTone}`}>
            <h2>
              {lookupPending
                ? "Checking student..."
                : lastLookup?.status === "wrong_room"
                ? "Wrong room detected"
                : lastLookup?.status === "ready_to_mark"
                  ? "Ready to mark"
                  : lastLookup?.status === "already_marked"
                    ? "Already marked"
                    : lastLookup?.status === "student_not_found"
                      ? "Student not found"
                      : "Review scan"}
            </h2>
            <input
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              inputMode="numeric"
              placeholder="Student number"
              readOnly={lookupPending}
            />
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Comments (optional)"
              rows={3}
              disabled={lookupPending}
            />
            {statusMessage ? <p className="subtle">{statusMessage}</p> : null}
            <div className="inline-actions">
              {lookupPending ? (
                <>
                  <button className="secondary" type="button" disabled>
                    Checking...
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    onClick={resetForNextScan}
                  >
                    Cancel Scan
                  </button>
                </>
              ) : (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => lookupStudent(studentId, lastSource)}
                  disabled={busy}
                >
                  Lookup Edited ID
                </button>
              )}
              {lastLookup?.status === "ready_to_mark" ? (
                <button type="button" onClick={() => markStudent()} disabled={busy}>
                  Mark Present
                </button>
              ) : null}
              {lastLookup?.status === "wrong_room" ? (
                <>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() =>
                      markStudent({
                        action: "redirect_only",
                        studentId: lastLookup.studentId
                      })
                    }
                    disabled={busy}
                  >
                    Send To Room
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      markStudent({
                        action: "mark_present",
                        studentId: lastLookup.studentId,
                        overrideWrongRoom: true
                      })
                    }
                    disabled={busy}
                  >
                    Mark Anyway
                  </button>
                </>
              ) : null}
              {lastLookup?.status === "already_marked" ||
              lastLookup?.status === "student_not_found" ? (
                <button type="button" onClick={resetForNextScan} disabled={busy}>
                  Continue Scan
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
