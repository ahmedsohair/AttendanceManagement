import { createHash } from "node:crypto";
import {
  lookupStudent,
  markAttendance,
  normalizeImportPayload,
  type AttendanceEvent,
  type DataStore,
  type ExamSession,
  type Incident,
  type LookupRequest,
  type LookupResult,
  type MarkAttendanceRequest,
  type Room,
  type SessionImportPayload,
  type StudentAllocation,
  type User
} from "@algo-attendance/shared";
import { generateAccessCode, hashAccessCode } from "./access-code";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { nextId, nowIso, readStore, writeStore } from "./store";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function userWithAssignments(
  base: {
    id: string;
    email: string;
    full_name?: string;
    fullName?: string;
    role: "admin" | "invigilator";
  },
  assignedRoomIds: string[] = []
): User {
  return {
    id: base.id,
    email: base.email,
    fullName: base.full_name || base.fullName || base.email.split("@")[0],
    role: base.role,
    assignedRoomIds
  };
}

async function findAuthUserByEmail(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  email: string
) {
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200
    });

    if (error) {
      throw new Error(error.message);
    }

    const match = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email
    );
    if (match) {
      return match;
    }

    if (data.users.length < 200) {
      return null;
    }

    page += 1;
  }
}

async function resolveAssignedRoomIds(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  roomIds: string[]
) {
  const normalizedRoomIds = roomIds.map((roomId) => roomId.trim()).filter(Boolean);

  if (!normalizedRoomIds.length) {
    return [];
  }

  const [roomsResponse, sessionsResponse] = await Promise.all([
    supabase.from("rooms").select("id, code, exam_session_id"),
    supabase
      .from("exam_sessions")
      .select("id, published, status, created_at, exam_date, start_time")
  ]);

  if (roomsResponse.error) {
    throw new Error(roomsResponse.error.message);
  }

  if (sessionsResponse.error) {
    throw new Error(sessionsResponse.error.message);
  }

  const rooms = roomsResponse.data || [];
  const sessions = sessionsResponse.data || [];
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const roomsById = new Map(rooms.map((room) => [room.id, room]));
  const roomsBySessionAndCode = new Map(
    rooms.map((room) => [`${room.exam_session_id}:${room.code}`, room])
  );
  const roomsByCode = new Map<string, typeof rooms>();

  for (const room of rooms) {
    const current = roomsByCode.get(room.code) || [];
    current.push(room);
    roomsByCode.set(room.code, current);
  }

  const resolved = new Set<string>();

  for (const rawRoomId of normalizedRoomIds) {
    if (roomsById.has(rawRoomId)) {
      resolved.add(rawRoomId);
      continue;
    }

    const separatorIndex = rawRoomId.indexOf(":");
    const legacySessionId =
      separatorIndex >= 0 ? rawRoomId.slice(0, separatorIndex) : "";
    const legacyRoomCode =
      separatorIndex >= 0 ? rawRoomId.slice(separatorIndex + 1) : rawRoomId;

    const exactLegacyMatch = roomsBySessionAndCode.get(
      `${legacySessionId}:${legacyRoomCode}`
    );
    if (exactLegacyMatch) {
      resolved.add(exactLegacyMatch.id);
      continue;
    }

    const candidates = [...(roomsByCode.get(legacyRoomCode) || [])].sort((left, right) => {
      const leftSession = sessionById.get(left.exam_session_id);
      const rightSession = sessionById.get(right.exam_session_id);
      const leftPublished = leftSession?.status === "active" || leftSession?.published ? 1 : 0;
      const rightPublished = rightSession?.status === "active" || rightSession?.published ? 1 : 0;

      return (
        rightPublished - leftPublished ||
        `${rightSession?.exam_date || ""}T${rightSession?.start_time || ""}`.localeCompare(
          `${leftSession?.exam_date || ""}T${leftSession?.start_time || ""}`
        ) ||
        (rightSession?.created_at || "").localeCompare(leftSession?.created_at || "")
      );
    });

    if (candidates[0]) {
      resolved.add(candidates[0].id);
    }
  }

  return Array.from(resolved);
}

function assertUuid(value: string | null | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${label} is missing.`);
  }

  if (!uuidPattern.test(normalized)) {
    throw new Error(`${label} is invalid: ${normalized}`);
  }

  return normalized;
}

function normalizeAssignmentSnapshot(
  roomAssignments: Array<{ roomId: string; invigilatorIds: string[] }>
) {
  return roomAssignments
    .map((assignment) => ({
      roomId: assignment.roomId,
      invigilatorIds: Array.from(new Set(assignment.invigilatorIds)).sort()
    }))
    .sort((left, right) => left.roomId.localeCompare(right.roomId));
}

function sameAssignmentSnapshot(
  left: Array<{ roomId: string; invigilatorIds: string[] }>,
  right: Array<{ roomId: string; invigilatorIds: string[] }>
) {
  return (
    JSON.stringify(normalizeAssignmentSnapshot(left)) ===
    JSON.stringify(normalizeAssignmentSnapshot(right))
  );
}

export async function ensureUser(email: string, fullName?: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!isSupabaseConfigured()) {
    const store = await readStore();
    let user = store.users.find(
      (candidate) => candidate.email.toLowerCase() === normalizedEmail
    );

    if (!user) {
      user = {
        id: nextId(),
        email: normalizedEmail,
        fullName: fullName || normalizedEmail.split("@")[0],
        role: "invigilator",
        assignedRoomIds: []
      };
      store.users.push(user);
      await writeStore(store);
    }

    return user;
  }

  const supabase = getSupabaseAdmin();
  const existingResponse = await supabase
    .from("users")
    .select("id, email, full_name, role")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existingResponse.error) {
    throw new Error(existingResponse.error.message);
  }

  let row = existingResponse.data;
  if (!row) {
    const insertResponse = await supabase
      .from("users")
      .insert({
        id: nextId(),
        email: normalizedEmail,
        full_name: fullName || normalizedEmail.split("@")[0],
        role: "invigilator"
      })
      .select("id, email, full_name, role")
      .single();

    if (insertResponse.error) {
      throw new Error(insertResponse.error.message);
    }

    row = insertResponse.data;
  }

  const assignmentsResponse = await supabase
    .from("room_assignments")
    .select("room_id")
    .eq("user_id", row.id);

  if (assignmentsResponse.error) {
    throw new Error(assignmentsResponse.error.message);
  }

  return userWithAssignments(
    row,
    (assignmentsResponse.data || []).map((assignment) => assignment.room_id)
  );
}

export async function createInvigilator(input: {
  email: string;
  fullName: string;
  assignedRoomIds: string[];
}) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const accessCode = generateAccessCode();
  const accessCodeHash = hashAccessCode(accessCode);
  const requestedAssignedRoomIds = input.assignedRoomIds.map((roomId) => roomId.trim()).filter(Boolean);

  if (!isSupabaseConfigured()) {
    const store = await readStore();
    const existing = store.users.find(
      (user) => user.email.toLowerCase() === normalizedEmail
    );
    if (existing) {
      throw new Error("An invigilator with this email already exists.");
    }

    const userId = nextId();
    store.users.push({
      id: userId,
      email: normalizedEmail,
      fullName: input.fullName,
      role: "invigilator",
      assignedRoomIds: requestedAssignedRoomIds,
      accessCodeHash,
      accessCodeCreatedAt: nowIso(),
      accessCodeActivatedAt: nowIso()
    });

    await writeStore(store);
    return { accessCode, userId };
  }

  const supabase = getSupabaseAdmin();
  const existingResponse = await supabase
    .from("users")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (existingResponse.error) {
    throw new Error(existingResponse.error.message);
  }

  const existingPublicUserId = existingResponse.data?.id ?? null;
  const existingAssignmentsResponse = existingPublicUserId
    ? await supabase
        .from("room_assignments")
        .select("room_id")
        .eq("user_id", existingPublicUserId)
    : null;

  if (existingAssignmentsResponse?.error) {
    throw new Error(existingAssignmentsResponse.error.message);
  }

  const existingAssignedRoomIds =
    existingAssignmentsResponse?.data?.map((assignment) => assignment.room_id) || [];
  const targetAssignedRoomIds = requestedAssignedRoomIds.length
    ? await resolveAssignedRoomIds(supabase, requestedAssignedRoomIds)
    : existingAssignedRoomIds;

  const existingAuthUser = await findAuthUserByEmail(supabase, normalizedEmail);

  if (existingPublicUserId || existingAuthUser) {
    throw new Error(
      "An invigilator with this email already exists. Edit their room assignments instead."
    );
  }

  const authResponse = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password: accessCode,
    email_confirm: true,
    user_metadata: {
      full_name: input.fullName,
      role: "invigilator"
    }
  });

  if (authResponse.error || !authResponse.data.user) {
    throw new Error(authResponse.error?.message || "Unable to create auth account.");
  }

  const authUser = authResponse.data.user;
  const authUserId = assertUuid(authUser.id, "Auth user ID");

  if (!existingPublicUserId) {
    const insertUserResponse = await supabase.from("users").insert({
      id: authUserId,
      email: normalizedEmail,
      full_name: input.fullName,
      role: "invigilator",
      access_code_hash: accessCodeHash,
      access_code_created_at: nowIso(),
      access_code_activated_at: nowIso()
    });

    if (insertUserResponse.error) {
      await supabase.auth.admin.deleteUser(authUserId).catch(() => undefined);
      throw new Error(insertUserResponse.error.message);
    }
  } else if (assertUuid(existingPublicUserId, "Existing user ID") === authUserId) {
    const updateUserResponse = await supabase
      .from("users")
      .update({
        email: normalizedEmail,
        full_name: input.fullName,
        role: "invigilator",
        access_code_hash: accessCodeHash,
        access_code_created_at: nowIso(),
        access_code_activated_at: nowIso()
      })
      .eq("id", authUserId);

    if (updateUserResponse.error) {
      throw new Error(updateUserResponse.error.message);
    }
  } else {
    const previousUserId = assertUuid(existingPublicUserId, "Existing user ID");
    const insertOrUpdateResponse = await supabase.from("users").upsert(
      {
        id: authUserId,
        email: normalizedEmail,
        full_name: input.fullName,
        role: "invigilator",
        access_code_hash: accessCodeHash,
        access_code_created_at: nowIso(),
        access_code_activated_at: nowIso()
      },
      { onConflict: "id" }
    );

    if (insertOrUpdateResponse.error) {
      throw new Error(insertOrUpdateResponse.error.message);
    }

    const [attendanceMigration, incidentMigration, roomAssignmentDelete] = await Promise.all([
      supabase
        .from("attendance_events")
        .update({ marked_by_user_id: authUserId })
        .eq("marked_by_user_id", previousUserId),
      supabase.from("incidents").update({ user_id: authUserId }).eq("user_id", previousUserId),
      supabase.from("room_assignments").delete().eq("user_id", previousUserId)
    ]);

    if (attendanceMigration.error) {
      throw new Error(attendanceMigration.error.message);
    }

    if (incidentMigration.error) {
      throw new Error(incidentMigration.error.message);
    }

    if (roomAssignmentDelete.error) {
      throw new Error(roomAssignmentDelete.error.message);
    }

    const deleteOldUserResponse = await supabase
      .from("users")
      .delete()
      .eq("id", previousUserId);

    if (deleteOldUserResponse.error) {
      throw new Error(deleteOldUserResponse.error.message);
    }
  }

  const clearAssignmentsResponse = await supabase
    .from("room_assignments")
    .delete()
    .eq("user_id", authUserId);

  if (clearAssignmentsResponse.error) {
    throw new Error(clearAssignmentsResponse.error.message);
  }

  const validAssignedRoomIds = targetAssignedRoomIds.filter((roomId) => uuidPattern.test(roomId));

  if (targetAssignedRoomIds.length && !validAssignedRoomIds.length) {
    throw new Error("No valid room assignments were resolved for this invigilator.");
  }

  if (validAssignedRoomIds.length) {
    const assignmentsResponse = await supabase.from("room_assignments").insert(
      validAssignedRoomIds.map((roomId) => ({
        id: nextId(),
        room_id: roomId,
        user_id: authUserId
      }))
    );

    if (assignmentsResponse.error) {
      throw new Error(assignmentsResponse.error.message);
    }
  }

  return { accessCode, userId: authUserId };
}

export async function stageInvigilatorAccessCode(userIdInput: string, actorUserId: string) {
  const accessCode = generateAccessCode();
  const accessCodeHash = hashAccessCode(accessCode);

  if (!isSupabaseConfigured()) {
    const store = await readStore();
    const user = store.users.find((candidate) => candidate.id === userIdInput);

    if (!user || user.role !== "invigilator") {
      throw new Error("Invigilator not found.");
    }

    user.pendingAccessCodeHash = accessCodeHash;
    user.accessCodeCreatedAt = nowIso();
    await writeStore(store);
    return { accessCode, status: "pending" as const };
  }

  const userId = assertUuid(userIdInput, "Invigilator ID");
  const response = await getSupabaseAdmin().rpc("stage_invigilator_access_code", {
    p_actor_user_id: assertUuid(actorUserId, "Administrator ID"),
    p_user_id: userId,
    p_access_code_hash: accessCodeHash
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return { accessCode, status: "pending" as const };
}

export async function activateInvigilatorAccessCode(
  userIdInput: string,
  accessCodeInput: string,
  actorUserId: string
) {
  const accessCode = accessCodeInput.trim();
  const accessCodeHash = hashAccessCode(accessCode);

  if (!accessCode || !accessCodeHash) {
    throw new Error("A pending access code is required.");
  }

  if (!isSupabaseConfigured()) {
    const store = await readStore();
    const user = store.users.find((candidate) => candidate.id === userIdInput);

    if (!user || user.role !== "invigilator") {
      throw new Error("Invigilator not found.");
    }
    if (user.pendingAccessCodeHash !== accessCodeHash) {
      throw new Error("Pending access code does not match.");
    }

    user.accessCodeRevokedAt = user.accessCodeHash ? nowIso() : user.accessCodeRevokedAt;
    user.accessCodeHash = accessCodeHash;
    user.pendingAccessCodeHash = undefined;
    user.accessCodeActivatedAt = nowIso();
    user.accessCodeEmailedAt = undefined;
    await writeStore(store);
    return { status: "active" as const };
  }

  const userId = assertUuid(userIdInput, "Invigilator ID");
  const supabase = getSupabaseAdmin();
  const userResponse = await supabase
    .from("users")
    .select("id, role, pending_access_code_hash")
    .eq("id", userId)
    .maybeSingle();

  if (userResponse.error) {
    throw new Error(userResponse.error.message);
  }
  if (!userResponse.data || userResponse.data.role !== "invigilator") {
    throw new Error("Invigilator not found.");
  }
  if (userResponse.data.pending_access_code_hash !== accessCodeHash) {
    throw new Error("Pending access code does not match.");
  }

  const authResponse = await supabase.auth.admin.updateUserById(userId, {
    password: accessCode
  });

  if (authResponse.error) {
    throw new Error(authResponse.error.message);
  }

  const activationResponse = await supabase.rpc("activate_invigilator_access_code", {
    p_actor_user_id: assertUuid(actorUserId, "Administrator ID"),
    p_user_id: userId,
    p_access_code_hash: accessCodeHash
  });

  if (activationResponse.error) {
    throw new Error(
      `Authentication was updated but activation needs to be retried: ${activationResponse.error.message}`
    );
  }

  return { status: "active" as const };
}

export async function recordInvigilatorAccessCodeEmailed(
  userIdInput: string,
  accessCodeInput: string
) {
  const accessCodeHash = hashAccessCode(accessCodeInput.trim());
  if (!accessCodeHash) {
    throw new Error("Access code is required.");
  }

  if (!isSupabaseConfigured()) {
    const store = await readStore();
    const user = store.users.find((candidate) => candidate.id === userIdInput);
    if (!user || user.role !== "invigilator" || user.accessCodeHash !== accessCodeHash) {
      throw new Error("Active access code does not match.");
    }
    user.accessCodeEmailedAt = nowIso();
    await writeStore(store);
    return;
  }

  const response = await getSupabaseAdmin().rpc("record_invigilator_access_code_emailed", {
    p_user_id: assertUuid(userIdInput, "Invigilator ID"),
    p_access_code_hash: accessCodeHash
  });
  if (response.error) {
    throw new Error(response.error.message);
  }
}

export async function updateInvigilatorDetails(input: {
  userId: string;
  email: string;
  fullName: string;
}) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim() || normalizedEmail.split("@")[0] || "Invigilator";

  if (!normalizedEmail) {
    throw new Error("Email is required.");
  }

  if (!isSupabaseConfigured()) {
    const store = await readStore();
    const user = store.users.find((candidate) => candidate.id === input.userId);

    if (!user || user.role !== "invigilator") {
      throw new Error("Invigilator not found.");
    }

    const duplicate = store.users.find(
      (candidate) =>
        candidate.id !== input.userId &&
        candidate.email.toLowerCase() === normalizedEmail
    );

    if (duplicate) {
      throw new Error("Another user already has this email address.");
    }

    user.email = normalizedEmail;
    user.fullName = fullName;
    await writeStore(store);
    return;
  }

  const userId = assertUuid(input.userId, "Invigilator ID");
  const supabase = getSupabaseAdmin();
  const userResponse = await supabase
    .from("users")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (userResponse.error) {
    throw new Error(userResponse.error.message);
  }

  if (!userResponse.data || userResponse.data.role !== "invigilator") {
    throw new Error("Invigilator not found.");
  }

  const duplicateResponse = await supabase
    .from("users")
    .select("id")
    .eq("email", normalizedEmail)
    .neq("id", userId)
    .maybeSingle();

  if (duplicateResponse.error) {
    throw new Error(duplicateResponse.error.message);
  }

  if (duplicateResponse.data) {
    throw new Error("Another user already has this email address.");
  }

  const authResponse = await supabase.auth.admin.updateUserById(userId, {
    email: normalizedEmail,
    user_metadata: {
      full_name: fullName,
      role: "invigilator"
    }
  });

  if (authResponse.error) {
    throw new Error(authResponse.error.message);
  }

  const updateResponse = await supabase
    .from("users")
    .update({
      email: normalizedEmail,
      full_name: fullName
    })
    .eq("id", userId);

  if (updateResponse.error) {
    throw new Error(updateResponse.error.message);
  }
}

export async function deleteInvigilator(userIdInput: string) {
  if (!isSupabaseConfigured()) {
    const store = await readStore();
    const user = store.users.find((candidate) => candidate.id === userIdInput);

    if (!user || user.role !== "invigilator") {
      throw new Error("Invigilator not found.");
    }

    const hasAuditHistory =
      store.attendanceEvents.some((event) => event.markedByUserId === userIdInput) ||
      store.incidents.some((incident) => incident.userId === userIdInput);

    if (hasAuditHistory) {
      throw new Error(
        "This invigilator has audit history and cannot be deleted. Remove their room assignments instead."
      );
    }

    store.users = store.users.filter((candidate) => candidate.id !== userIdInput);
    await writeStore(store);
    return;
  }

  const userId = assertUuid(userIdInput, "Invigilator ID");
  const supabase = getSupabaseAdmin();
  const userResponse = await supabase
    .from("users")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (userResponse.error) {
    throw new Error(userResponse.error.message);
  }

  if (!userResponse.data || userResponse.data.role !== "invigilator") {
    throw new Error("Invigilator not found.");
  }

  const [attendanceResponse, incidentResponse] = await Promise.all([
    supabase
      .from("attendance_events")
      .select("id")
      .eq("marked_by_user_id", userId)
      .limit(1),
    supabase.from("incidents").select("id").eq("user_id", userId).limit(1)
  ]);

  if (attendanceResponse.error) {
    throw new Error(attendanceResponse.error.message);
  }

  if (incidentResponse.error) {
    throw new Error(incidentResponse.error.message);
  }

  if ((attendanceResponse.data || []).length || (incidentResponse.data || []).length) {
    throw new Error(
      "This invigilator has audit history and cannot be deleted. Remove their room assignments instead."
    );
  }

  const assignmentDeleteResponse = await supabase
    .from("room_assignments")
    .delete()
    .eq("user_id", userId);

  if (assignmentDeleteResponse.error) {
    throw new Error(assignmentDeleteResponse.error.message);
  }

  const userDeleteResponse = await supabase.from("users").delete().eq("id", userId);

  if (userDeleteResponse.error) {
    throw new Error(userDeleteResponse.error.message);
  }

  const authDeleteResponse = await supabase.auth.admin.deleteUser(userId);

  if (authDeleteResponse.error) {
    throw new Error(authDeleteResponse.error.message);
  }
}

export async function updateInvigilatorRoomAssignments(input: {
  userId: string;
  assignedRoomIds: string[];
}) {
  const requestedAssignedRoomIds = input.assignedRoomIds
    .map((roomId) => roomId.trim())
    .filter(Boolean);

  if (!isSupabaseConfigured()) {
    const store = await readStore();
    const user = store.users.find((candidate) => candidate.id === input.userId);

    if (!user || user.role !== "invigilator") {
      throw new Error("Invigilator not found.");
    }

    user.assignedRoomIds = Array.from(new Set(requestedAssignedRoomIds));
    await writeStore(store);
    return;
  }

  const userId = assertUuid(input.userId, "Invigilator ID");
  const validAssignedRoomIds = Array.from(
    new Set(requestedAssignedRoomIds.filter((roomId) => uuidPattern.test(roomId)))
  );

  const supabase = getSupabaseAdmin();
  const userResponse = await supabase
    .from("users")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (userResponse.error) {
    throw new Error(userResponse.error.message);
  }

  if (!userResponse.data || userResponse.data.role !== "invigilator") {
    throw new Error("Invigilator not found.");
  }

  const clearAssignmentsResponse = await supabase
    .from("room_assignments")
    .delete()
    .eq("user_id", userId);

  if (clearAssignmentsResponse.error) {
    throw new Error(clearAssignmentsResponse.error.message);
  }

  if (!validAssignedRoomIds.length) {
    return;
  }

  const assignmentsResponse = await supabase.from("room_assignments").insert(
    validAssignedRoomIds.map((roomId) => ({
      id: nextId(),
      room_id: roomId,
      user_id: userId
    }))
  );

  if (assignmentsResponse.error) {
    throw new Error(assignmentsResponse.error.message);
  }
}

export async function updateExamRoomAssignments(input: {
  actorUserId: string;
  examSessionId: string;
  expectedRoomAssignments?: Array<{
    roomId: string;
    invigilatorIds: string[];
  }>;
  roomAssignments: Array<{
    roomId: string;
    invigilatorIds: string[];
  }>;
}) {
  const examSessionId = input.examSessionId.trim();

  if (!isSupabaseConfigured()) {
    const store = await readStore();
    const session = store.examSessions.find((item) => item.id === examSessionId);

    if (!session) {
      throw new Error("Session not found.");
    }

    if ((session.status || (session.published ? "active" : "draft")) === "closed") {
      throw new Error("Closed exams are read-only. Room assignments cannot be changed.");
    }

    const sessionRooms = store.rooms.filter((room) => room.examSessionId === examSessionId);
    const sessionRoomIds = new Set(sessionRooms.map((room) => room.id));
    const submittedRoomIds = new Set(input.roomAssignments.map((assignment) => assignment.roomId));

    if (submittedRoomIds.size !== sessionRoomIds.size) {
      throw new Error("Assignment payload must include every room in this exam.");
    }

    for (const roomId of submittedRoomIds) {
      if (!sessionRoomIds.has(roomId)) {
        throw new Error("Assignment payload includes a room outside this exam.");
      }
    }

    const validInvigilatorIds = new Set(
      store.users.filter((user) => user.role === "invigilator").map((user) => user.id)
    );
    const validRoomIds = new Set(sessionRoomIds);
    const assignmentsByUserId = new Map<string, Set<string>>();
    const currentRoomAssignments = sessionRooms.map((room) => ({
      roomId: room.id,
      invigilatorIds: store.users
        .filter((user) => user.assignedRoomIds.includes(room.id))
        .map((user) => user.id)
    }));

    if (
      input.expectedRoomAssignments &&
      !sameAssignmentSnapshot(input.expectedRoomAssignments, currentRoomAssignments)
    ) {
      throw new Error(
        "Room assignments changed since this page loaded. Refresh before saving."
      );
    }

    for (const assignment of input.roomAssignments) {
      if (!validRoomIds.has(assignment.roomId)) {
        throw new Error("Assignment payload includes a room outside this exam.");
      }

      for (const invigilatorId of assignment.invigilatorIds) {
        if (!validInvigilatorIds.has(invigilatorId)) {
          throw new Error("Assignment payload includes an unknown invigilator.");
        }

        const current = assignmentsByUserId.get(invigilatorId) || new Set<string>();
        current.add(assignment.roomId);
        assignmentsByUserId.set(invigilatorId, current);
      }
    }

    for (const user of store.users.filter((candidate) => candidate.role === "invigilator")) {
      const otherExamRoomIds = user.assignedRoomIds.filter(
        (roomId) => !sessionRoomIds.has(roomId)
      );
      const selectedSessionRoomIds = Array.from(assignmentsByUserId.get(user.id) || []);
      user.assignedRoomIds = Array.from(
        new Set([...otherExamRoomIds, ...selectedSessionRoomIds])
      );
    }

    await writeStore(store);
    return sessionRooms.map((room) => ({
      roomId: room.id,
      invigilatorIds: Array.from(
        assignmentsByUserId.entries()
      )
        .filter(([, roomIds]) => roomIds.has(room.id))
        .map(([userId]) => userId)
        .sort()
    }));
  }

  const sessionId = assertUuid(examSessionId, "Exam session ID");
  if (!input.expectedRoomAssignments) {
    throw new Error("The assignment page is missing its concurrency snapshot. Refresh and try again.");
  }

  const normalizeAssignments = (
    assignments: Array<{ roomId: string; invigilatorIds: string[] }>
  ) => assignments.map((assignment) => ({
    roomId: assertUuid(assignment.roomId, "Room ID"),
    invigilatorIds: Array.from(new Set(assignment.invigilatorIds)).map((userId) =>
      assertUuid(userId, "Invigilator ID")
    )
  }));
  const expectedAssignments = normalizeAssignments(input.expectedRoomAssignments);
  const submittedAssignments = normalizeAssignments(input.roomAssignments);
  const response = await getSupabaseAdmin().rpc("replace_room_assignments_atomic", {
    p_actor_user_id: assertUuid(input.actorUserId, "Administrator ID"),
    p_exam_session_id: sessionId,
    p_expected_assignments: expectedAssignments,
    p_room_assignments: submittedAssignments
  });

  if (response.error) {
    throw new Error(response.error.message);
  }
  if (!response.data || typeof response.data !== "object" || Array.isArray(response.data)) {
    throw new Error("Atomic room assignment returned an invalid response.");
  }

  const committed = response.data as Record<string, unknown>;
  if (committed.examSessionId !== sessionId || !Array.isArray(committed.roomAssignments)) {
    throw new Error("Committed room assignment snapshot is invalid.");
  }

  return (committed.roomAssignments as unknown[]).map((assignment) => {
    if (!assignment || typeof assignment !== "object" || Array.isArray(assignment)) {
      throw new Error("Committed room assignment snapshot is invalid.");
    }

    const item = assignment as Record<string, unknown>;
    if (typeof item.roomId !== "string" || !Array.isArray(item.invigilatorIds)) {
      throw new Error("Committed room assignment snapshot is invalid.");
    }

    return {
      roomId: assertUuid(item.roomId, "Committed room ID"),
      invigilatorIds: item.invigilatorIds.map((userId) =>
        assertUuid(String(userId), "Committed invigilator ID")
      )
    };
  });
}

export async function importExamSession(payload: SessionImportPayload) {
  if (!isSupabaseConfigured()) {
    const store = await readStore();
    const sessionId = nextId();
    const normalized = normalizeImportPayload(
      sessionId,
      payload,
      (roomCode) => `${sessionId}:${roomCode}`,
      nextId
    );

    store.examSessions.push({
      id: sessionId,
      name: payload.name,
      examDate: payload.examDate,
      startTime: payload.startTime,
      published: false,
      status: "draft",
      createdAt: nowIso()
    });
    store.rooms.push(...normalized.rooms);
    store.studentAllocations.push(...normalized.allocations);
    await writeStore(store);
    return {
      sessionId,
      stats: {
        rooms: normalized.rooms.length,
        students: normalized.allocations.length,
        checksum: createHash("sha256")
          .update(JSON.stringify({ rooms: normalized.rooms, allocations: normalized.allocations }))
          .digest("hex")
      }
    };
  }

  const sessionId = nextId();
  const roomIdByCode = new Map<string, string>();
  const normalized = normalizeImportPayload(
    sessionId,
    payload,
    (roomCode) => {
      const existingId = roomIdByCode.get(roomCode);
      if (existingId) {
        return existingId;
      }

      const roomId = nextId();
      roomIdByCode.set(roomCode, roomId);
      return roomId;
    },
    nextId
  );
  const supabase = getSupabaseAdmin();
  const rooms = normalized.rooms.map((room) => ({
    id: room.id,
    code: room.code,
    display_name: room.displayName,
    capacity: room.capacity ?? null
  }));
  const allocations = normalized.allocations.map((allocation) => ({
    id: allocation.id,
    student_id: allocation.studentId,
    student_name: allocation.studentName,
    room_id: allocation.roomId,
    zone: allocation.zone,
    course_code: allocation.courseCode ?? null,
    program: allocation.program ?? null
  }));
  const checksum = createHash("sha256")
    .update(JSON.stringify({ rooms, allocations }))
    .digest("hex");
  const response = await supabase.rpc("import_exam_session_atomic", {
    p_session_id: sessionId,
    p_name: payload.name,
    p_exam_date: payload.examDate,
    p_start_time: payload.startTime,
    p_rooms: rooms,
    p_allocations: allocations,
    p_import_checksum: checksum
  });

  if (response.error) {
    throw new Error(response.error.message);
  }
  if (!response.data || typeof response.data !== "object" || Array.isArray(response.data)) {
    throw new Error("Atomic exam import returned an invalid response.");
  }

  const committed = response.data as Record<string, unknown>;
  if (
    committed.sessionId !== sessionId ||
    committed.checksum !== checksum ||
    committed.rooms !== rooms.length ||
    committed.students !== allocations.length
  ) {
    throw new Error("Committed exam import summary does not match the normalized spreadsheet data.");
  }

  return {
    sessionId,
    stats: {
      rooms: committed.rooms as number,
      students: committed.students as number,
      checksum
    }
  };
}

export async function publishExamSession(sessionId: string, actorUserId: string) {
  if (!isSupabaseConfigured()) {
    const store = await readStore();
    const session = store.examSessions.find((item) => item.id === sessionId);
    if (!session) {
      throw new Error("Session not found.");
    }
    if ((session.status || (session.published ? "active" : "draft")) !== "draft") {
      throw new Error("Only draft exams can be published.");
    }

    const sessionRooms = store.rooms.filter((room) => room.examSessionId === sessionId);
    const assignedRoomIds = new Set(store.users.flatMap((user) => user.assignedRoomIds));
    const unassignedRooms = sessionRooms.filter((room) => !assignedRoomIds.has(room.id));

    if (!sessionRooms.length) {
      throw new Error("This exam has no rooms to publish.");
    }

    const unallocatedRooms = sessionRooms.filter(
      (room) =>
        !store.studentAllocations.some(
          (allocation) =>
            allocation.examSessionId === sessionId && allocation.roomId === room.id
        )
    );
    if (unallocatedRooms.length) {
      throw new Error(
        `Allocate students before publishing. Room(s) without students: ${unallocatedRooms
          .map((room) => room.code)
          .join(", ")}.`
      );
    }

    if (unassignedRooms.length) {
      throw new Error(
        `Assign invigilators before publishing. Unassigned room(s): ${unassignedRooms
          .map((room) => room.code)
          .join(", ")}.`
      );
    }

    session.published = true;
    session.status = "active";

    await writeStore(store);
    return;
  }

  const sessionUuid = assertUuid(sessionId, "Exam session ID");
  const response = await getSupabaseAdmin().rpc("transition_exam_session", {
    p_actor_user_id: assertUuid(actorUserId, "Administrator ID"),
    p_exam_session_id: sessionUuid,
    p_target_status: "active"
  });
  if (response.error) {
    throw new Error(response.error.message);
  }
}

export async function closeExamSession(sessionId: string, actorUserId: string) {
  if (!isSupabaseConfigured()) {
    const store = await readStore();
    const session = store.examSessions.find((item) => item.id === sessionId);
    if (!session) {
      throw new Error("Session not found.");
    }
    if ((session.status || (session.published ? "active" : "draft")) !== "active") {
      throw new Error("Only active exams can be closed.");
    }

    session.published = false;
    session.status = "closed";
    await writeStore(store);
    return;
  }

  const response = await getSupabaseAdmin().rpc("transition_exam_session", {
    p_actor_user_id: assertUuid(actorUserId, "Administrator ID"),
    p_exam_session_id: assertUuid(sessionId, "Exam session ID"),
    p_target_status: "closed"
  });
  if (response.error) {
    throw new Error(response.error.message);
  }
}

export async function deleteExamSession(
  sessionId: string,
  confirmationName: string,
  actorUserId: string
) {
  if (!isSupabaseConfigured()) {
    const store = await readStore();
    const session = store.examSessions.find((item) => item.id === sessionId);
    if (!session) {
      throw new Error("Session not found.");
    }
    if (confirmationName !== session.name) {
      throw new Error("Exam name confirmation does not match.");
    }
    if ((session.status || (session.published ? "active" : "draft")) !== "draft") {
      throw new Error(
        "Only draft exams can be permanently deleted. Close active exams and retain closed exams for audit history."
      );
    }
    if (
      store.attendanceEvents.some((event) => event.examSessionId === sessionId) ||
      store.incidents.some((incident) => incident.examSessionId === sessionId)
    ) {
      throw new Error("Exams with attendance or incident history cannot be deleted.");
    }

    const roomIds = new Set(
      store.rooms
        .filter((room) => room.examSessionId === sessionId)
        .map((room) => room.id)
    );

    store.examSessions = store.examSessions.filter((item) => item.id !== sessionId);
    store.rooms = store.rooms.filter((room) => room.examSessionId !== sessionId);
    store.studentAllocations = store.studentAllocations.filter(
      (allocation) => allocation.examSessionId !== sessionId
    );
    store.attendanceEvents = store.attendanceEvents.filter(
      (event) => event.examSessionId !== sessionId
    );
    store.incidents = store.incidents.filter(
      (incident) => incident.examSessionId !== sessionId
    );
    store.users = store.users.map((user) => ({
      ...user,
      assignedRoomIds: user.assignedRoomIds.filter((roomId) => !roomIds.has(roomId))
    }));

    await writeStore(store);
    return;
  }

  const response = await getSupabaseAdmin().rpc("delete_draft_exam_session", {
    p_actor_user_id: assertUuid(actorUserId, "Administrator ID"),
    p_confirmation_name: confirmationName,
    p_exam_session_id: assertUuid(sessionId, "Exam session ID")
  });
  if (response.error) {
    throw new Error(response.error.message);
  }
}

function mapSupabaseRoom(row: Record<string, unknown>): Room {
  return {
    id: String(row.id),
    examSessionId: String(row.exam_session_id),
    code: String(row.code),
    displayName: String(row.display_name),
    capacity: row.capacity === null || row.capacity === undefined ? undefined : Number(row.capacity)
  };
}

function mapSupabaseAllocation(row: Record<string, unknown>): StudentAllocation {
  return {
    id: String(row.id),
    examSessionId: String(row.exam_session_id),
    studentId: String(row.student_id),
    studentName: String(row.student_name),
    roomId: String(row.room_id),
    zone: String(row.zone),
    courseCode: row.course_code === null || row.course_code === undefined ? undefined : String(row.course_code),
    program: row.program === null || row.program === undefined ? undefined : String(row.program)
  };
}

function mapSupabaseSession(row: Record<string, unknown>): ExamSession {
  return {
    id: String(row.id),
    name: String(row.name),
    examDate: String(row.exam_date),
    startTime: String(row.start_time),
    published: Boolean(row.published),
    status:
      row.status === "draft" || row.status === "active" || row.status === "closed"
        ? row.status
        : undefined,
    createdAt: String(row.created_at)
  };
}

function mapSupabaseAttendance(row: Record<string, unknown>): AttendanceEvent {
  return {
    id: String(row.id),
    examSessionId: String(row.exam_session_id),
    studentId: String(row.student_id),
    markedByUserId: String(row.marked_by_user_id),
    markedInRoomId: String(row.marked_in_room_id),
    expectedRoomId: String(row.expected_room_id),
    source: row.source as AttendanceEvent["source"],
    overrideType: row.override_type as AttendanceEvent["overrideType"],
    roomMismatch: Boolean(row.room_mismatch),
    comment: row.comment === null || row.comment === undefined ? undefined : String(row.comment),
    deviceId: String(row.device_id),
    createdAt: String(row.created_at)
  };
}

function mapSupabaseIncident(row: Record<string, unknown>): Incident {
  const details =
    row.details && typeof row.details === "object"
      ? (row.details as Incident["details"])
      : {};

  return {
    id: String(row.id),
    examSessionId: String(row.exam_session_id),
    studentId: row.student_id === null || row.student_id === undefined ? undefined : String(row.student_id),
    roomId: row.room_id === null || row.room_id === undefined ? undefined : String(row.room_id),
    expectedRoomId:
      row.expected_room_id === null || row.expected_room_id === undefined
        ? undefined
        : String(row.expected_room_id),
    userId: row.user_id === null || row.user_id === undefined ? undefined : String(row.user_id),
    incidentType: row.incident_type as Incident["incidentType"],
    details,
    createdAt: String(row.created_at)
  };
}

export async function lookupStudentFast(request: LookupRequest): Promise<LookupResult> {
  if (!isSupabaseConfigured()) {
    return lookupStudent(await readStore(), request);
  }

  const supabase = getSupabaseAdmin();
  const attendanceResponse = await supabase
    .from("attendance_events")
    .select("id, exam_session_id, student_id, marked_by_user_id, marked_in_room_id, expected_room_id, source, override_type, room_mismatch, comment, device_id, created_at")
    .eq("exam_session_id", request.examSessionId)
    .eq("student_id", request.studentId)
    .maybeSingle();

  if (attendanceResponse.error) {
    throw new Error(attendanceResponse.error.message);
  }

  if (attendanceResponse.data) {
    return {
      status: "already_marked",
      examSessionId: request.examSessionId,
      studentId: request.studentId,
      message: "Attendance already marked.",
      attendance: mapSupabaseAttendance(attendanceResponse.data)
    };
  }

  const allocationResponse = await supabase
    .from("student_allocations")
    .select("id, exam_session_id, student_id, student_name, room_id, zone, course_code, program")
    .eq("exam_session_id", request.examSessionId)
    .eq("student_id", request.studentId)
    .maybeSingle();

  if (allocationResponse.error) {
    throw new Error(allocationResponse.error.message);
  }

  if (!allocationResponse.data) {
    return {
      status: "student_not_found",
      examSessionId: request.examSessionId,
      studentId: request.studentId,
      message: "Student was not found in this exam session."
    };
  }

  const allocation = mapSupabaseAllocation(allocationResponse.data);
  if (allocation.roomId !== request.roomId) {
    const expectedRoomResponse = await supabase
      .from("rooms")
      .select("id, exam_session_id, code, display_name, capacity")
      .eq("id", allocation.roomId)
      .maybeSingle();

    if (expectedRoomResponse.error) {
      throw new Error(expectedRoomResponse.error.message);
    }

    if (!expectedRoomResponse.data) {
      throw new Error(`Expected room ${allocation.roomId} not found.`);
    }

    return {
      status: "wrong_room",
      examSessionId: request.examSessionId,
      studentId: request.studentId,
      message: "Student belongs to a different room.",
      allocation,
      expectedRoom: mapSupabaseRoom(expectedRoomResponse.data)
    };
  }

  return {
    status: "ready_to_mark",
    examSessionId: request.examSessionId,
    studentId: request.studentId,
    message: "Student is in the correct room.",
    allocation
  };
}

export async function getRoomLiveStateFast(roomId: string) {
  if (!isSupabaseConfigured()) {
    const { getRoomLiveState } = await import("./selectors");
    return getRoomLiveState(await readStore(), roomId);
  }

  const supabase = getSupabaseAdmin();
  const roomResponse = await supabase
    .from("rooms")
    .select("id, exam_session_id, code, display_name, capacity")
    .eq("id", roomId)
    .maybeSingle();

  if (roomResponse.error) {
    throw new Error(roomResponse.error.message);
  }

  if (!roomResponse.data) {
    throw new Error("Room not found.");
  }

  const room = mapSupabaseRoom(roomResponse.data);
  const [
    allocatedResponse,
    attendanceResponse,
    mismatchResponse,
    redirectedResponse,
    recentAttendanceResponse,
    recentIncidentsResponse
  ] = await Promise.all([
    supabase
      .from("student_allocations")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId),
    supabase
      .from("attendance_events")
      .select("id", { count: "exact", head: true })
      .eq("marked_in_room_id", roomId),
    supabase
      .from("attendance_events")
      .select("id", { count: "exact", head: true })
      .eq("marked_in_room_id", roomId)
      .eq("room_mismatch", true),
    supabase
      .from("incidents")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .eq("incident_type", "wrong_room_redirected"),
    supabase
      .from("attendance_events")
      .select("student_id, created_at, room_mismatch, comment")
      .eq("marked_in_room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("incidents")
      .select("incident_type, student_id, created_at, details")
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .limit(10)
  ]);

  for (const response of [
    allocatedResponse,
    attendanceResponse,
    mismatchResponse,
    redirectedResponse,
    recentAttendanceResponse,
    recentIncidentsResponse
  ]) {
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  return {
    room,
    summary: {
      roomId: room.id,
      roomCode: room.code,
      roomName: room.displayName,
      allocatedCount: allocatedResponse.count || 0,
      presentCount: attendanceResponse.count || 0,
      mismatchPresentCount: mismatchResponse.count || 0,
      redirectedCount: redirectedResponse.count || 0
    },
    recentAttendance: (recentAttendanceResponse.data || []).map((item) => ({
      studentId: String(item.student_id),
      createdAt: String(item.created_at),
      roomMismatch: Boolean(item.room_mismatch),
      comment: item.comment === null || item.comment === undefined ? undefined : String(item.comment)
    })),
    recentIncidents: (recentIncidentsResponse.data || []).map((item) => {
      const details =
        item.details && typeof item.details === "object"
          ? (item.details as Record<string, string | number | boolean | null | undefined>)
          : {};

      return {
        incidentType: String(item.incident_type),
        studentId: item.student_id === null || item.student_id === undefined ? undefined : String(item.student_id),
        createdAt: String(item.created_at),
        comment: typeof details.comment === "string" ? details.comment : undefined
      };
    })
  };
}

export async function listMobileRoomsForUserFast(user: User) {
  if (!isSupabaseConfigured()) {
    const { listPublishedRoomsForUser } = await import("./selectors");
    const store = await readStore();
    return listPublishedRoomsForUser(store, user.id).map((room) => ({
      ...room,
      session: store.examSessions.find((item) => item.id === room.examSessionId)
    }));
  }

  const supabase = getSupabaseAdmin();

  if (user.role === "admin") {
    const roomsResponse = await supabase
      .from("rooms")
      .select("id, exam_session_id, code, display_name, capacity, exam_sessions!inner(id, name, exam_date, start_time, status, published)")
      .eq("exam_sessions.status", "active")
      .order("code", { ascending: true });

    if (roomsResponse.error) {
      throw new Error(roomsResponse.error.message);
    }

    return (roomsResponse.data || []).map((row) => {
      const session = Array.isArray(row.exam_sessions)
        ? row.exam_sessions[0]
        : row.exam_sessions;

      return {
        id: String(row.id),
        examSessionId: String(row.exam_session_id),
        code: String(row.code),
        displayName: String(row.display_name),
        capacity: row.capacity === null || row.capacity === undefined ? undefined : Number(row.capacity),
        session: session
          ? {
              id: String(session.id),
              name: String(session.name),
              examDate: String(session.exam_date),
              startTime: String(session.start_time)
            }
          : undefined
      };
    });
  }

  const assignmentsResponse = await supabase
    .from("room_assignments")
    .select("rooms!inner(id, exam_session_id, code, display_name, capacity, exam_sessions!inner(id, name, exam_date, start_time, status, published))")
    .eq("user_id", user.id)
    .eq("rooms.exam_sessions.status", "active");

  if (assignmentsResponse.error) {
    throw new Error(assignmentsResponse.error.message);
  }

  return (assignmentsResponse.data || []).map((row) => {
    const room = Array.isArray(row.rooms) ? row.rooms[0] : row.rooms;
    const session = room
      ? Array.isArray(room.exam_sessions)
        ? room.exam_sessions[0]
        : room.exam_sessions
      : null;

    return {
      id: String(room.id),
      examSessionId: String(room.exam_session_id),
      code: String(room.code),
      displayName: String(room.display_name),
      capacity: room.capacity === null || room.capacity === undefined ? undefined : Number(room.capacity),
      session: session
        ? {
            id: String(session.id),
            name: String(session.name),
            examDate: String(session.exam_date),
            startTime: String(session.start_time)
          }
        : undefined
    };
  });
}

export async function readExamSessionStoreFast(examSessionId: string): Promise<DataStore> {
  if (!isSupabaseConfigured()) {
    return readStore();
  }

  const supabase = getSupabaseAdmin();
  const [
    sessionResponse,
    roomsResponse,
    allocationsResponse,
    attendanceResponse,
    incidentsResponse,
    usersResponse
  ] = await Promise.all([
    supabase
      .from("exam_sessions")
      .select("id, name, exam_date, start_time, published, status, created_at")
      .eq("id", examSessionId)
      .maybeSingle(),
    supabase
      .from("rooms")
      .select("id, exam_session_id, code, display_name, capacity")
      .eq("exam_session_id", examSessionId),
    supabase
      .from("student_allocations")
      .select("id, exam_session_id, student_id, student_name, room_id, zone, course_code, program")
      .eq("exam_session_id", examSessionId),
    supabase
      .from("attendance_events")
      .select("id, exam_session_id, student_id, marked_by_user_id, marked_in_room_id, expected_room_id, source, override_type, room_mismatch, comment, device_id, created_at")
      .eq("exam_session_id", examSessionId),
    supabase
      .from("incidents")
      .select("id, exam_session_id, student_id, room_id, expected_room_id, user_id, incident_type, details, created_at")
      .eq("exam_session_id", examSessionId),
    supabase.from("users").select("id, email, full_name, role")
  ]);

  for (const response of [
    sessionResponse,
    roomsResponse,
    allocationsResponse,
    attendanceResponse,
    incidentsResponse,
    usersResponse
  ]) {
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  const users = (usersResponse.data || []).map((user) =>
    userWithAssignments({
      id: String(user.id),
      email: String(user.email),
      full_name: String(user.full_name),
      role: user.role as User["role"]
    })
  );

  if (!sessionResponse.data) {
    return {
      users,
      examSessions: [],
      rooms: [],
      studentAllocations: [],
      attendanceEvents: [],
      incidents: []
    };
  }

  return {
    users,
    examSessions: [mapSupabaseSession(sessionResponse.data)],
    rooms: (roomsResponse.data || []).map(mapSupabaseRoom),
    studentAllocations: (allocationsResponse.data || []).map(mapSupabaseAllocation),
    attendanceEvents: (attendanceResponse.data || []).map(mapSupabaseAttendance),
    incidents: (incidentsResponse.data || []).map(mapSupabaseIncident)
  };
}

export async function readExamSetupStoreFast(examSessionId?: string): Promise<DataStore> {
  if (!isSupabaseConfigured()) {
    const store = await readStore();
    const roomIds = new Set(
      examSessionId
        ? store.rooms
            .filter((room) => room.examSessionId === examSessionId)
            .map((room) => room.id)
        : []
    );
    return {
      users: store.users
        .filter((user) => user.role === "invigilator")
        .map((user) => ({
          ...user,
          assignedRoomIds: user.assignedRoomIds.filter((roomId) => roomIds.has(roomId))
        })),
      examSessions: examSessionId
        ? store.examSessions.filter((session) => session.id === examSessionId)
        : [],
      rooms: examSessionId
        ? store.rooms.filter((room) => room.examSessionId === examSessionId)
        : [],
      studentAllocations: [],
      attendanceEvents: [],
      incidents: []
    };
  }

  const supabase = getSupabaseAdmin();
  const usersPromise = supabase
    .from("users")
    .select("id, email, full_name, role")
    .eq("role", "invigilator");
  const sessionPromise = examSessionId
    ? supabase
        .from("exam_sessions")
        .select("id, name, exam_date, start_time, published, status, created_at")
        .eq("id", examSessionId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });
  const roomsPromise = examSessionId
    ? supabase
        .from("rooms")
        .select("id, exam_session_id, code, display_name, capacity")
        .eq("exam_session_id", examSessionId)
    : Promise.resolve({ data: [], error: null });
  const [usersResponse, sessionResponse, roomsResponse] = await Promise.all([
    usersPromise,
    sessionPromise,
    roomsPromise
  ]);

  for (const response of [usersResponse, sessionResponse, roomsResponse]) {
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  const roomIds = (roomsResponse.data || []).map((room) => String(room.id));
  const assignmentsResponse = roomIds.length
    ? await supabase
        .from("room_assignments")
        .select("room_id, user_id")
        .in("room_id", roomIds)
    : { data: [], error: null };
  if (assignmentsResponse.error) {
    throw new Error(assignmentsResponse.error.message);
  }

  const assignedRoomsByUser = new Map<string, string[]>();
  for (const assignment of assignmentsResponse.data || []) {
    const userId = String(assignment.user_id);
    const assignedRoomIds = assignedRoomsByUser.get(userId) || [];
    assignedRoomIds.push(String(assignment.room_id));
    assignedRoomsByUser.set(userId, assignedRoomIds);
  }

  return {
    users: (usersResponse.data || []).map((user) =>
      userWithAssignments(
        {
          id: String(user.id),
          email: String(user.email),
          full_name: String(user.full_name),
          role: user.role as User["role"]
        },
        assignedRoomsByUser.get(String(user.id)) || []
      )
    ),
    examSessions: sessionResponse.data ? [mapSupabaseSession(sessionResponse.data)] : [],
    rooms: (roomsResponse.data || []).map(mapSupabaseRoom),
    studentAllocations: [],
    attendanceEvents: [],
    incidents: []
  };
}

export async function readAdminAuditStoreFast(
  examSessionFilter: string,
  options: {
    includeAttendance?: boolean;
    includeIncidents?: boolean;
    attendanceMismatchOnly?: boolean;
  } = {}
): Promise<DataStore> {
  if (!isSupabaseConfigured()) {
    return readStore();
  }

  const supabase = getSupabaseAdmin();
  const [sessionsResponse, usersResponse] = await Promise.all([
    supabase
      .from("exam_sessions")
      .select("id, name, exam_date, start_time, published, status, created_at"),
    supabase.from("users").select("id, email, full_name, role")
  ]);

  if (sessionsResponse.error) {
    throw new Error(sessionsResponse.error.message);
  }

  if (usersResponse.error) {
    throw new Error(usersResponse.error.message);
  }

  const examSessions = (sessionsResponse.data || []).map(mapSupabaseSession);
  const users = (usersResponse.data || []).map((user) =>
    userWithAssignments({
      id: String(user.id),
      email: String(user.email),
      full_name: String(user.full_name),
      role: user.role as User["role"]
    })
  );
  const selectedSessionIds =
    examSessionFilter === "all"
      ? examSessions.map((session) => session.id)
      : examSessionFilter === "active"
        ? examSessions
            .filter((session) => (session.status || (session.published ? "active" : "draft")) === "active")
            .map((session) => session.id)
        : [examSessionFilter];

  if (!selectedSessionIds.length) {
    return {
      users,
      examSessions,
      rooms: [],
      studentAllocations: [],
      attendanceEvents: [],
      incidents: []
    };
  }

  const roomsQuery = supabase
    .from("rooms")
    .select("id, exam_session_id, code, display_name, capacity")
    .in("exam_session_id", selectedSessionIds);
  const allocationsQuery = supabase
    .from("student_allocations")
    .select("id, exam_session_id, student_id, student_name, room_id, zone, course_code, program")
    .in("exam_session_id", selectedSessionIds);
  let attendanceQuery = supabase
    .from("attendance_events")
    .select("id, exam_session_id, student_id, marked_by_user_id, marked_in_room_id, expected_room_id, source, override_type, room_mismatch, comment, device_id, created_at")
    .in("exam_session_id", selectedSessionIds);

  if (options.attendanceMismatchOnly) {
    attendanceQuery = attendanceQuery.eq("room_mismatch", true);
  }

  const incidentsQuery = supabase
    .from("incidents")
    .select("id, exam_session_id, student_id, room_id, expected_room_id, user_id, incident_type, details, created_at")
    .in("exam_session_id", selectedSessionIds);

  const [roomsResponse, allocationsResponse, attendanceResponse, incidentsResponse] =
    await Promise.all([
      roomsQuery,
      allocationsQuery,
      options.includeAttendance
        ? attendanceQuery
        : Promise.resolve({ data: [], error: null }),
      options.includeIncidents
        ? incidentsQuery
        : Promise.resolve({ data: [], error: null })
    ]);

  for (const response of [
    roomsResponse,
    allocationsResponse,
    attendanceResponse,
    incidentsResponse
  ]) {
    if (response.error) {
      throw new Error(response.error.message);
    }
  }

  return {
    users,
    examSessions,
    rooms: (roomsResponse.data || []).map(mapSupabaseRoom),
    studentAllocations: (allocationsResponse.data || []).map(mapSupabaseAllocation),
    attendanceEvents: (attendanceResponse.data || []).map(mapSupabaseAttendance),
    incidents: (incidentsResponse.data || []).map(mapSupabaseIncident)
  };
}

async function applySupabaseAttendanceMark(request: MarkAttendanceRequest) {
  const supabase = getSupabaseAdmin();
  const response = await supabase.rpc("mark_attendance_atomic", {
    p_request_id: request.requestId || nextId(),
    p_exam_session_id: request.examSessionId,
    p_room_id: request.roomId,
    p_student_id: request.studentId,
    p_user_id: request.userId,
    p_source: request.source,
    p_device_id: request.deviceId,
    p_action: request.action,
    p_override_wrong_room: request.overrideWrongRoom ?? false,
    p_comment: request.comment?.trim() || null
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  if (
    !response.data ||
    typeof response.data !== "object" ||
    Array.isArray(response.data) ||
    !("result" in response.data)
  ) {
    throw new Error("Atomic attendance operation returned an invalid response.");
  }

  return response.data;
}

export async function applyAttendanceMark(
  request: MarkAttendanceRequest,
  existingStore?: DataStore
) {
  if (isSupabaseConfigured()) {
    return applySupabaseAttendanceMark(request);
  }

  const store = existingStore || (await readStore());
  const response = markAttendance(store, request, {
    now: nowIso,
    nextId
  });

  await writeStore(store);
  return response;
}
