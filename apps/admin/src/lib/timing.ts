import "server-only";
import { getRequestId } from "./api-errors";
import { buildApiTelemetry } from "./telemetry";
import { persistOperations } from "./ops-monitoring";

export function logApiTiming(request: Request, startedAt: number, status: number, code: string) {
  const record = buildApiTelemetry({
    event: "api.request",
    requestId: getRequestId(request),
    url: request.url,
    method: request.method,
    durationMs: performance.now() - startedAt,
    status,
    code,
    region: process.env.VERCEL_REGION
  });
  console.info(JSON.stringify(record));
  persistOperations("api", record);
}

type TimingFields = Record<string, string | number | boolean | null | undefined>;

export function logServerTiming(
  name: string,
  startedAt: number,
  fields: TimingFields = {}
) {
  const durationMs = Math.round(performance.now() - startedAt);
  console.info(
    `[perf] ${JSON.stringify({
      name,
      durationMs,
      ...fields
    })}`
  );
}
