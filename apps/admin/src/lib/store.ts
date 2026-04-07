import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { DataStore, ExamSession, Room, User } from "@algo-attendance/shared";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";

const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "store.json");

const seedUsers: User[] = [
  {
    id: crypto.randomUUID(),
    email: "admin@rmit-demo.local",
    fullName: "Admin User",
    role: "admin",
    assignedRoomIds: []
  },
  {
    id: crypto.randomUUID(),
    email: "invigilator1@rmit-demo.local",
    fullName: "Invigilator One",
    role: "invigilator",
    assignedRoomIds: []
  },
  {
    id: crypto.randomUUID(),
    email: "invigilator2@rmit-demo.local",
    fullName: "Invigilator Two",
    role: "invigilator",
    assignedRoomIds: []
  }
];

function buildSeedStore(): DataStore {
  return {
    users: seedUsers,
    examSessions: [],
    rooms: [],
    studentAllocations: [],
    attendanceEvents: [],
    incidents: []
  };
}

async function ensureStore() {
  await mkdir(dataDir, { recursive: true });
  try {
    await readFile(dataFile, "utf8");
  } catch {
    await writeFile(dataFile, JSON.stringify(buildSeedStore(), null, 2), "utf8");
  }
}

async function readFileStore(): Promise<DataStore> {
  await ensureStore();
  const raw = await readFile(dataFile, "utf8");
  return JSON.parse(raw) as DataStore;
}

async function readSupabaseStore(): Promise<DataStore> {
  const supabase = getSupabaseAdmin();

  const [
    usersResponse,
    roomAssignmentsResponse,
    sessionsResponse,
    roomsResponse,
    allocationsResponse,
    attendanceResponse,
    incidentsResponse
  ] = await Promise.all([
    supabase.from("users").select("id, email, full_name, role"),
    supabase.from("room_assignments").select("room_id, user_id"),
    supabase
      .from("exam_sessions")
      .select("id, name, exam_date, start_time, published, created_at"),
    supabase.from("rooms").select("id, exam_session_id, code, display_name, capacity"),
    supabase
      .from("student_allocations")
      .select(
        "id, exam_session_id, student_id, student_name, room_id, zone, course_code, program"
      ),
    supabase
      .from("attendance_events")
      .select(
        "id, exam_session_id, student_id, marked_by_user_id, marked_in_room_id, expected_room_id, source, override_type, room_mismatch, comment, device_id, created_at"
      ),
    supabase
      .from("incidents")
      .select(
        "id, exam_session_id, student_id, room_id, expected_room_id, user_id, incident_type, details, created_at"
      )
  ]);

  const responses = [
    usersResponse,
    roomAssignmentsResponse,
    sessionsResponse,
    roomsResponse,
    allocationsResponse,
    attendanceResponse,
    incidentsResponse
  ];

  for (const response of responses) {
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  const assignedRoomsByUser = new Map<string, string[]>();
  for (const assignment of roomAssignmentsResponse.data || []) {
    const current = assignedRoomsByUser.get(assignment.user_id) || [];
    current.push(assignment.room_id);
    assignedRoomsByUser.set(assignment.user_id, current);
  }

  return {
    users: (usersResponse.data || []).map((row) => ({
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      assignedRoomIds: assignedRoomsByUser.get(row.id) || []
    })),
    examSessions: (sessionsResponse.data || []).map((row) => ({
      id: row.id,
      name: row.name,
      examDate: row.exam_date,
      startTime: row.start_time,
      published: row.published,
      createdAt: row.created_at
    })),
    rooms: (roomsResponse.data || []).map((row) => ({
      id: row.id,
      examSessionId: row.exam_session_id,
      code: row.code,
      displayName: row.display_name,
      capacity: row.capacity ?? undefined
    })),
    studentAllocations: (allocationsResponse.data || []).map((row) => ({
      id: row.id,
      examSessionId: row.exam_session_id,
      studentId: row.student_id,
      studentName: row.student_name,
      roomId: row.room_id,
      zone: row.zone,
      courseCode: row.course_code ?? undefined,
      program: row.program ?? undefined
    })),
    attendanceEvents: (attendanceResponse.data || []).map((row) => ({
      id: row.id,
      examSessionId: row.exam_session_id,
      studentId: row.student_id,
      markedByUserId: row.marked_by_user_id,
      markedInRoomId: row.marked_in_room_id,
      expectedRoomId: row.expected_room_id,
      source: row.source,
      overrideType: row.override_type,
      roomMismatch: row.room_mismatch,
      comment: row.comment ?? undefined,
      deviceId: row.device_id,
      createdAt: row.created_at
    })),
    incidents: (incidentsResponse.data || []).map((row) => ({
      id: row.id,
      examSessionId: row.exam_session_id,
      studentId: row.student_id ?? undefined,
      roomId: row.room_id ?? undefined,
      expectedRoomId: row.expected_room_id ?? undefined,
      userId: row.user_id ?? undefined,
      incidentType: row.incident_type,
      details:
        row.details && typeof row.details === "object"
          ? (row.details as Record<string, string | number | boolean | null | undefined>)
          : {},
      createdAt: row.created_at
    }))
  };
}

export async function readStore(): Promise<DataStore> {
  if (isSupabaseConfigured()) {
    return readSupabaseStore();
  }

  return readFileStore();
}

export async function writeStore(store: DataStore): Promise<void> {
  if (isSupabaseConfigured()) {
    throw new Error(
      "writeStore is disabled when Supabase is configured. Use explicit mutation helpers."
    );
  }

  await ensureStore();
  await writeFile(dataFile, JSON.stringify(store, null, 2), "utf8");
}

export function nextId() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

export function buildRoomIndex(
  sessions: ExamSession[],
  rooms: Room[]
): Record<string, { session: ExamSession; room: Room }> {
  const sessionMap = new Map(sessions.map((session) => [session.id, session]));
  return rooms.reduce<Record<string, { session: ExamSession; room: Room }>>(
    (acc, room) => {
      const session = sessionMap.get(room.examSessionId);
      if (session) {
        acc[room.id] = { session, room };
      }
      return acc;
    },
    {}
  );
}
