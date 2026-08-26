import "server-only";

import { redirect } from "next/navigation";
import type { DataStore, User, UserRole } from "@algo-attendance/shared";
import { listPublishedRoomsForUser } from "./selectors";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { getSupabaseServerClient } from "./supabase-server";
import { nextId, readStore, writeStore } from "./store";

function isRoleAllowed(userRole: UserRole, allowedRoles?: UserRole[]) {
  if (!allowedRoles?.length) {
    return true;
  }

  return allowedRoles.includes(userRole);
}

async function loadSupabaseUserById(userId: string): Promise<User | null> {
  const supabase = getSupabaseAdmin();
  const userResponse = await supabase
    .from("users")
    .select("id, email, full_name, role")
    .eq("id", userId)
    .maybeSingle();

  if (userResponse.error) {
    throw new Error(userResponse.error.message);
  }

  if (!userResponse.data) {
    return null;
  }

  const assignmentsResponse = await supabase
    .from("room_assignments")
    .select("room_id")
    .eq("user_id", userId);

  if (assignmentsResponse.error) {
    throw new Error(assignmentsResponse.error.message);
  }

  return {
    id: userResponse.data.id,
    email: userResponse.data.email,
    fullName: userResponse.data.full_name,
    role: userResponse.data.role,
    assignedRoomIds: (assignmentsResponse.data || []).map((assignment) => assignment.room_id)
  };
}

async function loadFallbackUserByEmail(email: string, fullName?: string): Promise<User> {
  const normalizedEmail = email.trim().toLowerCase();
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

export async function upsertFallbackUser(email: string, fullName?: string) {
  return loadFallbackUserByEmail(email, fullName);
}

export async function getUserById(userId: string): Promise<User | null> {
  if (!isSupabaseConfigured()) {
    const store = await readStore();
    return store.users.find((candidate) => candidate.id === userId) || null;
  }

  return loadSupabaseUserById(userId);
}

export async function getOptionalSessionUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return getUserById(user.id);
}

export async function requireAdminPageUser() {
  const user = await getOptionalSessionUser();
  if (!user) {
    redirect("/login");
  }

  if (user.role !== "admin") {
    redirect("/login?error=unauthorized");
  }

  return user;
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return authorization.slice("bearer ".length).trim() || null;
}

async function resolveSupabaseRequestUser(request: Request): Promise<User | null> {
  const bearerToken = readBearerToken(request);
  if (bearerToken) {
    const {
      data: { user },
      error
    } = await getSupabaseAdmin().auth.getUser(bearerToken);

    if (error || !user) {
      return null;
    }

    return getUserById(user.id);
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return getUserById(user.id);
}

export async function requireApiUser(
  request: Request,
  options?: {
    allowedRoles?: UserRole[];
    roomId?: string;
    examSessionId?: string;
  }
) {
  const { user } = await requireApiUserWithStore(request, options);
  return user;
}

export async function requireApiUserForRoom(
  request: Request,
  options: {
    allowedRoles?: UserRole[];
    roomId: string;
    examSessionId: string;
  }
) {
  if (!isSupabaseConfigured()) {
    const { user, store } = await requireApiUserWithStore(request, options);
    return { user, store };
  }

  const user = await resolveSupabaseRequestUser(request);
  if (!user) {
    throw new Error("Not authenticated.");
  }

  if (!isRoleAllowed(user.role, options.allowedRoles)) {
    throw new Error("You do not have permission to access this resource.");
  }

  const supabase = getSupabaseAdmin();
  const roomResponse = await supabase
    .from("rooms")
    .select("id, exam_session_id")
    .eq("id", options.roomId)
    .maybeSingle();

  if (roomResponse.error) {
    throw new Error(roomResponse.error.message);
  }

  if (!roomResponse.data) {
    throw new Error("Room not found.");
  }

  if (roomResponse.data.exam_session_id !== options.examSessionId) {
    throw new Error("Room does not belong to this exam session.");
  }

  if (user.role === "admin") {
    return { user };
  }

  const [sessionResponse, assignmentResponse] = await Promise.all([
    supabase
      .from("exam_sessions")
      .select("id, published, status")
      .eq("id", options.examSessionId)
      .maybeSingle(),
    supabase
      .from("room_assignments")
      .select("room_id")
      .eq("room_id", options.roomId)
      .eq("user_id", user.id)
      .maybeSingle()
  ]);

  if (sessionResponse.error) {
    throw new Error(sessionResponse.error.message);
  }

  if (assignmentResponse.error) {
    throw new Error(assignmentResponse.error.message);
  }

  const session = sessionResponse.data;
  const sessionIsActive = session?.status === "active" || session?.published === true;
  if (!session || !sessionIsActive || !assignmentResponse.data) {
    throw new Error("You do not have access to this room.");
  }

  return { user };
}

export async function requireApiUserWithStore(
  request: Request,
  options?: {
    allowedRoles?: UserRole[];
    roomId?: string;
    examSessionId?: string;
  }
): Promise<{ user: User; store?: DataStore }> {
  let user: User | null;

  if (!isSupabaseConfigured()) {
    const { searchParams } = new URL(request.url);
    const fallbackUserId = searchParams.get("userId");
    if (!fallbackUserId) {
      throw new Error("Not authenticated.");
    }

    user = await getUserById(fallbackUserId);
  } else {
    user = await resolveSupabaseRequestUser(request);
  }

  if (!user) {
    throw new Error("Not authenticated.");
  }

  if (!isRoleAllowed(user.role, options?.allowedRoles)) {
    throw new Error("You do not have permission to access this resource.");
  }

  let store: DataStore | undefined;

  if (options?.roomId) {
    store = await readStore();
    const requestedRoom = store.rooms.find((room) => room.id === options.roomId);
    if (!requestedRoom) {
      throw new Error("Room not found.");
    }

    if (options.examSessionId && requestedRoom.examSessionId !== options.examSessionId) {
      throw new Error("Room does not belong to this exam session.");
    }

    const accessibleRooms = listPublishedRoomsForUser(store, user.id);
    const canAccessRoom =
      user.role === "admin" ||
      accessibleRooms.some((room) => room.id === options.roomId);

    if (!canAccessRoom) {
      throw new Error("You do not have access to this room.");
    }
  }

  return { user, store };
}
