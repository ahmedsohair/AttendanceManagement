export type AttendanceSource = "ocr" | "manual";
export type OverrideType = "none" | "wrong_room_present";
export type IncidentType =
  | "wrong_room_redirected"
  | "wrong_room_present_override"
  | "duplicate_attempt"
  | "student_not_found";

export type UserRole = "admin" | "invigilator";

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  assignedRoomIds: string[];
}

export interface ExamSession {
  id: string;
  name: string;
  examDate: string;
  startTime: string;
  published: boolean;
  createdAt: string;
}

export interface Room {
  id: string;
  examSessionId: string;
  code: string;
  displayName: string;
  capacity?: number;
}

export interface StudentAllocation {
  id: string;
  examSessionId: string;
  studentId: string;
  studentName: string;
  roomId: string;
  zone: string;
  courseCode?: string;
  program?: string;
}

export interface AttendanceEvent {
  id: string;
  examSessionId: string;
  studentId: string;
  markedByUserId: string;
  markedInRoomId: string;
  expectedRoomId: string;
  source: AttendanceSource;
  overrideType: OverrideType;
  roomMismatch: boolean;
  comment?: string;
  deviceId: string;
  createdAt: string;
}

export interface Incident {
  id: string;
  examSessionId: string;
  studentId?: string;
  roomId?: string;
  expectedRoomId?: string;
  userId?: string;
  incidentType: IncidentType;
  details: Record<string, string | number | boolean | null | undefined>;
  createdAt: string;
}

export interface SessionImportRow {
  student_id: string;
  student_name: string;
  room: string;
  zone: string;
  course_code?: string;
  program?: string;
}

export interface SessionImportPayload {
  name: string;
  examDate: string;
  startTime: string;
  rows: SessionImportRow[];
}

export interface LookupRequest {
  examSessionId: string;
  roomId: string;
  studentId: string;
}

export interface LookupResultBase {
  examSessionId: string;
  studentId: string;
}

export interface LookupResultPresent extends LookupResultBase {
  status: "already_marked";
  message: string;
  attendance: AttendanceEvent;
}

export interface LookupResultNotFound extends LookupResultBase {
  status: "student_not_found";
  message: string;
}

export interface LookupResultCorrectRoom extends LookupResultBase {
  status: "ready_to_mark";
  message: string;
  allocation: StudentAllocation;
}

export interface LookupResultWrongRoom extends LookupResultBase {
  status: "wrong_room";
  message: string;
  allocation: StudentAllocation;
  expectedRoom: Room;
}

export type LookupResult =
  | LookupResultPresent
  | LookupResultNotFound
  | LookupResultCorrectRoom
  | LookupResultWrongRoom;

export interface MarkAttendanceRequest {
  examSessionId: string;
  roomId: string;
  studentId: string;
  source: AttendanceSource;
  userId: string;
  deviceId: string;
  action: "mark_present" | "redirect_only";
  overrideWrongRoom?: boolean;
  comment?: string;
}

export interface RoomSummary {
  roomId: string;
  roomCode: string;
  roomName: string;
  allocatedCount: number;
  presentCount: number;
  mismatchPresentCount: number;
  redirectedCount: number;
}

export interface ExamSessionReport {
  session: ExamSession;
  summaries: RoomSummary[];
  attendance: AttendanceEvent[];
  incidents: Incident[];
}

export interface DataStore {
  users: User[];
  examSessions: ExamSession[];
  rooms: Room[];
  studentAllocations: StudentAllocation[];
  attendanceEvents: AttendanceEvent[];
  incidents: Incident[];
}
