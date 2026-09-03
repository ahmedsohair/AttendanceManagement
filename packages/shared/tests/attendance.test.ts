import assert from "node:assert/strict";
import test from "node:test";
import {
  buildExamSessionReport,
  classifyAttendanceStatus,
  lookupStudent,
  markAttendance
} from "../src/attendance.ts";
import type { DataStore, MarkAttendanceRequest } from "../src/types.ts";

function createStore(): DataStore {
  return {
    users: [{
      id: "user-1",
      email: "invigilator@example.com",
      fullName: "Invigilator",
      role: "invigilator",
      assignedRoomIds: ["room-1"]
    }],
    examSessions: [{
      id: "exam-1",
      name: "Attendance Test",
      examDate: "2026-09-03",
      startTime: "09:00",
      published: true,
      status: "active",
      createdAt: "2026-09-03T00:00:00.000Z"
    }],
    rooms: [
      { id: "room-1", examSessionId: "exam-1", code: "A", displayName: "Room A" },
      { id: "room-2", examSessionId: "exam-1", code: "B", displayName: "Room B" }
    ],
    studentAllocations: [
      { id: "allocation-1", examSessionId: "exam-1", studentId: "1000001", studentName: "One", roomId: "room-1", zone: "A" },
      { id: "allocation-2", examSessionId: "exam-1", studentId: "1000002", studentName: "Two", roomId: "room-2", zone: "B" },
      { id: "allocation-3", examSessionId: "exam-1", studentId: "1000003", studentName: "Three", roomId: "room-1", zone: "A" }
    ],
    attendanceEvents: [],
    incidents: []
  };
}

let sequence = 0;
const deps = {
  nextId: () => `event-${++sequence}`,
  now: () => "2026-09-03T01:00:00.000Z"
};

function markRequest(overrides: Partial<MarkAttendanceRequest> = {}): MarkAttendanceRequest {
  return {
    action: "mark_present",
    deviceId: "device-1",
    examSessionId: "exam-1",
    roomId: "room-1",
    source: "ocr",
    studentId: "1000001",
    userId: "user-1",
    ...overrides
  };
}

test("handles correct-room, duplicate, not-found, and wrong-room transitions", () => {
  const store = createStore();
  assert.equal(lookupStudent(store, markRequest()).status, "ready_to_mark");

  const correct = markAttendance(store, markRequest({ comment: "  Photo ID checked  " }), deps);
  assert.equal(correct.event?.roomMismatch, false);
  assert.equal(correct.event?.comment, "Photo ID checked");

  const duplicate = markAttendance(store, markRequest(), deps);
  assert.equal(duplicate.result.status, "already_marked");
  assert.equal(duplicate.incident?.incidentType, "duplicate_attempt");

  const missing = markAttendance(store, markRequest({ studentId: "9999999" }), deps);
  assert.equal(missing.result.status, "student_not_found");
  assert.equal(missing.incident?.incidentType, "student_not_found");

  const redirected = markAttendance(store, markRequest({ studentId: "1000002", action: "redirect_only" }), deps);
  assert.equal(redirected.incident?.incidentType, "wrong_room_redirected");
  assert.equal(redirected.event, undefined);

  assert.throws(
    () => markAttendance(store, markRequest({ studentId: "1000002" }), deps),
    /requires overrideWrongRoom/
  );
  const mismatch = markAttendance(
    store,
    markRequest({ studentId: "1000002", overrideWrongRoom: true, source: "manual" }),
    deps
  );
  assert.equal(mismatch.event?.roomMismatch, true);
  assert.equal(mismatch.incident?.incidentType, "wrong_room_present_override");
});

test("classifies present, mismatch-present, and absent students in reports", () => {
  const store = createStore();
  markAttendance(store, markRequest(), deps);
  markAttendance(store, markRequest({ studentId: "1000002", overrideWrongRoom: true }), deps);

  const report = buildExamSessionReport(store, "exam-1");
  const roomOne = report.summaries.find((summary) => summary.roomId === "room-1");
  assert.deepEqual(roomOne, {
    allocatedCount: 2,
    mismatchPresentCount: 1,
    presentCount: 2,
    redirectedCount: 0,
    roomCode: "A",
    roomId: "room-1",
    roomName: "Room A"
  });

  const attendanceByStudent = new Map(report.attendance.map((event) => [event.studentId, event]));
  assert.equal(classifyAttendanceStatus(attendanceByStudent.get("1000001")), "Present");
  assert.equal(classifyAttendanceStatus(attendanceByStudent.get("1000002")), "Mismatch present");
  assert.equal(classifyAttendanceStatus(attendanceByStudent.get("1000003")), "Absent");
});
