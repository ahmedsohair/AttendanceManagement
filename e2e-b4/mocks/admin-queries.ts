export type AttendanceAuditStatus = "" | "standard" | "mismatch" | "commented";
export type AttendanceAuditSort = "newest" | "oldest";
export type IncidentType =
  | "wrong_room_redirected"
  | "wrong_room_present_override"
  | "duplicate_attempt"
  | "student_not_found";
export type IncidentAuditType = "" | IncidentType;
export type IncidentAuditSort = "newest" | "oldest";

type Session = {
  id: string;
  name: string;
  examDate: string;
  startTime: string;
  published: boolean;
  status: "active";
  createdAt: string;
};

type Room = {
  id: string;
  examSessionId: string;
  code: string;
  displayName: string;
  capacity: number;
};

type AttendanceAuditInput = {
  examSessionFilter: string;
  query: string;
  roomId: string;
  status: AttendanceAuditStatus;
  sort: AttendanceAuditSort;
  page: number;
};

type IncidentAuditInput = {
  examSessionFilter: string;
  query: string;
  roomId: string;
  incidentType: IncidentAuditType;
  sort: IncidentAuditSort;
  page: number;
};

const sessions: Session[] = [
  {
    id: "exam-a",
    name: "Fixture exam A",
    examDate: "2026-09-06",
    startTime: "09:00",
    published: true,
    status: "active",
    createdAt: "2026-09-01T00:00:00.000Z"
  },
  {
    id: "exam-b",
    name: "Fixture exam B",
    examDate: "2026-09-07",
    startTime: "10:00",
    published: true,
    status: "active",
    createdAt: "2026-09-02T00:00:00.000Z"
  }
];

const rooms: Room[] = [
  { id: "room-a-1", examSessionId: "exam-a", code: "R1", displayName: "Room One", capacity: 50 },
  { id: "room-a-2", examSessionId: "exam-a", code: "R2", displayName: "Room Two", capacity: 50 },
  { id: "room-b-1", examSessionId: "exam-b", code: "R1", displayName: "Room One", capacity: 50 },
  { id: "room-b-2", examSessionId: "exam-b", code: "R2", displayName: "Room Two", capacity: 50 }
];

const pageSize = 50;
const totalCount = 120;
const totalPages = Math.ceil(totalCount / pageSize);
const unbroken = "longunbrokenidentifier".repeat(12);

function isEmpty(query: string, roomId: string) {
  return query === "none" || roomId === "none";
}

function getPage(page: number, query: string, roomId: string) {
  if (isEmpty(query, roomId)) {
    return { page: 1, totalCount: 0, totalPages: 1, rows: 0 };
  }

  return {
    page: Math.min(Math.max(page, 1), totalPages),
    totalCount,
    totalPages,
    rows: pageSize
  };
}

function roomFor(index: number, examSessionId: string) {
  return rooms.find((room) => room.examSessionId === examSessionId && room.code === (index % 2 ? "R2" : "R1")) || rooms[0];
}

function selectedExam(index: number) {
  return sessions[index % sessions.length];
}

function attendanceRows(page: number) {
  const offset = (page - 1) * pageSize;
  return Array.from({ length: pageSize }, (_, index) => {
    const rowIndex = offset + index;
    const session = selectedExam(rowIndex);
    const markedRoom = roomFor(rowIndex, session.id);
    const expectedRoom = roomFor(rowIndex + 1, session.id);
    return {
      id: `attendance-${rowIndex + 1}`,
      examSessionId: session.id,
      studentId: `900${String(rowIndex + 991).padStart(4, "0")}`,
      studentName: rowIndex === 0 ? `Long Student Name ${unbroken}` : `Student ${rowIndex + 1}`,
      examName: session.name,
      markedInRoomId: markedRoom.id,
      markedInRoomCode: markedRoom.code,
      expectedRoomId: expectedRoom.id,
      expectedRoomCode: expectedRoom.code,
      markedByUserId: "fixture-admin",
      markedByName: rowIndex === 0 ? `Long Invigilator ${unbroken}` : `Invigilator ${rowIndex + 1}`,
      markedByEmail: rowIndex === 0 ? `${unbroken}@example.test` : `invigilator${rowIndex + 1}@example.test`,
      source: rowIndex % 2 ? "manual" as const : "ocr" as const,
      overrideType: rowIndex % 3 ? "none" as const : "wrong_room_present" as const,
      roomMismatch: rowIndex % 3 === 0,
      comment: rowIndex === 0 ? `Long operational comment ${unbroken}` : `Comment ${rowIndex + 1}`,
      deviceId: "fixture-device",
      createdAt: "2026-09-06T01:15:00.000Z"
    };
  });
}

function incidentRows(page: number) {
  const offset = (page - 1) * pageSize;
  return Array.from({ length: pageSize }, (_, index) => {
    const rowIndex = offset + index;
    const session = selectedExam(rowIndex);
    const markedRoom = roomFor(rowIndex, session.id);
    const expectedRoom = roomFor(rowIndex + 1, session.id);
    const incidentType: IncidentType = [
      "wrong_room_redirected",
      "wrong_room_present_override",
      "duplicate_attempt",
      "student_not_found"
    ][rowIndex % 4] as IncidentType;
    return {
      id: `incident-${rowIndex + 1}`,
      examSessionId: session.id,
      studentId: `900${String(rowIndex + 991).padStart(4, "0")}`,
      examName: session.name,
      roomId: markedRoom.id,
      roomCode: markedRoom.code,
      expectedRoomId: expectedRoom.id,
      expectedRoomCode: expectedRoom.code,
      userId: "fixture-admin",
      raisedByName: rowIndex === 0 ? `Long Invigilator ${unbroken}` : `Invigilator ${rowIndex + 1}`,
      raisedByEmail: rowIndex === 0 ? `${unbroken}@example.test` : `invigilator${rowIndex + 1}@example.test`,
      incidentType,
      details: { comment: rowIndex === 0 ? `Long incident comment ${unbroken}` : `Incident comment ${rowIndex + 1}` },
      createdAt: "2026-09-06T01:15:00.000Z"
    };
  });
}

export async function getAttendanceAuditPage(input: AttendanceAuditInput) {
  const result = getPage(input.page, input.query, input.roomId);
  return {
    rows: result.rows ? attendanceRows(result.page) : [],
    totalCount: result.totalCount,
    page: result.page,
    pageSize,
    totalPages: result.totalPages,
    sessions,
    rooms
  };
}

export async function getIncidentAuditPage(input: IncidentAuditInput) {
  const result = getPage(input.page, input.query, input.roomId);
  return {
    rows: result.rows ? incidentRows(result.page) : [],
    totalCount: result.totalCount,
    page: result.page,
    pageSize,
    totalPages: result.totalPages,
    sessions,
    rooms
  };
}
