import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { DataStore, ExamSession, Room, User } from "@algo-attendance/shared";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";

const dataDir = path.join(process.cwd(), "data");
const dataFile = path.join(dataDir, "store.json");
const supabasePageSize = 1000;

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

async function fetchAllRows(table: string, columns: string) {
  const supabase = getSupabaseAdmin();
  const rows: Record<string, unknown>[] = [];

  for (let from = 0; ; from += supabasePageSize) {
    const response = await supabase
      .from(table)
      .select(columns)
      .range(from, from + supabasePageSize - 1);

    if (response.error) {
      throw new Error(response.error.message);
    }

    const data = (response.data || []) as unknown as Record<string, unknown>[];
    rows.push(...data);

    if (data.length < supabasePageSize) {
      return rows;
    }
  }
}

async function readSupabaseStore(): Promise<DataStore> {
  let sessions: Record<string, unknown>[];
  try {
    sessions = await fetchAllRows(
      "exam_sessions",
      "id, name, exam_date, start_time, published, status, created_at"
    );
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("status")) {
      throw error;
    }

    sessions = await fetchAllRows(
      "exam_sessions",
      "id, name, exam_date, start_time, published, created_at"
    );
  }

  const [
    users,
    roomAssignments,
    rooms,
    allocations,
    attendance,
    incidents
  ] = await Promise.all([
    fetchAllRows("users", "id, email, full_name, role"),
    fetchAllRows("room_assignments", "room_id, user_id"),
    fetchAllRows("rooms", "id, exam_session_id, code, display_name, capacity"),
    fetchAllRows(
      "student_allocations",
      "id, exam_session_id, student_id, student_name, room_id, zone, course_code, program"
    ),
    fetchAllRows(
      "attendance_events",
      "id, exam_session_id, student_id, marked_by_user_id, marked_in_room_id, expected_room_id, source, override_type, room_mismatch, comment, device_id, created_at"
    ),
    fetchAllRows(
      "incidents",
      "id, exam_session_id, student_id, room_id, expected_room_id, user_id, incident_type, details, created_at"
    )
  ]);

  const assignedRoomsByUser = new Map<string, string[]>();
  for (const assignment of roomAssignments) {
    const userId = String(assignment.user_id);
    const current = assignedRoomsByUser.get(userId) || [];
    current.push(String(assignment.room_id));
    assignedRoomsByUser.set(userId, current);
  }

  return {
    users: users.map((row) => ({
      id: String(row.id),
      email: String(row.email),
      fullName: String(row.full_name),
      role: row.role as User["role"],
      assignedRoomIds: assignedRoomsByUser.get(String(row.id)) || []
    })),
    examSessions: sessions.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      examDate: String(row.exam_date),
      startTime: String(row.start_time),
      published: Boolean(row.published),
      status:
        (row.status as ExamSession["status"] | undefined) ??
        (row.published ? "active" : "draft"),
      createdAt: String(row.created_at)
    })),
    rooms: rooms.map((row) => ({
      id: String(row.id),
      examSessionId: String(row.exam_session_id),
      code: String(row.code),
      displayName: String(row.display_name),
      capacity: row.capacity === null || row.capacity === undefined ? undefined : Number(row.capacity)
    })),
    studentAllocations: allocations.map((row) => ({
      id: String(row.id),
      examSessionId: String(row.exam_session_id),
      studentId: String(row.student_id),
      studentName: String(row.student_name),
      roomId: String(row.room_id),
      zone: String(row.zone),
      courseCode: row.course_code === null || row.course_code === undefined ? undefined : String(row.course_code),
      program: row.program === null || row.program === undefined ? undefined : String(row.program)
    })),
    attendanceEvents: attendance.map((row) => ({
      id: String(row.id),
      examSessionId: String(row.exam_session_id),
      studentId: String(row.student_id),
      markedByUserId: String(row.marked_by_user_id),
      markedInRoomId: String(row.marked_in_room_id),
      expectedRoomId: String(row.expected_room_id),
      source: row.source as "ocr" | "manual",
      overrideType: row.override_type as "none" | "wrong_room_present",
      roomMismatch: Boolean(row.room_mismatch),
      comment: row.comment === null || row.comment === undefined ? undefined : String(row.comment),
      deviceId: String(row.device_id),
      createdAt: String(row.created_at)
    })),
    incidents: incidents.map((row) => ({
      id: String(row.id),
      examSessionId: String(row.exam_session_id),
      studentId: row.student_id === null || row.student_id === undefined ? undefined : String(row.student_id),
      roomId: row.room_id === null || row.room_id === undefined ? undefined : String(row.room_id),
      expectedRoomId: row.expected_room_id === null || row.expected_room_id === undefined ? undefined : String(row.expected_room_id),
      userId: row.user_id === null || row.user_id === undefined ? undefined : String(row.user_id),
      incidentType: row.incident_type as "wrong_room_redirected" | "wrong_room_present_override" | "duplicate_attempt" | "student_not_found",
      details:
        row.details && typeof row.details === "object"
          ? (row.details as Record<string, string | number | boolean | null | undefined>)
          : {},
      createdAt: String(row.created_at)
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
