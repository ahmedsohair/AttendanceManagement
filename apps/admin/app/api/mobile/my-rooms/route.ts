import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { listMobileRoomsForUserFast } from "@/lib/repository";
import { listPublishedRoomsForUser } from "@/lib/selectors";
import { readStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase";
import { logApiTiming } from "@/lib/timing";
import { getApiErrorCode, getApiErrorStatus } from "@/lib/api-errors";
import { handleApiError } from "@/lib/api-response";

export async function GET(request: Request) {
  const startedAt = performance.now();
  let status = 200;
  let code = "OK";

  try {
    const user = await requireApiUser(request, {
      allowedRoles: ["admin", "invigilator"]
    });
    if (isSupabaseConfigured()) {
      const rooms = await listMobileRoomsForUserFast(user);
      return NextResponse.json({ rooms });
    }

    const store = await readStore();
    const rooms = listPublishedRoomsForUser(store, user.id).map((room) => ({
      ...room,
      session: store.examSessions.find((item) => item.id === room.examSessionId)
    }));
    return NextResponse.json({ rooms });
  } catch (error) {
    status = getApiErrorStatus(error);
    code = getApiErrorCode(error);
    return handleApiError(request, error, "Mobile room-list request failed.");
  } finally {
    logApiTiming(request, startedAt, status, code);
  }
}
