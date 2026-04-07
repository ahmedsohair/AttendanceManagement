import Constants from "expo-constants";
import type {
  LookupResult,
  MarkAttendanceRequest,
  Room,
  User
} from "@algo-attendance/shared";
import {
  getAccessToken,
  hasActiveSession,
  isSupabaseAuthConfigured,
  requestPasswordReset as requestSupabasePasswordReset,
  signInInvigilator,
  signOutInvigilator
} from "../lib/supabase";

type ExpoExtra = {
  apiBaseUrl?: string;
};
const runtimeEnv =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ||
  {};
const defaultApiBase =
  (((Constants.expoConfig?.extra || {}) as ExpoExtra).apiBaseUrl ||
    runtimeEnv.EXPO_PUBLIC_API_BASE_URL ||
    runtimeEnv.NEXT_PUBLIC_API_BASE_URL ||
    "").replace(/\/$/, "") ||
  "http://localhost:3000";

function normalizeApiBase(url: string) {
  return url.trim().replace(/\/$/, "");
}

async function getApiBase() {
  return normalizeApiBase(defaultApiBase);
}

async function getAuthHeaders() {
  const headers: Record<string, string> = {};
  const accessToken = await getAccessToken();

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    throw new Error(payload.message || "Request failed.");
  }
  return payload;
}

export interface RoomWithSession extends Room {
  session: {
    id: string;
    name: string;
    examDate: string;
    startTime: string;
  };
}

export async function loadApiBaseUrl() {
  return normalizeApiBase(defaultApiBase);
}

export async function login(email: string, password: string) {
  const apiBase = await getApiBase();
  if (isSupabaseAuthConfigured()) {
    await signInInvigilator(email, password);
    const user = await loadCurrentUser();
    if (!user) {
      throw new Error("Signed in, but no staff profile was found for this account.");
    }
    return user;
  }

  const response = await fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  const payload = await readJson<{ user: User }>(response);
  return payload.user;
}

export async function requestPasswordReset(email: string) {
  if (!isSupabaseAuthConfigured()) {
    throw new Error("Password reset requires Supabase Auth to be enabled.");
  }

  const apiBase = await getApiBase();
  const redirectTo = `${apiBase}/auth/callback?next=/update-password`;
  await requestSupabasePasswordReset(email, redirectTo);
}

export async function loadCurrentUser() {
  const apiBase = await getApiBase();
  const response = await fetch(`${apiBase}/api/auth/me`, {
    headers: await getAuthHeaders()
  });
  const payload = await readJson<{ user: User }>(response);
  return payload.user;
}

export async function restoreCurrentUser() {
  if (!isSupabaseAuthConfigured()) {
    return null;
  }

  if (!(await hasActiveSession())) {
    return null;
  }

  try {
    return await loadCurrentUser();
  } catch {
    return null;
  }
}

export async function logout() {
  if (isSupabaseAuthConfigured()) {
    await signOutInvigilator();
  }
}

export async function fetchRooms() {
  const apiBase = await getApiBase();
  const response = await fetch(`${apiBase}/api/mobile/my-rooms`, {
    headers: await getAuthHeaders()
  });
  const payload = await readJson<{ rooms: RoomWithSession[] }>(response);
  return payload.rooms;
}

export async function lookupAttendance(input: {
  examSessionId: string;
  roomId: string;
  studentId: string;
}) {
  const apiBase = await getApiBase();
  const response = await fetch(`${apiBase}/api/attendance/lookup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getAuthHeaders())
    },
    body: JSON.stringify(input)
  });
  const payload = await readJson<{ result: LookupResult }>(response);
  return payload.result;
}

export async function markAttendance(input: MarkAttendanceRequest) {
  const apiBase = await getApiBase();
  const response = await fetch(`${apiBase}/api/attendance/mark`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getAuthHeaders())
    },
    body: JSON.stringify(input)
  });
  return readJson<{
    event?: { id: string; roomMismatch: boolean; createdAt: string };
    incident?: { id: string; incidentType: string; createdAt: string };
    result: LookupResult;
  }>(response);
}

export async function readRoomLive(roomId: string) {
  const apiBase = await getApiBase();
  const response = await fetch(`${apiBase}/api/rooms/${roomId}/live`, {
    headers: await getAuthHeaders()
  });
  return readJson<{
    summary?: {
      allocatedCount: number;
      presentCount: number;
      mismatchPresentCount: number;
      redirectedCount: number;
    };
    recentAttendance: Array<{
      studentId: string;
      createdAt: string;
      roomMismatch: boolean;
      comment?: string;
    }>;
    recentIncidents: Array<{
      incidentType: string;
      studentId?: string;
      createdAt: string;
      comment?: string;
    }>;
  }>(response);
}
