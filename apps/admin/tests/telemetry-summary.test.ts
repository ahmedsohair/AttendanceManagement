import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { summarizeTelemetry } from "../src/lib/telemetry-summary.ts";

const base = {
  event: "api.request", requestId: "123e4567-e89b-42d3-a456-426614174000",
  route: "/api/attendance/mark", method: "POST", region: "sin1",
  status: 200, code: "ready_to_mark", durationMs: 100
};

test("computes nearest-rank percentiles without counting separate error logs", () => {
  const report = summarizeTelemetry([
    ...Array.from({ length: 100 }, (_, i) => ({ ...base, durationMs: i + 1 })),
    { ...base, event: "api.error", status: 503, code: "SERVICE_UNAVAILABLE" }
  ]);
  assert.equal(report.acceptedRecords, 100);
  assert.equal(report.ignoredRecords, 1);
  assert.deepEqual(report.groups[0].latencyMs, { samples: 100, missing: 0, p50: 50, p95: 95, p99: 99, maximum: 100 });
});

test("separates transport errors, auth failures, rate limits, and domain outcomes", () => {
  const report = summarizeTelemetry([
    base, { ...base, code: "already_marked" },
    { ...base, status: 503, code: "SERVICE_UNAVAILABLE" },
    { ...base, status: 401, code: "UNAUTHENTICATED" },
    { ...base, status: 403, code: "FORBIDDEN" },
    { ...base, status: 429, code: "RATE_LIMITED" },
    { ...base, status: 207, code: "SERVICE_UNAVAILABLE" }
  ]);
  const group = report.groups[0];
  assert.equal(group.serverErrors, 1);
  assert.equal(group.serverErrorRate, 1 / 7);
  assert.equal(group.authenticationFailures, 1);
  assert.equal(group.forbidden, 1);
  assert.equal(group.rateLimited, 1);
  assert.equal(group.clientErrors, 3);
  assert.equal(group.partialResponses, 1);
  assert.equal(group.outcomes.already_marked, 1);
});

test("omits sensitive fields and rejects unsafe dimensions rather than echoing them", () => {
  const report = summarizeTelemetry([
    { ...base, recipient: "secret@example.test", error: "secret", password: "secret" },
    { ...base, route: "/api/attendance/mark?code=secret" },
    { ...base, route: "/api/rooms/secret/live" },
    { ...base, code: "secret" }, { ...base, status: 999 }, null,
    { ...base, requestId: "secret" }, { ...base, method: "secret" }
  ]);
  assert.equal(report.acceptedRecords, 1);
  assert.doesNotMatch(JSON.stringify(report), /secret|recipient|password|requestId/);
});

test("handles empty evidence, missing latency, zero latency, and separate regions", () => {
  assert.equal(summarizeTelemetry([]).groups.length, 0);
  const report = summarizeTelemetry([
    { ...base, durationMs: null }, { ...base, durationMs: -1 },
    { ...base, region: "syd1", durationMs: 0 },
    { ...base, route: "/api/rooms/:id/live", method: "GET", durationMs: 5 }
  ]);
  const missing = report.groups.find((group) => group.route === base.route && group.region === "sin1")!;
  assert.deepEqual(missing.latencyMs, { samples: 0, missing: 2, p50: null, p95: null, p99: null, maximum: null });
  assert.equal(report.groups.find((group) => group.region === "syd1")!.latencyMs.p50, 0);
  assert.equal(report.groups.length, 3);
});

test("CLI reports synthetic evidence and fails visibly for missing or unusable input", () => {
  const script = fileURLToPath(new URL("../../../scripts/summarize-api-telemetry.mjs", import.meta.url));
  const run = (...args: string[]) => spawnSync(process.execPath,
    ["--experimental-strip-types", script, ...args], { encoding: "utf8", timeout: 10000 });
  const valid = run(fileURLToPath(new URL("./fixtures/telemetry.jsonl", import.meta.url)));
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(JSON.parse(valid.stdout).acceptedRecords, 2);
  assert.equal(run().status, 1);
  const invalid = run(fileURLToPath(import.meta.url));
  assert.equal(invalid.status, 2);
  assert.equal(JSON.parse(invalid.stdout).acceptedRecords, 0);
  assert.doesNotMatch(invalid.stdout, /import |node:child_process/);
});
