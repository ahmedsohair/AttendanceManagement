import {
  markAttendance,
  normalizeImportPayload,
  type MarkAttendanceRequest,
  type SessionImportPayload,
  type User
} from "@algo-attendance/shared";
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
      .select("id, published, created_at, exam_date, start_time")
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
      const leftPublished = leftSession?.published ? 1 : 0;
      const rightPublished = rightSession?.published ? 1 : 0;

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
  password: string;
}) {
  const normalizedEmail = input.email.trim().toLowerCase();
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
      assignedRoomIds: requestedAssignedRoomIds
    });

    await writeStore(store);
    return;
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

  let authUser = await findAuthUserByEmail(supabase, normalizedEmail);

  if (!authUser) {
    const authResponse = await supabase.auth.admin.createUser({
      email: normalizedEmail,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName,
        role: "invigilator"
      }
    });

    if (authResponse.error || !authResponse.data.user) {
      throw new Error(authResponse.error?.message || "Unable to create auth account.");
    }

    authUser = authResponse.data.user;
  } else {
    const updateAuthResponse = await supabase.auth.admin.updateUserById(authUser.id, {
      email: normalizedEmail,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        full_name: input.fullName,
        role: "invigilator"
      }
    });

    if (updateAuthResponse.error || !updateAuthResponse.data.user) {
      throw new Error(
        updateAuthResponse.error?.message || "Unable to update auth account."
      );
    }

    authUser = updateAuthResponse.data.user;
  }

  const authUserId = assertUuid(authUser.id, "Auth user ID");

  if (!existingPublicUserId) {
    const insertUserResponse = await supabase.from("users").insert({
      id: authUserId,
      email: normalizedEmail,
      full_name: input.fullName,
      role: "invigilator"
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
        role: "invigilator"
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
        role: "invigilator"
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

    for (const candidate of store.examSessions) {
      candidate.published = candidate.id === sessionId;
    }

    await writeStore(store);
    return;
  }

  const supabase = getSupabaseAdmin();
  const clearResponse = await supabase
    .from("exam_sessions")
    .update({ published: false })
    .not("id", "is", null);

  if (clearResponse.error) {
    throw new Error(clearResponse.error.message);
  }

  const publishResponse = await supabase
    .from("exam_sessions")
    .update({ published: true })
    .eq("id", sessionId)
    .select("id")
    .maybeSingle();

  if (publishResponse.error) {
    throw new Error(publishResponse.error.message);
  }

  if (!publishResponse.data) {
    throw new Error("Session not found.");
  }
}

export async function applyAttendanceMark(request: MarkAttendanceRequest) {
  const store = await readStore();
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
