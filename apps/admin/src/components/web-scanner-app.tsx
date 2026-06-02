"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LookupResult,
  MarkAttendanceRequest,
  Room,
  User
} from "@algo-attendance/shared";
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

type OcrWorker = {
  setParameters(params: Record<string, string>): Promise<unknown>;
  recognize(image: HTMLCanvasElement): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
};

const deviceIdStorageKey = "ams-web-scanner-device-id";

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

async function createDigitOcrWorker(
  onStatus: (message: string) => void
): Promise<OcrWorker> {
  const tesseract = await import("tesseract.js");
  const worker = (await tesseract.createWorker("eng", 1, {
    logger: (message) => {
      if (message.status) {
        onStatus(
          message.progress
            ? `${message.status} ${Math.round(message.progress * 100)}%`
            : message.status
        );
      }
    }
  })) as OcrWorker;

  await worker.setParameters({
    tessedit_char_whitelist: "0123456789",
    tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT
  });

  return worker;
}

export function WebScannerApp() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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
  const [cameraActive, setCameraActive] = useState(false);
  const [scanPaused, setScanPaused] = useState(false);

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
    const payload = await readJson<{ rooms: RoomWithSession[] }>(
      await fetch("/api/mobile/my-rooms")
    );
    setRooms(payload.rooms);
    return payload.rooms;
  }, []);

  const loadLiveState = useCallback(async (roomId: string) => {
    const payload = await readJson<LiveRoomState>(
      await fetch(`/api/rooms/${roomId}/live`)
    );
    setLiveState(payload);
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
      ocrWorkerRef.current?.terminate().catch(() => undefined);
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
        setStatusMessage("Student not found in this exam session.");
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Lookup failed.");
    } finally {
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

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if (!ocrWorkerRef.current) {
        setOcrStatus("Loading OCR engine...");
        ocrWorkerRef.current = await createDigitOcrWorker(setOcrStatus);
      }

      setOcrStatus("Looking for a student number...");
      if (scanTimerRef.current) {
        window.clearInterval(scanTimerRef.current);
      }
      scanTimerRef.current = window.setInterval(() => {
        runOcrScan().catch((error) =>
          setOcrStatus(error instanceof Error ? error.message : "OCR scan failed.")
        );
      }, 1400);
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
    scanPausedRef.current = false;
    setScanPaused(false);
    selectedRoomRef.current = null;
    setSelectedRoom(null);
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
    if (!video.videoWidth || !video.videoHeight) {
      return;
    }

    const canvas = canvasRef.current;
    const maxWidth = 900;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const crop = {
      x: Math.round(canvas.width * 0.06),
      y: Math.round(canvas.height * 0.34),
      width: Math.round(canvas.width * 0.88),
      height: Math.round(canvas.height * 0.36)
    };
    const imageData = context.getImageData(crop.x, crop.y, crop.width, crop.height);
    const pixels = imageData.data;
    for (let index = 0; index < pixels.length; index += 4) {
      const gray = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
      const contrast = gray > 150 ? 255 : 0;
      pixels[index] = contrast;
      pixels[index + 1] = contrast;
      pixels[index + 2] = contrast;
    }

    canvas.width = crop.width;
    canvas.height = crop.height;
    context.putImageData(imageData, 0, 0);

    setOcrStatus("Reading...");
    const result = await ocrWorkerRef.current.recognize(canvas);
    const candidate = extractStudentIdCandidate(result.data.text || "");

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

  if (!user) {
    return (
      <div className="web-scan-shell">
        <section className="web-scan-card">
          <div className="kicker">Cross-platform scanner</div>
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
          {!rooms.length ? (
            <p className="subtle">No active exam rooms are assigned to this code.</p>
          ) : null}
        </section>
      </div>
    );
  }

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
        </div>

        <div className="web-scan-guide">
          <span>Place student number here</span>
        </div>

        <div className="web-camera-bottom">
          <div className="web-manual-row">
            <input
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
          <div className="web-ocr-status">
            {cameraActive ? ocrStatus || "Camera active" : "Camera stopped"}
          </div>
        </div>
      </div>

      {scanPaused ? (
        <div className="web-review-sheet">
          <div className="web-review-card">
            <h2>
              {lastLookup?.status === "wrong_room"
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
            />
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Comments (optional)"
              rows={3}
            />
            {statusMessage ? <p className="subtle">{statusMessage}</p> : null}
            <div className="inline-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => lookupStudent(studentId, lastSource)}
                disabled={busy}
              >
                Recheck
              </button>
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
