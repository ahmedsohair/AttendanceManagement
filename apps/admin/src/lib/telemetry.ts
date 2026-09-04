const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const codes = new Set([
  "OK", "UNAUTHENTICATED", "FORBIDDEN", "MALFORMED_REQUEST",
  "PAYLOAD_TOO_LARGE", "VALIDATION_ERROR", "NOT_FOUND", "CONFLICT",
  "RATE_LIMITED", "TIMEOUT", "OFFLINE", "INTERNAL_ERROR", "SERVICE_UNAVAILABLE",
  "ready_to_mark", "already_marked", "wrong_room", "student_not_found"
]);
const fixedRoutes = new Set([
  "/api/attendance/lookup", "/api/attendance/mark", "/api/auth/me",
  "/api/auth/login", "/api/auth/reset-password", "/api/webhooks/resend",
  "/api/auth/admin-login", "/api/auth/dev-login", "/api/mobile/access-login",
  "/api/mobile/my-rooms", "/api/invigilators", "/api/invigilators/email-code",
  "/api/exam-sessions/import"
]);

export function telemetryRoute(url: string) {
  try {
    const path = new URL(url).pathname;
    if (fixedRoutes.has(path)) return path;
    const dynamic = path.match(/^\/api\/(rooms|reports|email-jobs|exam-sessions|invigilators)\/([^/]+)(?:\/([^/]+))?$/);
    if (!dynamic || !uuidPattern.test(dynamic[2])) return "/api/unknown";
    const allowedActions: Record<string, string[]> = {
      rooms: ["live"], reports: ["export"], "email-jobs": ["", "process", "retry"],
      "exam-sessions": ["assignments", "close", "delete", "publish", "email-instructions"],
      invigilators: ["", "access-code"]
    };
    const action = dynamic[3] || "";
    return allowedActions[dynamic[1]].includes(action)
      ? `/api/${dynamic[1]}/:id${action ? `/${action}` : ""}` : "/api/unknown";
  } catch {
    return "/api/unknown";
  }
}

type TelemetryInput = {
  event: "api.request" | "api.error";
  requestId: string;
  url: string;
  method: string;
  status: number;
  code: string;
  durationMs?: number;
  region?: string;
};

// Construct a new allowlisted object; never spread requests, payloads, or exceptions.
export function buildApiTelemetry(input: TelemetryInput) {
  return {
    event: input.event === "api.request" ? "api.request" : "api.error",
    requestId: uuidPattern.test(input.requestId) ? input.requestId : null,
    route: telemetryRoute(input.url),
    method: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(input.method)
      ? input.method : "UNKNOWN",
    status: Number.isInteger(input.status) && input.status >= 100 && input.status <= 599
      ? input.status : 500,
    code: codes.has(input.code) ? input.code : "UNKNOWN",
    durationMs: Number.isFinite(input.durationMs) && input.durationMs! >= 0
      ? Math.round(input.durationMs!) : null,
    region: /^[a-z]{3}\d$/.test(input.region || "") ? input.region : "unknown"
  };
}
