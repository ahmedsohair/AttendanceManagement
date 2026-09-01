import assert from "node:assert/strict";
import test from "node:test";
import {
  createSingleFlightLoop,
  getScannerBackAction
} from "../src/lib/scanner-runtime.mjs";

function waitFor(predicate, timeoutMs = 3000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("Timed out waiting for scanner loop condition."));
        return;
      }
      setTimeout(check, 1);
    };
    check();
  });
}

test("runs 200 scans without overlapping predictions", async () => {
  let completed = 0;
  let concurrent = 0;
  let maximumConcurrent = 0;
  let loop;

  loop = createSingleFlightLoop({
    delayMs: 0,
    schedule: (callback) => setImmediate(callback),
    cancel: (timer) => clearImmediate(timer),
    task: async () => {
      concurrent += 1;
      maximumConcurrent = Math.max(maximumConcurrent, concurrent);
      await Promise.resolve();
      concurrent -= 1;
      completed += 1;
      if (completed === 200) {
        loop.stop();
      }
    }
  });

  loop.start();
  await waitFor(() => completed === 200);

  assert.equal(maximumConcurrent, 1);
  assert.equal(concurrent, 0);
  assert.equal(loop.state().active, false);
});

test("does not reschedule an in-flight scan after stop", async () => {
  let started = 0;
  let releaseTask;
  const taskGate = new Promise((resolve) => {
    releaseTask = resolve;
  });
  const loop = createSingleFlightLoop({
    delayMs: 0,
    task: async () => {
      started += 1;
      await taskGate;
    }
  });

  loop.start();
  await waitFor(() => started === 1);
  loop.stop();
  releaseTask();
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(started, 1);
  assert.equal(loop.state().active, false);
});

test("recovers after a prediction error", async () => {
  let attempts = 0;
  const errors = [];
  let loop;
  loop = createSingleFlightLoop({
    delayMs: 0,
    onError: (error) => errors.push(error.message),
    task: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("prediction failed");
      }
      loop.stop();
    }
  });

  loop.start();
  await waitFor(() => attempts === 2);

  assert.deepEqual(errors, ["prediction failed"]);
  assert.equal(loop.state().active, false);
});

test("maps browser back to a safe scanner transition", () => {
  assert.equal(
    getScannerBackAction({ busy: true, lookupPending: false, scanPaused: true, hasRoom: true }),
    "wait"
  );
  assert.equal(
    getScannerBackAction({ busy: false, lookupPending: true, scanPaused: true, hasRoom: true }),
    "wait"
  );
  assert.equal(
    getScannerBackAction({ busy: false, lookupPending: false, scanPaused: true, hasRoom: true }),
    "cancel-review"
  );
  assert.equal(
    getScannerBackAction({ busy: false, lookupPending: false, scanPaused: false, hasRoom: true }),
    "room-selection"
  );
  assert.equal(
    getScannerBackAction({ busy: false, lookupPending: false, scanPaused: false, hasRoom: false }),
    "stay-signed-in"
  );
});
