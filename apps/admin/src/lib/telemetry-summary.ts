import { buildApiTelemetry } from "./telemetry.ts";

type RequestRecord = ReturnType<typeof buildApiTelemetry>;

function parseRequest(value: unknown): RequestRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.event !== "api.request" || typeof input.route !== "string" ||
      typeof input.method !== "string" || typeof input.code !== "string" ||
      typeof input.status !== "number" || typeof input.requestId !== "string") return null;
  // Revalidate logged canonical routes through the same privacy allowlist as emission.
  const record = buildApiTelemetry({
    event: "api.request", requestId: input.requestId,
    url: `https://telemetry.invalid${input.route.replace(":id", "123e4567-e89b-42d3-a456-426614174000")}`,
    method: input.method, status: input.status, code: input.code,
    durationMs: typeof input.durationMs === "number" ? input.durationMs : undefined,
    region: typeof input.region === "string" ? input.region : undefined
  });
  if (!record.requestId || record.route === "/api/unknown" || record.route !== input.route ||
      record.method === "UNKNOWN" || record.code === "UNKNOWN" || record.status !== input.status) return null;
  return record;
}

function percentile(sorted: number[], fraction: number) {
  return sorted.length ? sorted[Math.ceil(sorted.length * fraction) - 1] : null;
}

export function summarizeTelemetry(values: unknown[]) {
  const groups = new Map<string, RequestRecord[]>();
  let ignored = 0;
  for (const value of values) {
    const record = parseRequest(value);
    if (!record) {
      ignored += 1;
      continue;
    }
    const key = `${record.route} ${record.method} ${record.region}`;
    const group = groups.get(key) || [];
    group.push(record);
    groups.set(key, group);
  }
  return {
    schemaVersion: 1,
    inputRecords: values.length,
    acceptedRecords: values.length - ignored,
    ignoredRecords: ignored,
    groups: [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, records]) => {
      const durations = records.flatMap((record) => record.durationMs === null ? [] : [record.durationMs])
        .sort((a, b) => a - b);
      const count = (predicate: (record: RequestRecord) => boolean) => records.filter(predicate).length;
      const serverErrors = count((record) => record.status >= 500);
      return {
        route: records[0].route, method: records[0].method, region: records[0].region,
        requests: records.length,
        serverErrors,
        serverErrorRate: serverErrors / records.length,
        authenticationFailures: count((record) => record.status === 401),
        forbidden: count((record) => record.status === 403),
        rateLimited: count((record) => record.status === 429),
        clientErrors: count((record) => record.status >= 400 && record.status < 500),
        partialResponses: count((record) => record.status === 207),
        outcomes: Object.fromEntries([...new Set(records.map((record) => record.code))].sort()
          .map((code) => [code, count((record) => record.code === code)])),
        latencyMs: {
          samples: durations.length,
          missing: records.length - durations.length,
          p50: percentile(durations, 0.5), p95: percentile(durations, 0.95),
          p99: percentile(durations, 0.99), maximum: durations.at(-1) ?? null
        }
      };
    })
  };
}
