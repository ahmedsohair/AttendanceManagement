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
  needsAttention: Array<{
    label: string;
    detail: string;
    href: string;
    tone: "warn" | "ok" | "neutral";
  }>;
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
  const [roomsResponse, assignmentsResponse, attendanceResponse, incidentsResponse] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, exam_session_id")
      .in("exam_session_id", activeSessionIds),
    supabase.from("room_assignments").select("room_id"),
    supabase
      .from("attendance_events")
      .select("exam_session_id, room_mismatch")
      .in("exam_session_id", activeSessionIds),
    supabase
      .from("incidents")
      .select("exam_session_id")
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
  const present = (attendanceResponse.data || []).length;
  const mismatch = (attendanceResponse.data || []).filter((event) => event.room_mismatch)
    .length;
  const incidents = (incidentsResponse.data || []).length;

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
