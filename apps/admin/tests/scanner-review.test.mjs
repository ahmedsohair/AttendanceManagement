import assert from "node:assert/strict";
import test from "node:test";
import { createReviewGuard } from "../src/lib/scanner-review.mjs";

const context = { studentId: "9000991", examSessionId: "exam", roomId: "room", source: "manual" };
const result = (studentId = context.studentId, status = "ready_to_mark") => ({ studentId, examSessionId: "exam", status });
function ready(status = "ready_to_mark") {
  const guard = createReviewGuard();
  const token = guard.begin(context);
  assert.equal(guard.accept(token, result(context.studentId, status)), true);
  guard.finish(token.generation);
  return { guard, token };
}

for (const status of ["ready_to_mark", "wrong_room"]) {
  test(`${status}: edit away and back never revives eligibility or handlers`, () => {
    const { guard } = ready(status);
    guard.invalidate();
    for (const studentId of ["9000992", "", context.studentId]) {
      for (const options of [{}, { action: "redirect_only" }, { overrideWrongRoom: true }]) {
        assert.equal(guard.claim({ ...context, studentId }, options), null);
      }
    }
  });
}

test("old responses and finalizers cannot settle newer lookup after edit/cancel/room change", () => {
  for (const next of [context, { ...context, studentId: "9000992" }, { ...context, roomId: "other" }]) {
    const guard = createReviewGuard();
    const old = guard.begin(context);
    assert.equal(guard.begin(context), null, "synchronous duplicate lookup rejected");
    guard.invalidate();
    const current = guard.begin(next);
    assert.equal(guard.accept(old, result()), false);
    guard.finish(old.generation);
    assert.equal(guard.begin(next), null, "old finally must not clear pending");
    assert.equal(guard.accept(current, result(next.studentId)), true);
    guard.finish(current.generation);
    assert.equal(guard.claim(next).studentId, next.studentId);
  }
});

test("rejects mismatched response, context, unsafe overrides, and dismissal-only results", () => {
  const { guard } = ready();
  for (const change of [{ studentId: "other" }, { roomId: "other" }, { examSessionId: "other" }]) {
    assert.equal(guard.claim({ ...context, ...change }), null);
  }
  for (const key of ["studentId", "roomId", "examSessionId", "source", "comment", "requestId", "userId", "deviceId"]) {
    assert.equal(guard.claim(context, { [key]: "injected" }), null);
  }
  for (const status of ["already_marked", "student_not_found"]) {
    assert.equal(ready(status).guard.claim(context), null);
  }
  const token = guard.begin(context);
  assert.equal(guard.accept(token, result("other")), false);
  guard.finish(token.generation);
  assert.equal(guard.claim(context), null);
});

test("wrong room action semantics, duplicate writes and consumed reviews", () => {
  for (const options of [{ action: "redirect_only" }, { overrideWrongRoom: true }]) {
    const { guard, token } = ready("wrong_room");
    assert.equal(guard.claim(context), null);
    assert.equal(guard.claim(context, { action: "redirect_only", overrideWrongRoom: true }), null);
    const write = guard.claim(context, options);
    assert.equal(write.studentId, context.studentId);
    assert.equal(write.source, "manual");
    assert.equal(guard.claim(context, options), null);
    guard.consume(token.generation);
    guard.finish(token.generation);
    assert.equal(guard.claim(context, options), null);
    guard.invalidate();
    assert.equal(write.studentId, context.studentId, "committed snapshot survives invalidation");
    assert.equal(guard.owns(token.generation), false, "old reset timer loses ownership");
  }
});
