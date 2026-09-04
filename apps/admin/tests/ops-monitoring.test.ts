import assert from "node:assert/strict";
import test from "node:test";
import { evaluateOperations } from "../src/lib/ops-policy.ts";
import { dispatchOperationsAlerts, validOperationsSecret } from "../src/lib/ops-alerts.ts";
import { createScannerReporter, setScannerHealth, validateScannerReport } from "../src/lib/scanner-telemetry.ts";

const record = { event: "api.request", route: "/api/attendance/mark", method: "POST", requestId: "123e4567-e89b-42d3-a456-426614174000", status: 500, code: "INTERNAL_ERROR", durationMs: 250, region: "sin1" };
test("operational policy rejects low sample rate claims and exposes sampling limits", () => {
  const input = { records: Array(20).fill(record), scannerReports: [], databaseMs: 10, bounces: 0, activeExams: 1, truncated: false };
  const result = evaluateOperations(input);
  assert.ok(result.alerts.includes("mark_failures"));
  assert.ok(result.alerts.includes("api_failures"));
  assert.equal(result.api.groups[0].latencyMs.p95, 250);
  assert.deepEqual(evaluateOperations({ ...input, truncated: true }).alerts, []);
  assert.deepEqual(evaluateOperations({ ...input, records: [record] }).alerts, []);
  assert.deepEqual(evaluateOperations({ ...input, records: [], databaseMs: 2500, bounces: 1 }).alerts, ["database_slow", "email_bounces", "telemetry_missing"]);
});
test("scheduler secret fails closed and alert dispatch does not retry ambiguous sends", async () => {
  const secret = "x".repeat(40);
  assert.equal(validOperationsSecret(`Bearer ${secret}`, secret), true);
  for (const header of [null, secret, `Bearer ${secret}y`, "Bearer short"]) assert.equal(validOperationsSecret(header, secret), false);
  assert.equal(validOperationsSecret("Bearer short", "short"), false);
  const states: string[] = [];
  let sends = 0;
  const result = await dispatchOperationsAlerts(["a", "a", "b", "c"], {
    claim: async (key) => key === "b" ? null : key,
    send: async (key) => { sends++; if (key === "c") throw new Error("private provider details"); },
    finish: async (_key, _claim, state) => { states.push(state); }
  });
  assert.deepEqual(result, { accepted: 1, unknown: 1, suppressed: 1 });
  assert.equal(sends, 2);
  assert.deepEqual(states, ["accepted", "unknown"]);
});
test("idle scanner heartbeat resets its send window and clears on logout", async () => {
  let time = 0;
  const sent: unknown[] = [];
  const reporter = createScannerReporter({ now: () => time, send: async (r) => { sent.push(r); } });
  const health = { deviceId: "123e4567-e89b-42d3-a456-426614174000", pending: 2, conflicts: 1 };
  try {
    setScannerHealth(health);
    await reporter.flush(); await reporter.flush(); await reporter.flush();
    assert.equal(sent.length, 2);
    time = 60000; await reporter.flush();
    assert.equal(sent.length, 3);
    assert.ok(validateScannerReport(sent[0]));
    assert.equal(validateScannerReport({ ...(sent[0] as object), health: { ...health, email: "secret" } }), null);
    assert.equal(validateScannerReport({ ...(sent[0] as object), health: { ...health, pending: -1 } }), null);
    setScannerHealth(); time = 120000; await reporter.flush();
    assert.equal(sent.length, 3);
  } finally { setScannerHealth(); reporter.stop(); }
});
