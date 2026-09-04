import assert from "node:assert/strict";
import test from "node:test";
import { createScannerReporter, measureScannerOperation, observeScannerErrors, scannerPlatform, setScannerReporter, validateScannerReport } from "../src/lib/scanner-telemetry.ts";
import { createScannerTelemetryReceiver } from "../src/lib/scanner-telemetry-receiver.ts";
import { ApiRequestError } from "../src/lib/api-errors.ts";

const report = { version: 1, browser: "safari", device: "ios", events: [{ event: "boundary_error", outcome: "error", durationMs: null }] };
test("strict client schema rejects identifying fields, unbounded arrays and invalid numbers", () => {
  assert.ok(validateScannerReport(report));
  for (const value of [null, { ...report, email: "secret" }, { ...report, events: Array(21).fill(report.events[0]) },
    { ...report, events: [] }, { ...report, browser: "secret" },
    { ...report, events: [{ ...report.events[0], message: "secret" }] },
    ...[NaN, Infinity, -1, 600001, "1", 1.5].map((durationMs) => ({ ...report, events: [{ ...report.events[0], durationMs }] }))]) {
    assert.equal(validateScannerReport(value), null);
  }
  assert.deepEqual(scannerPlatform("iPhone Version/18 Safari/604"), { browser: "safari", device: "ios" });
  assert.deepEqual(scannerPlatform("Android Chrome/120"), { browser: "chrome", device: "android" });
});

test("reporter caps samples and sends, drops failed sends, resets limits and stops", async () => {
  let time = 0;
  const sent: unknown[] = [];
  const reporter = createScannerReporter({ now: () => time, send: async (value) => { sent.push(value); throw new Error("private"); } });
  for (let i = 0; i < 100; i++) reporter.record("ocr_prediction", "ok", 5);
  await reporter.flush();
  await reporter.flush();
  assert.equal(sent.length, 1);
  assert.equal((sent[0] as typeof report).events.length, 1);
  reporter.record("mark", "error", 10);
  await reporter.flush();
  reporter.record("lookup", "error");
  await reporter.flush();
  assert.equal(sent.length, 2);
  time = 60000;
  reporter.record("lookup", "ok", 1);
  await reporter.flush();
  assert.equal(sent.length, 3);
  reporter.stop();
  reporter.record("runtime_error", "error");
  await reporter.flush();
  assert.equal(sent.length, 3);
  assert.doesNotMatch(JSON.stringify(sent), /private/);
});

test("measurement preserves success/error identity and never leaks error text", async () => {
  const sent: unknown[] = [];
  const reporter = createScannerReporter({ send: async (value) => { sent.push(value); } });
  setScannerReporter(reporter);
  try {
    const result = {};
    assert.equal(await measureScannerOperation("lookup", async () => result), result);
    const error = Object.assign(new Error("private student info"), { kind: "cancelled" });
    await assert.rejects(measureScannerOperation("mark", async () => { throw error; }), (actual) => actual === error);
    await reporter.flush();
    assert.doesNotMatch(JSON.stringify(sent), /private|student/);
    assert.match(JSON.stringify(sent), /cancelled/);
  } finally { setScannerReporter(null); reporter.stop(); }
});

test("receiver requires enablement, same origin, auth, rate limits and bounded valid input", async () => {
  let enabled = true, authorized = true, allowed = true;
  const logs: unknown[] = [];
  const receiver = createScannerTelemetryReceiver({
    enabled: () => enabled,
    authorize: async () => { if (!authorized) throw new ApiRequestError("private", 401); return { id: "private" }; },
    allow: async () => allowed,
    log: (value) => { logs.push(value); }
  });
  const request = (body = JSON.stringify(report), origin = "https://example.test") => new Request("https://example.test/api/telemetry/scanner", {
    method: "POST", headers: { origin, "content-type": "application/json" }, body
  });
  enabled = false; assert.equal((await receiver(request())).status, 404);
  enabled = true; assert.equal((await receiver(request(undefined, "https://other.test"))).status, 403);
  authorized = false; assert.equal((await receiver(request())).status, 401);
  authorized = true; allowed = false; assert.equal((await receiver(request())).status, 429);
  allowed = true;
  assert.equal((await receiver(request("x".repeat(8193)))).status, 413);
  assert.equal((await receiver(request("not json"))).status, 400);
  assert.equal((await receiver(request(JSON.stringify({ ...report, token: "private" })))).status, 422);
  assert.equal((await receiver(request())).status, 204);
  assert.equal(logs.length, 1);
  assert.doesNotMatch(JSON.stringify(logs), /private/);
});

test("global listeners leave browser handling intact and detach without leaking event contents", async () => {
  const sent: unknown[] = [];
  const reporter = createScannerReporter({ send: async (value) => { sent.push(value); } });
  setScannerReporter(reporter);
  const target = new EventTarget();
  const stop = observeScannerErrors(target);
  try {
    const event = Object.assign(new Event("error", { cancelable: true }), { message: "private" });
    target.dispatchEvent(event);
    target.dispatchEvent(new Event("unhandledrejection"));
    assert.equal(event.defaultPrevented, false);
    await reporter.flush();
    assert.equal((sent[0] as typeof report).events.length, 2);
    assert.doesNotMatch(JSON.stringify(sent), /private/);
    stop();
    target.dispatchEvent(new Event("error"));
    await reporter.flush();
    assert.equal(sent.length, 1);
  } finally { stop(); setScannerReporter(null); reporter.stop(); }
});

test("receiver times out stalled bodies without logging or holding the stream open", async () => {
  let cancelled = false;
  const receiver = createScannerTelemetryReceiver({ enabled: () => true,
    authorize: async () => ({ id: "test" }), allow: async () => true,
    log: () => assert.fail("stalled input must not be logged") });
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const init = { method: "POST", headers: { origin: "https://example.test", "content-type": "application/json" }, body: stream, duplex: "half" };
  const response = await receiver(new Request("https://example.test/api/telemetry/scanner", init));
  assert.equal(response.status, 408);
  assert.equal(cancelled, true);
});
