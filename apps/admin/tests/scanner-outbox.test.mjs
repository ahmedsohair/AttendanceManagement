import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyOutboxError,
  createPendingOutboxItem,
  getRetryDelayMs,
  summarizeOutbox
} from "../src/lib/scanner-outbox.mjs";

test("new queue items are immediately due using a numeric timestamp", () => {
  const item = createPendingOutboxItem(
    { id: "request-1", queuedAt: "2026-09-02T00:00:00.000Z" },
    123456
  );

  assert.equal(item.status, "pending");
  assert.equal(item.nextAttemptAt, 123456);
  assert.equal(typeof item.nextAttemptAt, "number");
});

test("uses bounded exponential retry delays with jitter", () => {
  assert.equal(getRetryDelayMs(1, () => 0.5), 1000);
  assert.equal(getRetryDelayMs(2, () => 0.5), 2000);
  assert.equal(getRetryDelayMs(20, () => 0.5), 30000);
  assert.equal(getRetryDelayMs(1, () => 0), 800);
  assert.equal(getRetryDelayMs(1, () => 1), 1200);
});

test("retries only network, timeout, throttling, and server failures", () => {
  assert.equal(classifyOutboxError({ kind: "offline" }), "retry");
  assert.equal(classifyOutboxError({ kind: "timeout" }), "retry");
  assert.equal(classifyOutboxError({ kind: "server", status: 502 }), "retry");
  assert.equal(classifyOutboxError({ kind: "server", status: 429 }), "retry");
  assert.equal(classifyOutboxError({ kind: "conflict", status: 409 }), "conflict");
  assert.equal(classifyOutboxError({ kind: "auth", status: 401 }), "failed");
  assert.equal(classifyOutboxError({ kind: "server", status: 400 }), "failed");
});

test("summarizes recoverable and terminal queue states", () => {
  assert.deepEqual(
    summarizeOutbox([
      { status: "pending" },
      { status: "syncing" },
      { status: "failed" },
      { status: "conflict" }
    ]),
    { total: 4, pending: 1, syncing: 1, failed: 1, conflict: 1 }
  );
});
