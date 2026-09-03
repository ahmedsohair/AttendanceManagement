import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { listMobileRoomsForUserFast } from "@/lib/repository";
import { listPublishedRoomsForUser } from "@/lib/selectors";
import { readStore } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase";
import { logServerTiming } from "@/lib/timing";
import { getApiErrorStatus } from "@/lib/api-errors";
import { handleApiError } from "@/lib/api-response";

export async function GET(request: Request) {
  const startedAt = performance.now();
  let status = 200;
  let roomCount: number | undefined;

  try {
    const user = await requireApiUser(request, {
      allowedRoles: ["admin", "invigilator"]
    });
    if (isSupabaseConfigured()) {
      const rooms = await listMobileRoomsForUserFast(user);
      roomCount = rooms.length;
      return NextResponse.json({ rooms });
    }

    const store = await readStore();
    const rooms = listPublishedRoomsForUser(store, user.id).map((room) => ({
      ...room,
      session: store.examSessions.find((item) => item.id === room.examSessionId)
    }));
    roomCount = rooms.length;
    return NextResponse.json({ rooms });
  } catch (error) {
    status = getApiErrorStatus(error);
    return handleApiError(request, error, "Mobile room-list request failed.");
  } finally {
    logServerTiming("api.mobile.my-rooms", startedAt, { status, roomCount });
  }
}
