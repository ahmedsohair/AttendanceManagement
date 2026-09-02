import "server-only";

import {
  isActiveExamSession,
  isClosedExamSession,
  isDraftExamSession,
  type ExamSession,
  type IncidentType,
  type Room
} from "@algo-attendance/shared";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { readStore } from "./store";

type SessionRow = {
  id: string;
  name: string;
  exam_date: string;
  start_time: string;
  published: boolean;
  status?: ExamSession["status"] | null;
  created_at: string;
};

export type SessionsOverview = {
  activeSessions: ExamSession[];
  draftSessions: ExamSession[];
  closedSessions: ExamSession[];
  roomCountBySessionId: Map<string, number>;
};

export type DashboardData = SessionsOverview & {
  overall: {
    present: number;
    mismatch: number;
    incidents: number;
  };
  needsAttention: Array<{
    label: string;
    detail: string;
    href: string;
    tone: "warn" | "ok" | "neutral";
  }>;
};

export type AttendanceAuditStatus = "" | "standard" | "mismatch" | "commented";
export type AttendanceAuditSort = "newest" | "oldest";

export type AttendanceAuditRow = {
  id: string;
  examSessionId: string;
  studentId: string;
  studentName: string;
  examName: string;
  markedInRoomId: string;
  markedInRoomCode: string;
  expectedRoomId: string;
  expectedRoomCode: string;
  markedByUserId: string;
  markedByName: string;
  markedByEmail: string;
  source: "ocr" | "manual";
  overrideType: "none" | "wrong_room_present";
  roomMismatch: boolean;
  comment?: string;
  deviceId: string;
  createdAt: string;
};

export type AttendanceAuditPage = {
  rows: AttendanceAuditRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  sessions: ExamSession[];
  rooms: Room[];
};

export type IncidentAuditType = "" | IncidentType;
export type IncidentAuditSort = "newest" | "oldest";

export type IncidentAuditRow = {
  id: string;
  examSessionId: string;
  studentId?: string;
  examName: string;
  roomId?: string;
  roomCode?: string;
  expectedRoomId?: string;
  expectedRoomCode?: string;
  userId?: string;
  raisedByName?: string;
  raisedByEmail?: string;
  incidentType: IncidentType;
  details: Record<string, string | number | boolean | null | undefined>;
  createdAt: string;
};

export type IncidentAuditPage = {
  rows: IncidentAuditRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  sessions: ExamSession[];
  rooms: Room[];
};

export type ExamSessionListStatus = "active" | "draft" | "closed";
export type ExamSessionListSort = "newest" | "oldest";

export type ExamSessionListRow = ExamSession & {
  roomCount: number;
};

export type ExamSessionPage = {
  rows: ExamSessionListRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type AttendanceAuditInput = {
  examSessionFilter: string;
  query: string;
  roomId: string;
  status: AttendanceAuditStatus;
  sort: AttendanceAuditSort;
  page: number;
  pageSize?: number;
};

type AttendanceAuditRpcRow = {
  id: string;
  exam_session_id: string;
  student_id: string;
  student_name: string | null;
  exam_name: string;
  marked_in_room_id: string;
  marked_in_room_code: string;
  expected_room_id: string;
  expected_room_code: string;
  marked_by_user_id: string;
  marked_by_name: string;
  marked_by_email: string;
  source: "ocr" | "manual";
  override_type: "none" | "wrong_room_present";
  room_mismatch: boolean;
  comment: string | null;
  device_id: string;
  created_at: string;
  total_count: number | string;
};

type IncidentAuditInput = {
  examSessionFilter: string;
  query: string;
  roomId: string;
  incidentType: IncidentAuditType;
  sort: IncidentAuditSort;
  page: number;
  pageSize?: number;
};

type IncidentAuditRpcRow = {
  id: string;
  exam_session_id: string;
  student_id: string | null;
  exam_name: string;
  room_id: string | null;
  room_code: string | null;
  expected_room_id: string | null;
  expected_room_code: string | null;
  user_id: string | null;
  raised_by_name: string | null;
  raised_by_email: string | null;
  incident_type: IncidentType;
  details: Record<string, string | number | boolean | null | undefined> | null;
  created_at: string;
  total_count: number | string;
};

type ExamSessionPageInput = {
  status: ExamSessionListStatus;
  query: string;
  sort: ExamSessionListSort;
  page: number;
  pageSize?: number;
};

type ExamSessionRpcRow = SessionRow & {
  status: ExamSessionListStatus;
  room_count: number | string;
  total_count: number | string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toExamSession(row: SessionRow): ExamSession {
  return {
    id: row.id,
    name: row.name,
    examDate: row.exam_date,
    startTime: row.start_time,
    published: row.published,
    status: row.status ?? (row.published ? "active" : "draft"),
    createdAt: row.created_at
  };
}

function sortSessions(sessions: ExamSession[]) {
  return [...sessions].sort((left, right) => {
    const rightDate = `${right.examDate}T${right.startTime}`;
    const leftDate = `${left.examDate}T${left.startTime}`;

    return rightDate.localeCompare(leftDate) || right.createdAt.localeCompare(left.createdAt);
  });
}

function splitSessions(sessions: ExamSession[]) {
  return {
    activeSessions: sortSessions(sessions.filter(isActiveExamSession)),
    draftSessions: sortSessions(sessions.filter(isDraftExamSession)),
    closedSessions: sortSessions(sessions.filter(isClosedExamSession))
  };
}

function countRooms(rows: Array<{ exam_session_id: string }>) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    counts.set(row.exam_session_id, (counts.get(row.exam_session_id) || 0) + 1);
  }

  return counts;
}

function normalizeAttendancePage(value: number) {
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
}

function normalizeExamSessionFilter(value: string) {
  const filter = value.trim();
  return filter === "active" || filter === "all" || uuidPattern.test(filter)
    ? filter
    : "active";
}

function mapAttendanceAuditRow(row: AttendanceAuditRpcRow): AttendanceAuditRow {
  return {
    id: row.id,
    examSessionId: row.exam_session_id,
    studentId: row.student_id,
    studentName: row.student_name || "",
    examName: row.exam_name,
    markedInRoomId: row.marked_in_room_id,
    markedInRoomCode: row.marked_in_room_code,
    expectedRoomId: row.expected_room_id,
    expectedRoomCode: row.expected_room_code,
    markedByUserId: row.marked_by_user_id,
    markedByName: row.marked_by_name,
    markedByEmail: row.marked_by_email,
    source: row.source,
    overrideType: row.override_type,
    roomMismatch: row.room_mismatch,
    comment: row.comment || undefined,
    deviceId: row.device_id,
    createdAt: row.created_at
  };
}

function getSelectedSessionIds(sessions: ExamSession[], filter: string) {
  if (filter === "all") {
    return sessions.map((session) => session.id);
  }
  if (filter === "active") {
    return sessions.filter(isActiveExamSession).map((session) => session.id);
  }
  return uuidPattern.test(filter) ? [filter] : [];
}

async function getLocalAttendanceAuditPage(
  input: AttendanceAuditInput
): Promise<AttendanceAuditPage> {
  const store = await readStore();
  const examSessionFilter = normalizeExamSessionFilter(input.examSessionFilter);
  const pageSize = Math.min(Math.max(input.pageSize || 50, 1), 100);
  const requestedPage = normalizeAttendancePage(input.page);
  const sessionMap = new Map(store.examSessions.map((session) => [session.id, session]));
  const roomMap = new Map(store.rooms.map((room) => [room.id, room]));
  const userMap = new Map(store.users.map((user) => [user.id, user]));
  const allocationMap = new Map(
    store.studentAllocations.map((allocation) => [
      `${allocation.examSessionId}:${allocation.studentId}`,
      allocation
    ])
  );
  const selectedSessionIds = new Set(
    getSelectedSessionIds(store.examSessions, examSessionFilter)
  );
  const query = input.query.trim().toLowerCase();
  const filtered = store.attendanceEvents
    .filter((event) => {
      if (!selectedSessionIds.has(event.examSessionId)) return false;
      if (input.roomId && event.markedInRoomId !== input.roomId) return false;
      if (input.status === "standard" && event.roomMismatch) return false;
      if (input.status === "mismatch" && !event.roomMismatch) return false;
      if (input.status === "commented" && !event.comment?.trim()) return false;
      if (!query) return true;

      const allocation = allocationMap.get(`${event.examSessionId}:${event.studentId}`);
      const marker = userMap.get(event.markedByUserId);
      return [
        event.studentId,
        allocation?.studentName,
        sessionMap.get(event.examSessionId)?.name,
        marker?.fullName,
        marker?.email,
        event.comment
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((left, right) =>
      input.sort === "oldest"
        ? left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
        : right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)
    );
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const rows = filtered.slice(offset, offset + pageSize).map((event) => {
    const allocation = allocationMap.get(`${event.examSessionId}:${event.studentId}`);
    const marker = userMap.get(event.markedByUserId);
    return {
      id: event.id,
      examSessionId: event.examSessionId,
      studentId: event.studentId,
      studentName: allocation?.studentName || "",
      examName: sessionMap.get(event.examSessionId)?.name || event.examSessionId,
      markedInRoomId: event.markedInRoomId,
      markedInRoomCode: roomMap.get(event.markedInRoomId)?.code || event.markedInRoomId,
      expectedRoomId: event.expectedRoomId,
      expectedRoomCode: roomMap.get(event.expectedRoomId)?.code || event.expectedRoomId,
      markedByUserId: event.markedByUserId,
      markedByName: marker?.fullName || event.markedByUserId,
      markedByEmail: marker?.email || "",
      source: event.source,
      overrideType: event.overrideType,
      roomMismatch: event.roomMismatch,
      comment: event.comment,
      deviceId: event.deviceId,
      createdAt: event.createdAt
    } satisfies AttendanceAuditRow;
  });

  return {
    rows,
    totalCount,
    page,
    pageSize,
    totalPages,
    sessions: sortSessions(store.examSessions),
    rooms: store.rooms
      .filter((room) => selectedSessionIds.has(room.examSessionId))
      .sort((left, right) => left.code.localeCompare(right.code))
  };
}

export async function getAttendanceAuditPage(
  input: AttendanceAuditInput
): Promise<AttendanceAuditPage> {
  if (!isSupabaseConfigured()) {
    return getLocalAttendanceAuditPage(input);
  }

  const supabase = getSupabaseAdmin();
  const examSessionFilter = normalizeExamSessionFilter(input.examSessionFilter);
  const pageSize = Math.min(Math.max(input.pageSize || 50, 1), 100);
  const requestedPage = normalizeAttendancePage(input.page);
  const sessionsResponse = await supabase
    .from("exam_sessions")
    .select("id, name, exam_date, start_time, published, status, created_at")
    .order("exam_date", { ascending: false })
    .order("start_time", { ascending: false });
  let sessionRows: SessionRow[];
  if (sessionsResponse.error?.message.includes("status")) {
    const legacySessionsResponse = await supabase
      .from("exam_sessions")
      .select("id, name, exam_date, start_time, published, created_at")
      .order("exam_date", { ascending: false })
      .order("start_time", { ascending: false });
    if (legacySessionsResponse.error) {
      throw new Error(legacySessionsResponse.error.message);
    }
    sessionRows = (legacySessionsResponse.data || []) as SessionRow[];
  } else if (sessionsResponse.error) {
    throw new Error(sessionsResponse.error.message);
  } else {
    sessionRows = (sessionsResponse.data || []) as SessionRow[];
  }

  const sessions = sessionRows.map(toExamSession);
  const selectedSessionIds = getSelectedSessionIds(sessions, examSessionFilter);
  const roomsPromise = selectedSessionIds.length
    ? supabase
        .from("rooms")
        .select("id, exam_session_id, code, display_name, capacity")
        .in("exam_session_id", selectedSessionIds)
        .order("code")
    : Promise.resolve({ data: [], error: null });

  const fetchPage = async (page: number) => {
    const response = await supabase.rpc("get_attendance_audit_page", {
      p_exam_session_filter: examSessionFilter,
      p_query: input.query || null,
      p_room_id: uuidPattern.test(input.roomId) ? input.roomId : null,
      p_status: input.status || null,
      p_sort: input.sort,
      p_page: page,
      p_page_size: pageSize
    });
    if (response.error) {
      throw new Error(response.error.message);
    }
    return (response.data || []) as AttendanceAuditRpcRow[];
  };

  let [rpcRows, roomsResponse] = await Promise.all([
    fetchPage(requestedPage),
    roomsPromise
  ]);
  if (roomsResponse.error) {
    throw new Error(roomsResponse.error.message);
  }
  if (!rpcRows.length && requestedPage > 1) {
    rpcRows = await fetchPage(1);
  }

  const totalCount = rpcRows.length ? Number(rpcRows[0].total_count) : 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = rpcRows.length && requestedPage <= totalPages ? requestedPage : 1;

  return {
    rows: rpcRows.map(mapAttendanceAuditRow),
    totalCount,
    page,
    pageSize,
    totalPages,
    sessions,
    rooms: (roomsResponse.data || []).map((room) => ({
      id: String(room.id),
      examSessionId: String(room.exam_session_id),
      code: String(room.code),
      displayName: String(room.display_name),
      capacity:
        room.capacity === null || room.capacity === undefined
          ? undefined
          : Number(room.capacity)
    }))
  };
}

function mapIncidentAuditRow(row: IncidentAuditRpcRow): IncidentAuditRow {
  return {
    id: row.id,
    examSessionId: row.exam_session_id,
    studentId: row.student_id || undefined,
    examName: row.exam_name,
    roomId: row.room_id || undefined,
    roomCode: row.room_code || undefined,
    expectedRoomId: row.expected_room_id || undefined,
    expectedRoomCode: row.expected_room_code || undefined,
    userId: row.user_id || undefined,
    raisedByName: row.raised_by_name || undefined,
    raisedByEmail: row.raised_by_email || undefined,
    incidentType: row.incident_type,
    details: row.details || {},
    createdAt: row.created_at
  };
}

async function getLocalIncidentAuditPage(
  input: IncidentAuditInput
): Promise<IncidentAuditPage> {
  const store = await readStore();
  const examSessionFilter = normalizeExamSessionFilter(input.examSessionFilter);
  const pageSize = Math.min(Math.max(input.pageSize || 50, 1), 100);
  const requestedPage = normalizeAttendancePage(input.page);
  const sessionMap = new Map(store.examSessions.map((session) => [session.id, session]));
  const roomMap = new Map(store.rooms.map((room) => [room.id, room]));
  const userMap = new Map(store.users.map((user) => [user.id, user]));
  const selectedSessionIds = new Set(
    getSelectedSessionIds(store.examSessions, examSessionFilter)
  );
  const query = input.query.trim().toLowerCase();
  const filtered = store.incidents
    .filter((incident) => {
      if (!selectedSessionIds.has(incident.examSessionId)) return false;
      if (input.roomId && incident.roomId !== input.roomId) return false;
      if (input.incidentType && incident.incidentType !== input.incidentType) return false;
      if (!query) return true;

      const marker = incident.userId ? userMap.get(incident.userId) : undefined;
      const comment =
        typeof incident.details.comment === "string" ? incident.details.comment : "";
      return [
        incident.studentId,
        sessionMap.get(incident.examSessionId)?.name,
        incident.roomId ? roomMap.get(incident.roomId)?.code : undefined,
        incident.expectedRoomId
          ? roomMap.get(incident.expectedRoomId)?.code
          : undefined,
        marker?.fullName,
        marker?.email,
        comment
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((left, right) =>
      input.sort === "oldest"
        ? left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
        : right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)
    );
  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const rows = filtered.slice(offset, offset + pageSize).map((incident) => {
    const marker = incident.userId ? userMap.get(incident.userId) : undefined;
    return {
      id: incident.id,
      examSessionId: incident.examSessionId,
      studentId: incident.studentId,
      examName: sessionMap.get(incident.examSessionId)?.name || incident.examSessionId,
      roomId: incident.roomId,
      roomCode: incident.roomId
        ? roomMap.get(incident.roomId)?.code || incident.roomId
        : undefined,
      expectedRoomId: incident.expectedRoomId,
      expectedRoomCode: incident.expectedRoomId
        ? roomMap.get(incident.expectedRoomId)?.code || incident.expectedRoomId
        : undefined,
      userId: incident.userId,
      raisedByName: marker?.fullName,
      raisedByEmail: marker?.email,
      incidentType: incident.incidentType,
      details: incident.details,
      createdAt: incident.createdAt
    } satisfies IncidentAuditRow;
  });

  return {
    rows,
    totalCount,
    page,
    pageSize,
    totalPages,
    sessions: sortSessions(store.examSessions),
    rooms: store.rooms
      .filter((room) => selectedSessionIds.has(room.examSessionId))
      .sort((left, right) => left.code.localeCompare(right.code))
  };
}

export async function getIncidentAuditPage(
  input: IncidentAuditInput
): Promise<IncidentAuditPage> {
  if (!isSupabaseConfigured()) {
    return getLocalIncidentAuditPage(input);
  }

  const supabase = getSupabaseAdmin();
  const examSessionFilter = normalizeExamSessionFilter(input.examSessionFilter);
  const pageSize = Math.min(Math.max(input.pageSize || 50, 1), 100);
  const requestedPage = normalizeAttendancePage(input.page);
  const sessionsResponse = await supabase
    .from("exam_sessions")
    .select("id, name, exam_date, start_time, published, status, created_at")
    .order("exam_date", { ascending: false })
    .order("start_time", { ascending: false });
  let sessionRows: SessionRow[];

  if (sessionsResponse.error?.message.includes("status")) {
    const legacySessionsResponse = await supabase
      .from("exam_sessions")
      .select("id, name, exam_date, start_time, published, created_at")
      .order("exam_date", { ascending: false })
      .order("start_time", { ascending: false });
    if (legacySessionsResponse.error) {
      throw new Error(legacySessionsResponse.error.message);
    }
    sessionRows = (legacySessionsResponse.data || []) as SessionRow[];
  } else if (sessionsResponse.error) {
    throw new Error(sessionsResponse.error.message);
  } else {
    sessionRows = (sessionsResponse.data || []) as SessionRow[];
  }

  const sessions = sessionRows.map(toExamSession);
  const selectedSessionIds = getSelectedSessionIds(sessions, examSessionFilter);
  const roomsPromise = selectedSessionIds.length
    ? supabase
        .from("rooms")
        .select("id, exam_session_id, code, display_name, capacity")
        .in("exam_session_id", selectedSessionIds)
        .order("code")
    : Promise.resolve({ data: [], error: null });
  const fetchPage = async (page: number) => {
    const response = await supabase.rpc("get_incident_audit_page", {
      p_exam_session_filter: examSessionFilter,
      p_query: input.query || null,
      p_room_id: uuidPattern.test(input.roomId) ? input.roomId : null,
      p_incident_type: input.incidentType || null,
      p_sort: input.sort,
      p_page: page,
      p_page_size: pageSize
    });
    if (response.error) {
      throw new Error(response.error.message);
    }
    return (response.data || []) as IncidentAuditRpcRow[];
  };

  let [rpcRows, roomsResponse] = await Promise.all([
    fetchPage(requestedPage),
    roomsPromise
  ]);
  if (roomsResponse.error) {
    throw new Error(roomsResponse.error.message);
  }
  if (!rpcRows.length && requestedPage > 1) {
    rpcRows = await fetchPage(1);
  }

  const totalCount = rpcRows.length ? Number(rpcRows[0].total_count) : 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = rpcRows.length && requestedPage <= totalPages ? requestedPage : 1;

  return {
    rows: rpcRows.map(mapIncidentAuditRow),
    totalCount,
    page,
    pageSize,
    totalPages,
    sessions,
    rooms: (roomsResponse.data || []).map((room) => ({
      id: String(room.id),
      examSessionId: String(room.exam_session_id),
      code: String(room.code),
      displayName: String(room.display_name),
      capacity:
        room.capacity === null || room.capacity === undefined
          ? undefined
          : Number(room.capacity)
    }))
  };
}

export async function getExamSessionPage(
  input: ExamSessionPageInput
): Promise<ExamSessionPage> {
  const pageSize = Math.min(Math.max(input.pageSize || 20, 1), 100);
  const requestedPage = normalizeAttendancePage(input.page);

  if (!isSupabaseConfigured()) {
    const store = await readStore();
    const query = input.query.trim().toLowerCase();
    const roomCounts = countRooms(
      store.rooms.map((room) => ({ exam_session_id: room.examSessionId }))
    );
    const filtered = store.examSessions
      .filter((session) => {
        const status = session.status ?? (session.published ? "active" : "draft");
        return status === input.status && (!query || session.name.toLowerCase().includes(query));
      })
      .sort((left, right) => {
        const leftSchedule = `${left.examDate}T${left.startTime}`;
        const rightSchedule = `${right.examDate}T${right.startTime}`;
        return input.sort === "oldest"
          ? leftSchedule.localeCompare(rightSchedule) || left.id.localeCompare(right.id)
          : rightSchedule.localeCompare(leftSchedule) || right.id.localeCompare(left.id);
      });
    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;
    return {
      rows: filtered.slice(offset, offset + pageSize).map((session) => ({
        ...session,
        roomCount: roomCounts.get(session.id) || 0
      })),
      totalCount,
      page,
      pageSize,
      totalPages
    };
  }

  const supabase = getSupabaseAdmin();
  const fetchPage = async (page: number) => {
    const response = await supabase.rpc("get_exam_session_page", {
      p_status: input.status,
      p_query: input.query || null,
      p_sort: input.sort,
      p_page: page,
      p_page_size: pageSize
    });
    if (response.error) {
      throw new Error(response.error.message);
    }
    return (response.data || []) as ExamSessionRpcRow[];
  };

  let rpcRows = await fetchPage(requestedPage);
  if (!rpcRows.length && requestedPage > 1) {
    rpcRows = await fetchPage(1);
  }

  const totalCount = rpcRows.length ? Number(rpcRows[0].total_count) : 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = rpcRows.length && requestedPage <= totalPages ? requestedPage : 1;
  return {
    rows: rpcRows.map((row) => ({
      ...toExamSession(row),
      roomCount: Number(row.room_count)
    })),
    totalCount,
    page,
    pageSize,
    totalPages
  };
}

export async function getSessionsOverview(): Promise<SessionsOverview> {
  if (!isSupabaseConfigured()) {
    const store = await readStore();
    return {
      ...splitSessions(store.examSessions),
      roomCountBySessionId: countRooms(
        store.rooms.map((room) => ({ exam_session_id: room.examSessionId }))
      )
    };
  }

  const supabase = getSupabaseAdmin();
  let sessionsResponse = await supabase
    .from("exam_sessions")
    .select("id, name, exam_date, start_time, published, status, created_at");

  if (sessionsResponse.error?.message.includes("status")) {
    sessionsResponse = await supabase
      .from("exam_sessions")
      .select("id, name, exam_date, start_time, published, created_at");
  }

  const roomsResponse = await supabase.from("rooms").select("id, exam_session_id");

  if (sessionsResponse.error) {
    throw new Error(sessionsResponse.error.message);
  }

  if (roomsResponse.error) {
    throw new Error(roomsResponse.error.message);
  }

  return {
    ...splitSessions((sessionsResponse.data || []).map(toExamSession)),
    roomCountBySessionId: countRooms(roomsResponse.data || [])
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  if (!isSupabaseConfigured()) {
    const store = await readStore();
    const activeSessionIds = new Set(
      store.examSessions.filter(isActiveExamSession).map((session) => session.id)
    );

    const split = splitSessions(store.examSessions);
    const activeRoomIds = new Set(
      store.rooms
        .filter((room) => activeSessionIds.has(room.examSessionId))
        .map((room) => room.id)
    );
    const assignedRoomIds = new Set(
      store.users.flatMap((user) => user.assignedRoomIds).filter((roomId) => activeRoomIds.has(roomId))
    );
    const unassignedActiveRooms = activeRoomIds.size - assignedRoomIds.size;
    const present = store.attendanceEvents.filter((event) =>
      activeSessionIds.has(event.examSessionId)
    ).length;
    const mismatch = store.attendanceEvents.filter(
      (event) => activeSessionIds.has(event.examSessionId) && event.roomMismatch
    ).length;
    const incidents = store.incidents.filter((incident) =>
      activeSessionIds.has(incident.examSessionId)
    ).length;

    return {
      ...split,
      roomCountBySessionId: countRooms(
        store.rooms.map((room) => ({ exam_session_id: room.examSessionId }))
      ),
      overall: {
        present,
        mismatch,
        incidents
      },
      needsAttention: buildNeedsAttention({
        draftCount: split.draftSessions.length,
        incidentCount: incidents,
        mismatchCount: mismatch,
        unassignedActiveRooms
      })
    };
  }

  const overview = await getSessionsOverview();
  const activeSessionIds = overview.activeSessions.map((session) => session.id);

  if (!activeSessionIds.length) {
    return {
      ...overview,
      overall: {
        present: 0,
        mismatch: 0,
        incidents: 0
      },
      needsAttention: buildNeedsAttention({
        draftCount: overview.draftSessions.length,
        incidentCount: 0,
        mismatchCount: 0,
        unassignedActiveRooms: 0
      })
    };
  }

  const supabase = getSupabaseAdmin();
  const activeSessionIdSet = new Set(activeSessionIds);
  const [
    roomsResponse,
    assignmentsResponse,
    attendanceResponse,
    mismatchResponse,
    incidentsResponse
  ] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, exam_session_id")
      .in("exam_session_id", activeSessionIds),
    supabase.from("room_assignments").select("room_id"),
    supabase
      .from("attendance_events")
      .select("id", { count: "exact", head: true })
      .in("exam_session_id", activeSessionIds),
    supabase
      .from("attendance_events")
      .select("id", { count: "exact", head: true })
      .in("exam_session_id", activeSessionIds)
      .eq("room_mismatch", true),
    supabase
      .from("incidents")
      .select("id", { count: "exact", head: true })
      .in("exam_session_id", activeSessionIds)
  ]);

  if (roomsResponse.error) {
    throw new Error(roomsResponse.error.message);
  }

  if (assignmentsResponse.error) {
    throw new Error(assignmentsResponse.error.message);
  }

  if (attendanceResponse.error) {
    throw new Error(attendanceResponse.error.message);
  }

  if (mismatchResponse.error) {
    throw new Error(mismatchResponse.error.message);
  }

  if (incidentsResponse.error) {
    throw new Error(incidentsResponse.error.message);
  }

  const activeRoomIds = new Set(
    (roomsResponse.data || [])
      .filter((room) => activeSessionIdSet.has(room.exam_session_id))
      .map((room) => room.id)
  );
  const assignedRoomIds = new Set(
    (assignmentsResponse.data || [])
      .map((assignment) => assignment.room_id)
      .filter((roomId) => activeRoomIds.has(roomId))
  );
  const present = attendanceResponse.count || 0;
  const mismatch = mismatchResponse.count || 0;
  const incidents = incidentsResponse.count || 0;

  return {
    ...overview,
    overall: {
      present,
      mismatch,
      incidents
    },
    needsAttention: buildNeedsAttention({
      draftCount: overview.draftSessions.length,
      incidentCount: incidents,
      mismatchCount: mismatch,
      unassignedActiveRooms: activeRoomIds.size - assignedRoomIds.size
    })
  };
}

function buildNeedsAttention(input: {
  draftCount: number;
  incidentCount: number;
  mismatchCount: number;
  unassignedActiveRooms: number;
}): DashboardData["needsAttention"] {
  const items: DashboardData["needsAttention"] = [];

  if (input.incidentCount) {
    items.push({
      label: "Incidents need review",
      detail: `${input.incidentCount} incident${input.incidentCount === 1 ? "" : "s"} recorded`,
      href: "/incidents",
      tone: "warn"
    });
  }

  if (input.mismatchCount) {
    items.push({
      label: "Wrong-room overrides",
      detail: `${input.mismatchCount} mismatch-present mark${input.mismatchCount === 1 ? "" : "s"}`,
      href: "/mismatches",
      tone: "warn"
    });
  }

  if (input.unassignedActiveRooms > 0) {
    items.push({
      label: "Rooms without invigilators",
      detail: `${input.unassignedActiveRooms} active room${input.unassignedActiveRooms === 1 ? "" : "s"} unassigned`,
      href: "/sessions",
      tone: "warn"
    });
  }

  if (input.draftCount) {
    items.push({
      label: "Draft exams waiting",
      detail: `${input.draftCount} draft exam${input.draftCount === 1 ? "" : "s"} ready to manage`,
      href: "/sessions",
      tone: "neutral"
    });
  }

  if (!items.length) {
    items.push({
      label: "No urgent admin actions",
      detail: "Active exams have no open mismatch, incident, or assignment warnings.",
      href: "/sessions",
      tone: "ok"
    });
  }

  return items;
}
