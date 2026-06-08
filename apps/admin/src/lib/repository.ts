import {
  markAttendance,
  normalizeImportPayload,
  type DataStore,
  type MarkAttendanceRequest,
  type SessionImportPayload,
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

    store.users.push({
      id: nextId(),
      email: normalizedEmail,
      fullName: input.fullName,
      role: "invigilator",
      assignedRoomIds: requestedAssignedRoomIds,
      accessCodeHash
    });

    await writeStore(store);
    return { accessCode };
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
      access_code_hash: accessCodeHash
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
        access_code_hash: accessCodeHash
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
        access_code_hash: accessCodeHash
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

  return { accessCode };
}

export async function resetInvigilatorAccessCode(userIdInput: string) {
  const accessCode = generateAccessCode();
  const accessCodeHash = hashAccessCode(accessCode);

  if (!isSupabaseConfigured()) {
    const store = await readStore();
    const user = store.users.find((candidate) => candidate.id === userIdInput);

    if (!user || user.role !== "invigilator") {
      throw new Error("Invigilator not found.");
    }

    user.accessCodeHash = accessCodeHash;
    await writeStore(store);
    return { accessCode };
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

  const authResponse = await supabase.auth.admin.updateUserById(userId, {
    password: accessCode
  });

  if (authResponse.error) {
    throw new Error(authResponse.error.message);
  }

  const updateResponse = await supabase
    .from("users")
    .update({ access_code_hash: accessCodeHash })
    .eq("id", userId);

  if (updateResponse.error) {
    throw new Error(updateResponse.error.message);
  }

  return { accessCode };
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
    return;
  }

  const sessionId = assertUuid(examSessionId, "Exam session ID");
  const supabase = getSupabaseAdmin();
  const sessionResponse = await supabase
    .from("exam_sessions")
    .select("id, published, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionResponse.error) {
    throw new Error(sessionResponse.error.message);
  }

  if (!sessionResponse.data) {
    throw new Error("Session not found.");
  }

  const sessionStatus =
    sessionResponse.data.status ?? (sessionResponse.data.published ? "active" : "draft");

  if (sessionStatus === "closed") {
    throw new Error("Closed exams are read-only. Room assignments cannot be changed.");
  }

  const roomsResponse = await supabase
    .from("rooms")
    .select("id")
    .eq("exam_session_id", sessionId);

  if (roomsResponse.error) {
    throw new Error(roomsResponse.error.message);
  }

  const sessionRoomIds = (roomsResponse.data || []).map((room) => room.id);
  const sessionRoomIdSet = new Set(sessionRoomIds);
  const submittedRoomIdSet = new Set(input.roomAssignments.map((assignment) => assignment.roomId));

  if (!sessionRoomIds.length) {
    throw new Error("No rooms found for this exam.");
  }

  if (submittedRoomIdSet.size !== sessionRoomIdSet.size) {
    throw new Error("Assignment payload must include every room in this exam.");
  }

  for (const roomId of submittedRoomIdSet) {
    if (!sessionRoomIdSet.has(roomId)) {
      throw new Error("Assignment payload includes a room outside this exam.");
    }
  }

  const submittedInvigilatorIds = Array.from(
    new Set(input.roomAssignments.flatMap((assignment) => assignment.invigilatorIds))
  );
  const invalidFormattedInvigilatorId = submittedInvigilatorIds.find(
    (userId) => !uuidPattern.test(userId)
  );

  if (invalidFormattedInvigilatorId) {
    throw new Error("Assignment payload includes an invalid invigilator ID.");
  }

  if (submittedInvigilatorIds.length) {
    const usersResponse = await supabase
      .from("users")
      .select("id")
      .eq("role", "invigilator")
      .in("id", submittedInvigilatorIds);

    if (usersResponse.error) {
      throw new Error(usersResponse.error.message);
    }

    const validInvigilatorIds = new Set((usersResponse.data || []).map((user) => user.id));
    const unknownInvigilatorId = submittedInvigilatorIds.find(
      (userId) => !validInvigilatorIds.has(userId)
    );

    if (unknownInvigilatorId) {
      throw new Error("Assignment payload includes an unknown invigilator.");
    }
  }

  if (input.expectedRoomAssignments) {
    const currentAssignmentsResponse = await supabase
      .from("room_assignments")
      .select("room_id, user_id")
      .in("room_id", sessionRoomIds);

    if (currentAssignmentsResponse.error) {
      throw new Error(currentAssignmentsResponse.error.message);
    }

    const currentInvigilatorsByRoomId = new Map<string, string[]>();
    for (const assignment of currentAssignmentsResponse.data || []) {
      const current = currentInvigilatorsByRoomId.get(assignment.room_id) || [];
      current.push(assignment.user_id);
      currentInvigilatorsByRoomId.set(assignment.room_id, current);
    }

    const currentRoomAssignments = sessionRoomIds.map((roomId) => ({
      roomId,
      invigilatorIds: currentInvigilatorsByRoomId.get(roomId) || []
    }));

    if (!sameAssignmentSnapshot(input.expectedRoomAssignments, currentRoomAssignments)) {
      throw new Error(
        "Room assignments changed since this page loaded. Refresh before saving."
      );
    }
  }

  const rows = input.roomAssignments.flatMap((assignment) => {
    return Array.from(new Set(assignment.invigilatorIds))
      .map((userId) => ({
        id: nextId(),
        room_id: assignment.roomId,
        user_id: userId
      }));
  });

  const deleteResponse = await supabase
    .from("room_assignments")
    .delete()
    .in("room_id", sessionRoomIds);

  if (deleteResponse.error) {
    throw new Error(deleteResponse.error.message);
  }

  if (!rows.length) {
    return;
  }

  const insertResponse = await supabase.from("room_assignments").insert(rows);

  if (insertResponse.error) {
    throw new Error(insertResponse.error.message);
  }
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
    return { sessionId };
  }

  const sessionId = nextId();
  const createdAt = nowIso();
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

  const sessionResponse = await supabase.from("exam_sessions").insert({
    id: sessionId,
    name: payload.name,
    exam_date: payload.examDate,
    start_time: payload.startTime,
    published: false,
    status: "draft",
    created_at: createdAt
  });

  if (sessionResponse.error) {
    throw new Error(sessionResponse.error.message);
  }

  const roomsResponse = await supabase.from("rooms").insert(
    normalized.rooms.map((room) => ({
      id: room.id,
      exam_session_id: room.examSessionId,
      code: room.code,
      display_name: room.displayName,
      capacity: room.capacity ?? null
    }))
  );

  if (roomsResponse.error) {
    throw new Error(roomsResponse.error.message);
  }

  const allocationsResponse = await supabase.from("student_allocations").insert(
    normalized.allocations.map((allocation) => ({
      id: allocation.id,
      exam_session_id: allocation.examSessionId,
      student_id: allocation.studentId,
      student_name: allocation.studentName,
      room_id: allocation.roomId,
      zone: allocation.zone,
      course_code: allocation.courseCode ?? null,
      program: allocation.program ?? null
    }))
  );

  if (allocationsResponse.error) {
    throw new Error(allocationsResponse.error.message);
  }

  return { sessionId };
}

export async function publishExamSession(sessionId: string) {
  if (!isSupabaseConfigured()) {
    const store = await readStore();
    const session = store.examSessions.find((item) => item.id === sessionId);
    if (!session) {
      throw new Error("Session not found.");
    }

    const sessionRooms = store.rooms.filter((room) => room.examSessionId === sessionId);
    const assignedRoomIds = new Set(store.users.flatMap((user) => user.assignedRoomIds));
    const unassignedRooms = sessionRooms.filter((room) => !assignedRoomIds.has(room.id));

    if (!sessionRooms.length) {
      throw new Error("This exam has no rooms to publish.");
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

  const supabase = getSupabaseAdmin();
  const sessionUuid = assertUuid(sessionId, "Exam session ID");
  const roomsResponse = await supabase
    .from("rooms")
    .select("id, code")
    .eq("exam_session_id", sessionUuid);

  if (roomsResponse.error) {
    throw new Error(roomsResponse.error.message);
  }

  const rooms = roomsResponse.data || [];

  if (!rooms.length) {
    throw new Error("This exam has no rooms to publish.");
  }

  const assignmentsResponse = await supabase
    .from("room_assignments")
    .select("room_id")
    .in(
      "room_id",
      rooms.map((room) => room.id)
    );

  if (assignmentsResponse.error) {
    throw new Error(assignmentsResponse.error.message);
  }

  const assignedRoomIds = new Set((assignmentsResponse.data || []).map((row) => row.room_id));
  const unassignedRooms = rooms.filter((room) => !assignedRoomIds.has(room.id));

  if (unassignedRooms.length) {
    throw new Error(
      `Assign invigilators before publishing. Unassigned room(s): ${unassignedRooms
        .map((room) => room.code)
        .join(", ")}.`
    );
  }

  const publishResponse = await supabase
    .from("exam_sessions")
    .update({ published: true, status: "active" })
    .eq("id", sessionUuid)
    .select("id")
    .maybeSingle();

  if (publishResponse.error) {
    throw new Error(publishResponse.error.message);
  }

  if (!publishResponse.data) {
    throw new Error("Session not found.");
  }
}

export async function closeExamSession(sessionId: string) {
  if (!isSupabaseConfigured()) {
    const store = await readStore();
    const session = store.examSessions.find((item) => item.id === sessionId);
    if (!session) {
      throw new Error("Session not found.");
    }

    session.published = false;
    session.status = "closed";
    await writeStore(store);
    return;
  }

  const supabase = getSupabaseAdmin();
  const closeResponse = await supabase
    .from("exam_sessions")
    .update({ published: false, status: "closed" })
    .eq("id", sessionId)
    .select("id")
    .maybeSingle();

  if (closeResponse.error) {
    throw new Error(closeResponse.error.message);
  }

  if (!closeResponse.data) {
    throw new Error("Session not found.");
  }
}

export async function deleteExamSession(sessionId: string) {
  if (!isSupabaseConfigured()) {
    const store = await readStore();
    const session = store.examSessions.find((item) => item.id === sessionId);
    if (!session) {
      throw new Error("Session not found.");
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

  const supabase = getSupabaseAdmin();
  const deleteResponse = await supabase
    .from("exam_sessions")
    .delete()
    .eq("id", sessionId)
    .select("id")
    .maybeSingle();

  if (deleteResponse.error) {
    throw new Error(deleteResponse.error.message);
  }

  if (!deleteResponse.data) {
    throw new Error("Session not found.");
  }
}

export async function applyAttendanceMark(
  request: MarkAttendanceRequest,
  existingStore?: DataStore
) {
  const store = existingStore || (await readStore());
  const response = markAttendance(store, request, {
    now: nowIso,
    nextId
  });

  if (!isSupabaseConfigured()) {
    await writeStore(store);
    return response;
  }

  const supabase = getSupabaseAdmin();

  if (response.event) {
    const attendanceInsert = await supabase.from("attendance_events").insert({
      id: response.event.id,
      exam_session_id: response.event.examSessionId,
      student_id: response.event.studentId,
      marked_by_user_id: response.event.markedByUserId,
      marked_in_room_id: response.event.markedInRoomId,
      expected_room_id: response.event.expectedRoomId,
      source: response.event.source,
      override_type: response.event.overrideType,
      room_mismatch: response.event.roomMismatch,
      comment: response.event.comment ?? null,
      device_id: response.event.deviceId,
      created_at: response.event.createdAt
    });

    if (attendanceInsert.error) {
      if (attendanceInsert.error.code === "23505") {
        throw new Error("Attendance already marked by another device.");
      }
      throw new Error(attendanceInsert.error.message);
    }
  }

  if (response.incident) {
    const incidentInsert = await supabase.from("incidents").insert({
      id: response.incident.id,
      exam_session_id: response.incident.examSessionId,
      student_id: response.incident.studentId ?? null,
      room_id: response.incident.roomId ?? null,
      expected_room_id: response.incident.expectedRoomId ?? null,
      user_id: response.incident.userId ?? null,
      incident_type: response.incident.incidentType,
      details: response.incident.details,
      created_at: response.incident.createdAt
    });

    if (incidentInsert.error) {
      throw new Error(incidentInsert.error.message);
    }
  }

  return response;
}
