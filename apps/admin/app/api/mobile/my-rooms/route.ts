import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { listPublishedRoomsForUser } from "@/lib/selectors";
import { readStore } from "@/lib/store";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request, {
      allowedRoles: ["admin", "invigilator"]
    });
    const store = await readStore();
    const rooms = listPublishedRoomsForUser(store, user.id).map((room) => ({
      ...room,
      session: store.examSessions.find((item) => item.id === room.examSessionId)
    }));
    return NextResponse.json({ rooms });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load rooms." },
      { status: 400 }
    );
  }
}
