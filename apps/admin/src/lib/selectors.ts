import { buildExamSessionReport, isActiveExamSession } from "@algo-attendance/shared";
import type { DataStore } from "@algo-attendance/shared";

function getActiveExamSessions(store: DataStore) {
  return store.examSessions
    .filter(isActiveExamSession)
    .sort((left, right) => {
      const leftKey = `${left.examDate}T${left.startTime}`;
      const rightKey = `${right.examDate}T${right.startTime}`;
      return rightKey.localeCompare(leftKey) || right.createdAt.localeCompare(left.createdAt);
    });
}

export function listPublishedRoomsForUser(store: DataStore, userId: string) {
  const user = store.users.find((candidate) => candidate.id === userId);
  if (!user) {
    throw new Error("User not found.");
  }

  const activeSessions = getActiveExamSessions(store);
  if (!activeSessions.length) {
    return [];
  }

  const activeSessionIds = new Set(activeSessions.map((session) => session.id));
  const rooms = store.rooms.filter((room) => activeSessionIds.has(room.examSessionId));
  if (user.role === "admin") {
    return rooms;
  }

  if (!user.assignedRoomIds.length) {
    return [];
  }

  return rooms.filter((room) => user.assignedRoomIds.includes(room.id));
}

export function getRoomLiveState(store: DataStore, roomId: string) {
  const room = store.rooms.find((candidate) => candidate.id === roomId);
  if (!room) {
    throw new Error("Room not found.");
  }

  const report = buildExamSessionReport(store, room.examSessionId);
  const summary = report.summaries.find((item) => item.roomId === roomId);

  return {
    room,
    summary,
    recentAttendance: report.attendance
      .filter((item) => item.markedInRoomId === roomId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10)
      .map((item) => ({
        studentId: item.studentId,
        createdAt: item.createdAt,
        roomMismatch: item.roomMismatch,
        comment: item.comment
      })),
    recentIncidents: report.incidents
      .filter((item) => item.roomId === roomId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10)
      .map((item) => ({
        incidentType: item.incidentType,
        studentId: item.studentId,
        createdAt: item.createdAt,
        comment: typeof item.details.comment === "string" ? item.details.comment : undefined
      }))
  };
}
