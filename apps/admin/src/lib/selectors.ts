import { buildExamSessionReport } from "@algo-attendance/shared";
import type { DataStore } from "@algo-attendance/shared";

function getActivePublishedSession(store: DataStore) {
  return store.examSessions
    .filter((session) => session.published)
    .sort((left, right) => {
      const leftKey = `${left.examDate}T${left.startTime}`;
      const rightKey = `${right.examDate}T${right.startTime}`;
      return (
        rightKey.localeCompare(leftKey) || right.createdAt.localeCompare(left.createdAt)
      );
    })[0];
}

export function listPublishedRoomsForUser(store: DataStore, userId: string) {
  const user = store.users.find((candidate) => candidate.id === userId);
  if (!user) {
    throw new Error("User not found.");
  }

  const activeSession = getActivePublishedSession(store);
  if (!activeSession) {
    return [];
  }

  const rooms = store.rooms.filter((room) => room.examSessionId === activeSession.id);
  if (!user.assignedRoomIds.length) {
    return rooms;
  }

  const directlyAssigned = rooms.filter((room) => user.assignedRoomIds.includes(room.id));
  if (directlyAssigned.length) {
    return directlyAssigned;
  }

  const assignedCodes = new Set(
    user.assignedRoomIds
      .map((roomId) => store.rooms.find((room) => room.id === roomId)?.code)
      .filter((code): code is string => Boolean(code))
  );

  if (!assignedCodes.size) {
    return rooms;
  }

  const matchedByCode = rooms.filter((room) => assignedCodes.has(room.code));
  return matchedByCode.length ? matchedByCode : rooms;
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
