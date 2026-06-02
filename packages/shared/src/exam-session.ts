import type { ExamSession, ExamSessionStatus } from "./types";

export function getExamSessionStatus(session: ExamSession): ExamSessionStatus {
  if (session.status) {
    return session.status;
  }

  return session.published ? "active" : "draft";
}

export function isDraftExamSession(session: ExamSession) {
  return getExamSessionStatus(session) === "draft";
}

export function isActiveExamSession(session: ExamSession) {
  return getExamSessionStatus(session) === "active";
}

export function isClosedExamSession(session: ExamSession) {
  return getExamSessionStatus(session) === "closed";
}
