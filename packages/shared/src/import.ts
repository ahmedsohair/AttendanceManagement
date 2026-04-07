import type { Room, SessionImportPayload, StudentAllocation } from "./types";

export interface NormalizedImport {
  rooms: Room[];
  allocations: StudentAllocation[];
}

const normalizeText = (value: string) => value.trim();

export function normalizeImportPayload(
  sessionId: string,
  payload: SessionImportPayload,
  roomIdFactory: (roomCode: string) => string,
  allocationIdFactory: () => string
): NormalizedImport {
  const roomMap = new Map<string, Room>();
  const seenStudentIds = new Set<string>();
  const allocations: StudentAllocation[] = [];

  for (const row of payload.rows) {
    const studentId = normalizeText(row.student_id);
    if (seenStudentIds.has(studentId)) {
      throw new Error(`Duplicate student_id in import: ${studentId}`);
    }

    seenStudentIds.add(studentId);
    const roomCode = normalizeText(row.room);

    if (!roomMap.has(roomCode)) {
      roomMap.set(roomCode, {
        id: roomIdFactory(roomCode),
        examSessionId: sessionId,
        code: roomCode,
        displayName: roomCode
      });
    }

    const room = roomMap.get(roomCode);
    if (!room) {
      throw new Error(`Room resolution failed for ${roomCode}`);
    }

    allocations.push({
      id: allocationIdFactory(),
      examSessionId: sessionId,
      studentId,
      studentName: normalizeText(row.student_name),
      roomId: room.id,
      zone: normalizeText(row.zone),
      courseCode: row.course_code ? normalizeText(row.course_code) : undefined,
      program: row.program ? normalizeText(row.program) : undefined
    });
  }

  return {
    rooms: Array.from(roomMap.values()),
    allocations
  };
}
