"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LookupResult,
  MarkAttendanceRequest,
  Room,
  User
} from "@algo-attendance/shared";
import { ExamPulseLogo } from "@/components/exam-pulse-logo";
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
  activity?: Array<{
    type: "present" | "mismatch" | "incident";
    studentId?: string;
    createdAt: string;
    label: string;
    comment?: string;
  }>;
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

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    throw new Error(payload.message || "Request failed.");
  }
  return payload;
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
  const ocr = await withTimeout(
    PaddleOCR.create({
      lang: "en",
      ocrVersion: "PP-OCRv5",
      worker: false,
      textDetectionBatchSize: 1,
      textRecognitionBatchSize: 4,
      ortOptions: {
        backend: "wasm",
        numThreads: 1,
        simd: true,
        wasmPaths: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/"
      }
    }),
    onnxModelTimeoutMs,
    "ONNX OCR model loading"
  );

  onStatus("ONNX OCR ready.");
  return ocr as OcrWorker;
}

function preprocessLowLightImageData(imageData: ImageData) {
  const { data, width, height } = imageData;
  const gray = new Uint8ClampedArray(width * height);
  let min = 255;
  let max = 0;

  for (let pixelIndex = 0, dataIndex = 0; pixelIndex < gray.length; pixelIndex += 1, dataIndex += 4) {
    const value = Math.round(
      data[dataIndex] * 0.299 + data[dataIndex + 1] * 0.587 + data[dataIndex + 2] * 0.114
    );
    gray[pixelIndex] = value;
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }

  const range = Math.max(20, max - min);
  for (let index = 0; index < gray.length; index += 1) {
    const normalized = ((gray[index] - min) / range) * 255;
    gray[index] = Math.max(0, Math.min(255, Math.round(normalized * 1.18 - 16)));
  }

  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      rowSum += gray[y * width + x];
      const integralIndex = (y + 1) * (width + 1) + x + 1;
      integral[integralIndex] = integral[integralIndex - (width + 1)] + rowSum;
    }
  }

  const radius = Math.max(8, Math.round(Math.min(width, height) / 28));
  for (let y = 0, dataIndex = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);

    for (let x = 0; x < width; x += 1, dataIndex += 4) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * (width + 1) + x1 + 1] -
        integral[y0 * (width + 1) + x1 + 1] -
        integral[(y1 + 1) * (width + 1) + x0] +
        integral[y0 * (width + 1) + x0];
      const localMean = sum / area;
      const value = gray[y * width + x] > localMean - 8 ? 255 : 0;
      data[dataIndex] = value;
      data[dataIndex + 1] = value;
      data[dataIndex + 2] = value;
      data[dataIndex + 3] = 255;
    }
  }
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
  const scanTimerRef = useRef<number | null>(null);
  const userRef = useRef<User | null>(null);
  const selectedRoomRef = useRef<RoomWithSession | null>(null);
  const busyRef = useRef(false);
  const scanPausedRef = useRef(false);
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
  const [busy, setBusy] = useState(false);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [lookupPending, setLookupPending] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [scanPaused, setScanPaused] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [torchMessage, setTorchMessage] = useState("");
  const [lastSyncAt, setLastSyncAt] = useState("");
  const [scanHold, setScanHold] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityQuery, setActivityQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState<
    "all" | "present" | "mismatch" | "incident"
  >("all");

  const roomStats = useMemo(
    () => ({
      allocated: liveState?.summary?.allocatedCount ?? 0,
      present: liveState?.summary?.presentCount ?? 0,
      mismatch: liveState?.summary?.mismatchPresentCount ?? 0,
      redirected: liveState?.summary?.redirectedCount ?? 0
    }),
    [liveState]
  );

  const resetForNextScan = useCallback(() => {
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
    const payload = await readJson<{ user: User }>(await fetch("/api/auth/me"));
    userRef.current = payload.user;
    setUser(payload.user);
    return payload.user;
  }, []);

  const loadRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const payload = await readJson<{ rooms: RoomWithSession[] }>(
        await fetch("/api/mobile/my-rooms")
      );
      setRooms(payload.rooms);
      return payload.rooms;
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  const loadLiveState = useCallback(async (roomId: string) => {
    const payload = await readJson<LiveRoomState>(
      await fetch(`/api/rooms/${roomId}/live`)
    );
    setLiveState(payload);
    setLastSyncAt(new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }));
  }, []);

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
    if (scanPaused) {
      return;
    }

    scanPausedRef.current = scanHold;
  }, [scanHold, scanPaused]);

  useEffect(() => {
    if (!selectedRoom) {
      return undefined;
    }

    loadLiveState(selectedRoom.id).catch((error) =>
      setStatusMessage(error instanceof Error ? error.message : "Unable to load room state.")
    );
    const intervalId = window.setInterval(() => {
      loadLiveState(selectedRoom.id).catch(() => undefined);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [loadLiveState, selectedRoom]);

  useEffect(() => {
    return () => {
      if (scanTimerRef.current) {
        window.clearInterval(scanTimerRef.current);
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      ocrWorkerRef.current?.dispose().catch(() => undefined);
    };
  }, []);

  async function signIn() {
    const normalizedCode = normalizeAccessCode(accessCode);
    if (!normalizedCode) {
      setStatusMessage("Enter your invigilator access code.");
      return;
    }

    setBusy(true);
    setStatusMessage("");
    try {
      const loginPayload = await readJson<{ email: string }>(
        await fetch("/api/mobile/access-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessCode: normalizedCode })
        })
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
      const payload = await readJson<{ result: LookupResult }>(
        await fetch("/api/attendance/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            examSessionId: currentRoom.examSessionId,
            roomId: currentRoom.id,
            studentId: normalizedId
          })
        })
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
      setStatusMessage(error instanceof Error ? error.message : "Lookup failed.");
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
    try {
      const requestBody: MarkAttendanceRequest = {
        examSessionId: currentRoom.examSessionId,
        roomId: currentRoom.id,
        studentId: normalizedId,
        source: lastSource,
        userId: currentUser.id,
        deviceId: getDeviceId(),
        action: "mark_present",
        comment: comment.trim() || undefined,
        ...overrides
      };

      const payload = await readJson<{
        event?: { id: string; roomMismatch: boolean; createdAt: string };
        incident?: { id: string; incidentType: string; createdAt: string };
        result: LookupResult;
      }>(
        await fetch("/api/attendance/mark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        })
      );

      setStatusMessage(
        payload.event?.roomMismatch
          ? "Present marked with room mismatch flag."
          : payload.event
            ? "Attendance marked."
            : "Incident logged."
      );
      await loadLiveState(currentRoom.id);
      window.setTimeout(resetForNextScan, 650);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to mark attendance.");
    } finally {
      setBusy(false);
    }
  }

  async function startCamera(room: RoomWithSession) {
    selectedRoomRef.current = room;
    setSelectedRoom(room);
    setStatusMessage("");
    setOcrStatus("Starting camera...");
    setCameraActive(true);
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
          ocrWorkerRef.current = await createDigitOcrWorker(setOcrStatus);
        } catch (error) {
          setOcrStatus("");
          setStatusMessage(
            error instanceof Error
              ? error.message
              : "Unable to load ONNX OCR models. Check the connection and try again."
          );
          return;
        }
      }

      setOcrStatus("Looking for a student number...");
      if (scanTimerRef.current) {
        window.clearInterval(scanTimerRef.current);
      }
      scanTimerRef.current = window.setInterval(() => {
        runOcrScan().catch((error) =>
          setOcrStatus(error instanceof Error ? error.message : "OCR scan failed.")
        );
      }, 900);
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

  function stopCamera() {
    if (scanTimerRef.current) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setTorchSupported(false);
    setTorchEnabled(false);
    setTorchMessage("");
    setScanHold(false);
    scanPausedRef.current = false;
    setScanPaused(false);
    selectedRoomRef.current = null;
    setSelectedRoom(null);
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

    const outputWidth = Math.min(760, Math.max(420, sourceWidth));
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
    preprocessLowLightImageData(imageData);
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

    setOcrStatus(
      `Detected candidate: ${candidate}${
        result?.metrics?.totalMs ? ` (${Math.round(result.metrics.totalMs)}ms)` : ""
      }`
    );
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
  const recentScanChips = [
    ...recentAttendance.map((item) => ({
      key: `attendance-${item.createdAt}-${item.studentId}`,
      label: item.studentId,
      detail: item.roomMismatch ? "Mismatch" : "Present",
      tone: item.roomMismatch ? "warn" : "ok"
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
        tone: "warn"
      }))
  ].slice(0, 3);
  const activityRows = useMemo(() => {
    const query = activityQuery.trim().toLowerCase();
    return (liveState?.activity || []).filter((item) => {
      if (activityFilter !== "all" && item.type !== activityFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return `${item.studentId || ""} ${item.label} ${item.comment || ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [activityFilter, activityQuery, liveState?.activity]);

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

        <div className="web-status-strip">
          <span>Connected</span>
          <span>Room {selectedRoom.code}</span>
          <span>Last sync {lastSyncAt || "pending"}</span>
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
            <div className="recent-activity-preview">
              <div className="recent-chip-row">
                {recentScanChips.map((chip) => (
                  <span key={chip.key} className={`recent-chip ${chip.tone}`}>
                    <strong>{chip.label}</strong>
                    <span>{chip.detail}</span>
                  </span>
                ))}
              </div>
              <button
                className="secondary compact-button"
                type="button"
                onClick={() => setActivityOpen(true)}
              >
                View Activity
              </button>
            </div>
          ) : null}
          {torchMessage ? <div className="web-camera-note">{torchMessage}</div> : null}
          {cameraActive && !ocrWorkerRef.current && statusMessage ? (
            <button
              className="secondary"
              type="button"
              onClick={() => startCamera(selectedRoom)}
              disabled={busy}
            >
              Retry OCR Load
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
      {activityOpen ? (
        <div className="web-activity-sheet" role="dialog" aria-modal="true">
          <div className="web-activity-panel">
            <div className="web-activity-header">
              <div>
                <div className="kicker">Room activity</div>
                <h2>{selectedRoom.code}</h2>
              </div>
              <button
                className="secondary compact-button"
                type="button"
                onClick={() => setActivityOpen(false)}
              >
                Close
              </button>
            </div>
            <input
              value={activityQuery}
              onChange={(event) => setActivityQuery(event.target.value)}
              placeholder="Search student ID or note"
              inputMode="search"
            />
            <div className="activity-filter-row">
              {(["all", "present", "mismatch", "incident"] as const).map((filter) => (
                <button
                  key={filter}
                  className={activityFilter === filter ? "secondary active-filter" : "secondary"}
                  type="button"
                  onClick={() => setActivityFilter(filter)}
                >
                  {filter === "all"
                    ? "All"
                    : filter === "mismatch"
                      ? "Mismatch"
                      : filter === "incident"
                        ? "Incidents"
                        : "Present"}
                </button>
              ))}
            </div>
            <div className="activity-list">
              {activityRows.length ? (
                activityRows.map((item) => (
                  <div
                    key={`${item.type}-${item.createdAt}-${item.studentId || item.label}`}
                    className={`activity-row ${item.type}`}
                  >
                    <div>
                      <strong>{item.studentId || "Unknown"}</strong>
                      <span>{item.label}</span>
                      {item.comment ? <small>{item.comment}</small> : null}
                    </div>
                    <time>
                      {new Date(item.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </time>
                  </div>
                ))
              ) : (
                <p className="subtle">No matching room activity.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
