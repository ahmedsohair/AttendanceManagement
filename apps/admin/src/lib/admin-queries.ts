import "server-only";

import {
  isActiveExamSession,
  isClosedExamSession,
  isDraftExamSession,
  type ExamSession
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
};

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

  const roomsResponse = await supabase.from("rooms").select("exam_session_id");

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

    return {
      ...splitSessions(store.examSessions),
      roomCountBySessionId: countRooms(
        store.rooms.map((room) => ({ exam_session_id: room.examSessionId }))
      ),
      overall: {
        present: store.attendanceEvents.filter((event) =>
          activeSessionIds.has(event.examSessionId)
        ).length,
        mismatch: store.attendanceEvents.filter(
          (event) => activeSessionIds.has(event.examSessionId) && event.roomMismatch
        ).length,
        incidents: store.incidents.filter((incident) =>
          activeSessionIds.has(incident.examSessionId)
        ).length
      }
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
      }
    };
  }

  const supabase = getSupabaseAdmin();
  const [attendanceResponse, incidentsResponse] = await Promise.all([
    supabase
      .from("attendance_events")
      .select("exam_session_id, room_mismatch")
      .in("exam_session_id", activeSessionIds),
    supabase
      .from("incidents")
      .select("exam_session_id")
      .in("exam_session_id", activeSessionIds)
  ]);

  if (attendanceResponse.error) {
    throw new Error(attendanceResponse.error.message);
  }

  if (incidentsResponse.error) {
    throw new Error(incidentsResponse.error.message);
  }

  return {
    ...overview,
    overall: {
      present: (attendanceResponse.data || []).length,
      mismatch: (attendanceResponse.data || []).filter((event) => event.room_mismatch)
        .length,
      incidents: (incidentsResponse.data || []).length
    }
  };
}
