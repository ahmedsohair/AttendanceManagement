import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { listPublishedRoomsForUser } from "@/lib/selectors";
import { readStore } from "@/lib/store";
import { logServerTiming } from "@/lib/timing";

export async function GET(request: Request) {
  const startedAt = performance.now();
  let status = 200;
  let roomCount: number | undefined;

  try {
    const user = await requireApiUser(request, {
      allowedRoles: ["admin", "invigilator"]
    });
    const store = await readStore();
    const rooms = listPublishedRoomsForUser(store, user.id).map((room) => ({
      ...room,
      session: store.examSessions.find((item) => item.id === room.examSessionId)
    }));
    roomCount = rooms.length;
    return NextResponse.json({ rooms });
  } catch (error) {
    status = 400;
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load rooms." },
      { status: 400 }
    );
  } finally {
    logServerTiming("api.mobile.my-rooms", startedAt, { status, roomCount });
  }
}
