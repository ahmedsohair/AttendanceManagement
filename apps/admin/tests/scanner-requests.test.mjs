import assert from "node:assert/strict";
import test from "node:test";
import {
  ScannerRequestError,
  createIdempotencyTracker,
  createRequestCoordinator
} from "../src/lib/scanner-requests.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("reuses an idempotency key only for the same logical action", () => {
  let sequence = 0;
  const tracker = createIdempotencyTracker(() => `request-${++sequence}`);

  assert.equal(tracker.get("same-action"), "request-1");
  assert.equal(tracker.get("same-action"), "request-1");
  assert.equal(tracker.get("different-action"), "request-2");
  tracker.clear();
  assert.equal(tracker.get("different-action"), "request-3");
});

test("a newer request cancels the previous request with the same key", async () => {
  const first = deferred();
  let calls = 0;
  const coordinator = createRequestCoordinator({
    fetchImpl: async (_input, init) => {
      calls += 1;
      if (calls === 1) {
        init.signal.addEventListener("abort", () => first.reject(new DOMException("Aborted", "AbortError")));
        return first.promise;
      }
      return new Response(JSON.stringify({ value: "new" }), { status: 200 });
    }
  });

  const obsolete = coordinator.requestJson("lookup", "/old");
  const current = coordinator.requestJson("lookup", "/new");

  await assert.rejects(obsolete, (error) => error instanceof ScannerRequestError && error.kind === "cancelled");
  assert.deepEqual(await current, { value: "new" });
  assert.equal(coordinator.activeCount(), 0);
});

test("times out and aborts an unresponsive request", async () => {
  const coordinator = createRequestCoordinator({
    fetchImpl: (_input, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })
  });

  await assert.rejects(
    coordinator.requestJson("mark", "/mark", undefined, 5),
    (error) => error instanceof ScannerRequestError && error.kind === "timeout"
  );
  assert.equal(coordinator.activeCount(), 0);
});

test("distinguishes offline, expired-authentication, conflict, and server failures", async () => {
  let authExpired = 0;
  const responses = [
    new TypeError("network unavailable"),
    new Response(JSON.stringify({ message: "unauthorized" }), { status: 401 }),
    new Response(JSON.stringify({ message: "Student already marked." }), { status: 409 }),
    new Response("gateway failure", { status: 502 })
  ];
  const coordinator = createRequestCoordinator({
    onAuthExpired: () => {
      authExpired += 1;
    },
    fetchImpl: async () => {
      const next = responses.shift();
      if (next instanceof Error) {
        throw next;
      }
      return next;
    }
  });

  await assert.rejects(coordinator.requestJson("offline", "/offline"), { kind: "offline" });
  await assert.rejects(coordinator.requestJson("auth", "/auth"), { kind: "auth", status: 401 });
  await assert.rejects(coordinator.requestJson("conflict", "/conflict"), {
    kind: "conflict",
    status: 409,
    message: "Student already marked."
  });
  await assert.rejects(coordinator.requestJson("server", "/server"), { kind: "server", status: 502 });
  assert.equal(authExpired, 1);
});

test("cancelAll aborts every active scanner request", async () => {
  const coordinator = createRequestCoordinator({
    fetchImpl: (_input, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })
  });
  const lookup = coordinator.requestJson("lookup", "/lookup");
  const liveState = coordinator.requestJson("live-state", "/live");

  coordinator.cancelAll();

  await assert.rejects(lookup, { kind: "cancelled" });
  await assert.rejects(liveState, { kind: "cancelled" });
  assert.equal(coordinator.activeCount(), 0);
});
