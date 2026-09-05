/**
 * @typedef {{ studentId: string, roomId: string, examSessionId: string }} Context
 * @typedef {Context & { source: "ocr" | "manual", generation: number }} Token
 * @typedef {Token & { result: import("@algo-attendance/shared").LookupResult }} Review
 */
// Review ownership is synchronous: React renders and aborted fetches may settle later.
export function createReviewGuard() {
  let generation = 0;
  /** @type {Review | null} */
  let review = null;
  let pending = false;
  return {
    invalidate() { generation += 1; review = null; pending = false; },
    /** @param {number} token */
    owns(token) { return token === generation; },
    /** @param {Context & { source: "ocr" | "manual" }} context */
    begin(context) {
      if (pending) return null;
      generation += 1;
      review = null;
      pending = true;
      return { ...context, generation };
    },
    /** @param {Token} token @param {import("@algo-attendance/shared").LookupResult} result */
    accept(token, result) {
      if (token.generation !== generation) return false;
      if (result.studentId !== token.studentId || result.examSessionId !== token.examSessionId) return false;
      review = { ...token, result };
      return true;
    },
    /** @param {number} token */
    finish(token) { if (token === generation) pending = false; },
    /** @param {Context} context */
    actionable(context) {
      return Boolean(!pending && review && review.studentId === context.studentId.trim()
        && review.roomId === context.roomId && review.examSessionId === context.examSessionId
        && ["ready_to_mark", "wrong_room"].includes(review.result.status));
    },
    /** @param {Context} context @param {Partial<Pick<import("@algo-attendance/shared").MarkAttendanceRequest, "action" | "overrideWrongRoom">>} options */
    claim(context, options = {}) {
      if (!review || !this.actionable(context)) return null;
      // Never allow caller-supplied identity, source, or context into a write.
      if (Object.keys(options).some((key) => !["action", "overrideWrongRoom"].includes(key))) return null;
      const action = options.action ?? "mark_present";
      const overrideWrongRoom = options.overrideWrongRoom ?? false;
      if (review.result.status === "ready_to_mark" && (action !== "mark_present" || overrideWrongRoom !== false)) return null;
      if (review.result.status === "wrong_room" && !(
        (action === "redirect_only" && overrideWrongRoom === false)
        || (action === "mark_present" && overrideWrongRoom === true)
      )) return null;
      pending = true;
      return { ...review, action, overrideWrongRoom };
    },
    /** @param {number} token */
    consume(token) { if (token === generation) review = null; }
  };
}
