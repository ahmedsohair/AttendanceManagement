export const scannerEvents = ["boundary_error", "runtime_error", "unhandled_rejection", "lookup", "mark", "sync", "ocr_init", "ocr_prediction", "camera"] as const;
export type ScannerEvent = typeof scannerEvents[number];
export type ScannerOutcome = "ok" | "error" | "cancelled";
export type ScannerMetric = { event: ScannerEvent; outcome: ScannerOutcome; durationMs: number | null };
const browsers = ["safari", "chrome", "edge", "firefox", "other"];
const devices = ["ios", "android", "other"];
export type ScannerHealth = { deviceId: string; pending: number; conflicts: number };
let scannerHealth: ScannerHealth | undefined;
export function setScannerHealth(health?: ScannerHealth) { scannerHealth = health; }

export function scannerPlatform(userAgent: string) {
  return {
    browser: /Edg(?:e|A|iOS)?\//.test(userAgent) ? "edge" : /Firefox\/|FxiOS\//.test(userAgent) ? "firefox"
      : /Chrome\/|CriOS\//.test(userAgent) ? "chrome" : /Safari\//.test(userAgent) ? "safari" : "other",
    device: /iPhone|iPad|iPod/.test(userAgent) ? "ios" : /Android/.test(userAgent) ? "android" : "other"
  };
}

export function validateScannerReport(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const report = value as Record<string, unknown>;
  if (Object.keys(report).some((key) => !["version", "browser", "device", "events", "health"].includes(key)) ||
      report.version !== 1 || !browsers.includes(report.browser as string) || !devices.includes(report.device as string) ||
      !Array.isArray(report.events) || report.events.length > 20) return null;
  let health: ScannerHealth | undefined;
  if (report.health !== undefined) {
    if (!report.health || typeof report.health !== "object" || Array.isArray(report.health)) return null;
    const h = report.health as Record<string, unknown>;
    if (Object.keys(h).some((key) => !["deviceId", "pending", "conflicts"].includes(key)) ||
        typeof h.deviceId !== "string" || !/^[a-zA-Z0-9.-]{10,100}$/.test(h.deviceId) ||
        ![h.pending, h.conflicts].every((n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100000)) return null;
    health = h as ScannerHealth;
  }
  if (!report.events.length && !health) return null;
  const events: ScannerMetric[] = [];
  for (const raw of report.events) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const metric = raw as Record<string, unknown>;
    if (Object.keys(metric).some((key) => !["event", "outcome", "durationMs"].includes(key)) ||
        !scannerEvents.includes(metric.event as ScannerEvent) || !["ok", "error", "cancelled"].includes(metric.outcome as string) ||
        !(metric.durationMs === null || (typeof metric.durationMs === "number" && Number.isInteger(metric.durationMs) && metric.durationMs >= 0 && metric.durationMs <= 600000))) return null;
    events.push({ event: metric.event as ScannerEvent, outcome: metric.outcome as ScannerOutcome, durationMs: metric.durationMs as number | null });
  }
  return { version: 1, browser: report.browser as string, device: report.device as string, events, ...(health ? { health } : {}) };
}

export function createScannerReporter({
  send, userAgent = "", now = Date.now
}: { send: (report: NonNullable<ReturnType<typeof validateScannerReport>>) => Promise<unknown>; userAgent?: string; now?: () => number }) {
  const platform = scannerPlatform(userAgent);
  let queue: ScannerMetric[] = [];
  let stopped = false;
  let sending = false;
  let windowStart = now();
  let sent = 0;
  const samples = new Map<string, number>();
  return {
    record(event: ScannerEvent, outcome: ScannerOutcome, durationMs?: number) {
      if (stopped) return;
      const time = now();
      if (time - windowStart >= 60000) { windowStart = time; sent = 0; samples.clear(); }
      const key = `${event}:${outcome}`;
      // Prediction is high frequency; keep one sample per outcome/minute, three for other events.
      const limit = event === "ocr_prediction" ? 1 : 3;
      if ((samples.get(key) || 0) >= limit || queue.length >= 20) return;
      samples.set(key, (samples.get(key) || 0) + 1);
      const metric = { event, outcome, durationMs: Number.isFinite(durationMs) && durationMs! >= 0 ? Math.min(600000, Math.round(durationMs!)) : null };
      if (validateScannerReport({ version: 1, ...platform, events: [metric] })) queue.push(metric);
    },
    async flush() {
      if (now() - windowStart >= 60000) { windowStart = now(); sent = 0; samples.clear(); }
      if (stopped || sending || (!queue.length && !scannerHealth) || sent >= 2) return;
      const events = queue;
      queue = [];
      sending = true;
      sent += 1;
      try { await send({ version: 1, ...platform, events, ...(scannerHealth ? { health: scannerHealth } : {}) }); }
      catch { /* Telemetry is lossy: never retry through the attendance outbox. */ }
      finally { sending = false; }
    },
    stop() { stopped = true; queue = []; samples.clear(); }
  };
}

let activeReporter: ReturnType<typeof createScannerReporter> | null = null;
export function setScannerReporter(reporter: ReturnType<typeof createScannerReporter> | null) { activeReporter = reporter; }
export function reportScannerEvent(event: ScannerEvent, outcome: ScannerOutcome, durationMs?: number) {
  try { activeReporter?.record(event, outcome, durationMs); } catch { /* Never interrupt attendance. */ }
}

export function observeScannerErrors(target: EventTarget) {
  const runtimeError = () => reportScannerEvent("runtime_error", "error");
  const rejection = () => reportScannerEvent("unhandled_rejection", "error");
  target.addEventListener("error", runtimeError);
  target.addEventListener("unhandledrejection", rejection);
  return () => {
    target.removeEventListener("error", runtimeError);
    target.removeEventListener("unhandledrejection", rejection);
  };
}

export async function measureScannerOperation<T>(event: ScannerEvent, operation: () => Promise<T>): Promise<T> {
  if (!activeReporter) return operation();
  const started = performance.now();
  try {
    const result = await operation();
    reportScannerEvent(event, "ok", performance.now() - started);
    return result;
  } catch (error) {
    const cancelled = error && typeof error === "object" && "kind" in error && error.kind === "cancelled";
    reportScannerEvent(event, cancelled ? "cancelled" : "error", performance.now() - started);
    throw error;
  }
}
