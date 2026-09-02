import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import {
  classifyOutboxError,
  createPendingOutboxItem,
  createScannerOutbox,
  flushScannerOutbox,
  getRetryDelayMs,
  isOutboxItemClaimable,
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

test("only the originating invigilator can claim queued work", () => {
  const pending = { userId: "user-1", status: "pending", nextAttemptAt: 100, leaseUntil: 0 };
  assert.equal(isOutboxItemClaimable(pending, 100, "user-1"), true);
  assert.equal(isOutboxItemClaimable(pending, 100, "user-2"), false);
  assert.equal(isOutboxItemClaimable(pending, 99, "user-1"), false);
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

test("persists queued work and allows only one simultaneous claim", async () => {
  const indexedDb = new IDBFactory();
  const firstTab = createScannerOutbox({ indexedDb, now: () => 1000 });
  await firstTab.enqueue({
    id: "request-persisted",
    userId: "user-1",
    queuedAt: "2026-09-02T00:00:00.000Z"
  });

  const restartedTab = createScannerOutbox({ indexedDb, now: () => 1000 });
  assert.equal((await restartedTab.list()).length, 1);

  const claims = await Promise.all([
    firstTab.claimNext("user-1"),
    restartedTab.claimNext("user-1")
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(claims.find(Boolean)?.id, "request-persisted");

  await restartedTab.complete("request-persisted");
  assert.deepEqual(await firstTab.list(), []);
});

test("retains an offline mark and synchronizes it once after reconnection", async () => {
  const indexedDb = new IDBFactory();
  let currentTime = 1000;
  const outbox = createScannerOutbox({ indexedDb, now: () => currentTime });
  await outbox.enqueue({
    id: "stable-request-id",
    userId: "user-1",
    queuedAt: "2026-09-02T00:00:00.000Z",
    request: { requestId: "stable-request-id" }
  });

  let serverWrites = 0;
  const firstFlush = await flushScannerOutbox({
    outbox,
    userId: "user-1",
    random: () => 0.5,
    send: async () => {
      throw Object.assign(new Error("offline"), { kind: "offline" });
    }
  });
  assert.equal(firstFlush.retryBlocked, true);
  assert.equal((await outbox.list())[0].status, "pending");

  currentTime = 2000;
  const secondFlush = await flushScannerOutbox({
    outbox,
    userId: "user-1",
    send: async (item) => {
      assert.equal(item.request.requestId, "stable-request-id");
      serverWrites += 1;
      return { event: { id: "event-1" } };
    }
  });
  assert.equal(secondFlush.synced, 1);
  assert.equal(serverWrites, 1);
  assert.deepEqual(await outbox.list(), []);
});

test("keeps a closed-exam conflict visible without retrying", async () => {
  const indexedDb = new IDBFactory();
  const outbox = createScannerOutbox({ indexedDb, now: () => 1000 });
  await outbox.enqueue({
    id: "closed-exam-request",
    userId: "user-1",
    queuedAt: "2026-09-02T00:00:00.000Z"
  });

  let sends = 0;
  const result = await flushScannerOutbox({
    outbox,
    userId: "user-1",
    send: async () => {
      sends += 1;
      throw Object.assign(new Error("Exam session is not active."), {
        kind: "conflict",
        status: 409
      });
    }
  });

  const [item] = await outbox.list();
  assert.equal(sends, 1);
  assert.equal(result.terminal, 1);
  assert.equal(item.status, "conflict");
  assert.equal(item.lastError, "Exam session is not active.");
});
