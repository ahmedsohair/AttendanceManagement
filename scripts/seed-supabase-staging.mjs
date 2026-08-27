import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const expectedStagingUrl = "https://bjoguceapwquyczbhlyp.supabase.co";
const productionUrl = "https://mtoyhpyxqhfwhcrysqon.supabase.co";
const zeroUuid = "00000000-0000-0000-0000-000000000000";

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function normalizeSupabaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("STAGING_SUPABASE_URL must be a valid HTTPS URL.");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("STAGING_SUPABASE_URL must contain only the HTTPS project origin.");
  }

  return parsed.origin.toLowerCase();
}

function hashAccessCode(code) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function deterministicUuid(prefix, index) {
  return `${prefix}-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

async function expectSuccess(operation, label) {
  const result = await operation;
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result.data;
}

async function findAuthUserByEmail(supabase, email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 200) return null;
  }
}

async function ensureAuthUser(supabase, { email, password, fullName, role }) {
  const existing = await findAuthUserByEmail(supabase, email);
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role }
    });
    if (error || !data.user) {
      throw new Error(error?.message || `Unable to update ${email}.`);
    }
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role }
  });
  if (error || !data.user) {
    throw new Error(error?.message || `Unable to create ${email}.`);
  }
  return data.user;
}

async function insertInChunks(supabase, table, rows, chunkSize = 500) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    await expectSuccess(supabase.from(table).insert(chunk), `Insert ${table}`);
  }
}

async function clearApplicationData(supabase) {
  for (const table of [
    "attendance_events",
    "incidents",
    "room_assignments",
    "student_allocations",
    "rooms",
    "exam_sessions",
    "users"
  ]) {
    await expectSuccess(
      supabase.from(table).delete().neq("id", zeroUuid),
      `Clear ${table}`
    );
  }
}

async function countRows(supabase, table) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Count ${table}: ${error.message}`);
  return count ?? 0;
}

async function main() {
  const stagingUrl = normalizeSupabaseUrl(requireEnvironment("STAGING_SUPABASE_URL"));
  const serviceRoleKey = requireEnvironment("STAGING_SUPABASE_SERVICE_ROLE_KEY");
  const adminPassword = requireEnvironment("STAGING_ADMIN_PASSWORD");

  if (stagingUrl === productionUrl) {
    throw new Error("Seed refused: STAGING_SUPABASE_URL points to production.");
  }
  if (stagingUrl !== expectedStagingUrl) {
    throw new Error(`Seed refused: expected ${expectedStagingUrl}, received ${stagingUrl}.`);
  }
  if (adminPassword.length < 12) {
    throw new Error("STAGING_ADMIN_PASSWORD must contain at least 12 characters.");
  }

  const supabase = createClient(stagingUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  await clearApplicationData(supabase);

  const adminEmail = "admin.staging@example.com";
  const adminUser = await ensureAuthUser(supabase, {
    email: adminEmail,
    password: adminPassword,
    fullName: "Staging Administrator",
    role: "admin"
  });

  const invigilators = [];
  for (let index = 1; index <= 20; index += 1) {
    const sequence = String(index).padStart(4, "0");
    const accessCode = `AMS-T${String(index).padStart(3, "0")}-${sequence}`;
    const email = `invigilator${String(index).padStart(2, "0")}@example.com`;
    const fullName = `Test Invigilator ${String(index).padStart(2, "0")}`;
    const authUser = await ensureAuthUser(supabase, {
      email,
      password: accessCode,
      fullName,
      role: "invigilator"
    });
    invigilators.push({ authUser, email, fullName, accessCode });
  }

  const userRows = [
    {
      id: adminUser.id,
      email: adminEmail,
      full_name: "Staging Administrator",
      role: "admin",
      access_code_hash: null
    },
    ...invigilators.map(({ authUser, email, fullName, accessCode }) => ({
      id: authUser.id,
      email,
      full_name: fullName,
      role: "invigilator",
      access_code_hash: hashAccessCode(accessCode)
    }))
  ];
  await insertInChunks(supabase, "users", userRows);

  const activeSessionId = "10000000-0000-4000-8000-000000000001";
  const draftSessionId = "10000000-0000-4000-8000-000000000002";
  const closedSessionId = "10000000-0000-4000-8000-000000000003";
  await insertInChunks(supabase, "exam_sessions", [
    {
      id: activeSessionId,
      name: "Staging Active Exam",
      exam_date: "2030-01-15",
      start_time: "09:00",
      published: true,
      status: "active",
      created_by: adminUser.id
    },
    {
      id: draftSessionId,
      name: "Staging Draft Exam",
      exam_date: "2030-01-16",
      start_time: "13:00",
      published: false,
      status: "draft",
      created_by: adminUser.id
    },
    {
      id: closedSessionId,
      name: "Staging Closed Exam",
      exam_date: "2030-01-14",
      start_time: "09:00",
      published: false,
      status: "closed",
      created_by: adminUser.id
    }
  ]);

  const rooms = Array.from({ length: 10 }, (_, index) => ({
    id: deterministicUuid("20000000", index + 1),
    exam_session_id: activeSessionId,
    code: `TEST-${String(index + 1).padStart(2, "0")}`,
    display_name: `Test Room ${String(index + 1).padStart(2, "0")}`,
    capacity: 100
  }));
  await insertInChunks(supabase, "rooms", rooms);

  const assignments = invigilators.map(({ authUser }, index) => ({
    id: crypto.randomUUID(),
    room_id: rooms[index % rooms.length].id,
    user_id: authUser.id
  }));
  await insertInChunks(supabase, "room_assignments", assignments);

  const allocations = Array.from({ length: 1000 }, (_, index) => ({
    id: crypto.randomUUID(),
    exam_session_id: activeSessionId,
    student_id: String(9000001 + index),
    student_name: `Test Student ${String(index + 1).padStart(4, "0")}`,
    room_id: rooms[index % rooms.length].id,
    zone: `Zone ${String.fromCharCode(65 + (index % 4))}`,
    course_code: index % 2 === 0 ? "TEST1001" : "TEST2001",
    program: index % 2 === 0 ? "Test Undergraduate" : "Test Postgraduate",
    cohort: null,
    seat: String(Math.floor(index / rooms.length) + 1)
  }));
  await insertInChunks(supabase, "student_allocations", allocations);

  const attendance = Array.from({ length: 20 }, (_, index) => {
    const allocation = allocations[index];
    const roomIndex = index % rooms.length;
    return {
      id: crypto.randomUUID(),
      exam_session_id: activeSessionId,
      student_id: allocation.student_id,
      marked_by_user_id: invigilators[roomIndex].authUser.id,
      marked_in_room_id: allocation.room_id,
      expected_room_id: allocation.room_id,
      source: "manual",
      override_type: "none",
      room_mismatch: false,
      comment: "Synthetic staging attendance",
      device_id: "staging-seed"
    };
  });

  const mismatchAllocation = allocations[20];
  const mismatchRoom = rooms[1];
  attendance.push({
    id: crypto.randomUUID(),
    exam_session_id: activeSessionId,
    student_id: mismatchAllocation.student_id,
    marked_by_user_id: invigilators[1].authUser.id,
    marked_in_room_id: mismatchRoom.id,
    expected_room_id: mismatchAllocation.room_id,
    source: "manual",
    override_type: "wrong_room_present",
    room_mismatch: true,
    comment: "Synthetic wrong-room override",
    device_id: "staging-seed"
  });
  await insertInChunks(supabase, "attendance_events", attendance);

  const redirectedAllocation = allocations[21];
  const redirectRoom = rooms[2];
  await insertInChunks(supabase, "incidents", [
    {
      id: crypto.randomUUID(),
      exam_session_id: activeSessionId,
      student_id: mismatchAllocation.student_id,
      room_id: mismatchRoom.id,
      expected_room_id: mismatchAllocation.room_id,
      user_id: invigilators[1].authUser.id,
      incident_type: "wrong_room_present_override",
      details: { synthetic: true }
    },
    {
      id: crypto.randomUUID(),
      exam_session_id: activeSessionId,
      student_id: redirectedAllocation.student_id,
      room_id: redirectRoom.id,
      expected_room_id: redirectedAllocation.room_id,
      user_id: invigilators[2].authUser.id,
      incident_type: "wrong_room_redirected",
      details: { synthetic: true }
    },
    {
      id: crypto.randomUUID(),
      exam_session_id: activeSessionId,
      student_id: allocations[0].student_id,
      room_id: allocations[0].room_id,
      expected_room_id: allocations[0].room_id,
      user_id: invigilators[0].authUser.id,
      incident_type: "duplicate_attempt",
      details: { synthetic: true }
    },
    {
      id: crypto.randomUUID(),
      exam_session_id: activeSessionId,
      student_id: "9999999",
      room_id: rooms[0].id,
      expected_room_id: null,
      user_id: invigilators[0].authUser.id,
      incident_type: "student_not_found",
      details: { synthetic: true }
    }
  ]);

  const expectedCounts = {
    users: 21,
    exam_sessions: 3,
    rooms: 10,
    room_assignments: 20,
    student_allocations: 1000,
    attendance_events: 21,
    incidents: 4
  };
  for (const [table, expected] of Object.entries(expectedCounts)) {
    const actual = await countRows(supabase, table);
    if (actual !== expected) {
      throw new Error(`${table}: expected ${expected} rows, found ${actual}.`);
    }
  }

  console.log("Synthetic staging seed completed.");
  console.log(`Admin email: ${adminEmail}`);
  console.log("Invigilator test codes: AMS-T001-0001 through AMS-T020-0020");
  console.log("Students: 9000001 through 9001000");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
