import { requireApiUser } from "@/lib/auth";
import { enforceAuthRateLimits } from "@/lib/rate-limit";
import { createScannerTelemetryReceiver } from "@/lib/scanner-telemetry-receiver";
import { getRequestId } from "@/lib/api-errors";

export const POST = createScannerTelemetryReceiver({
  enabled: () => process.env.SCANNER_TELEMETRY_ENABLED === "true",
  authorize: (request) => requireApiUser(request, { allowedRoles: ["admin", "invigilator"] }),
  allow: async (request, userId) => (await enforceAuthRateLimits(request, "scanner-telemetry", userId, {
    address: { limit: 240, windowSeconds: 60, blockSeconds: 60 },
    identity: { limit: 4, windowSeconds: 60, blockSeconds: 60 }
  })).allowed,
  log: (report, request) => console.info(JSON.stringify({
    event: "scanner.report", requestId: getRequestId(request), receivedAt: new Date().toISOString(), ...report
  }))
});
