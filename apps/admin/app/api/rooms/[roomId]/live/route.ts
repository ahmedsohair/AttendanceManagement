import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getRoomLiveState } from "@/lib/selectors";
import { readStore } from "@/lib/store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    await requireApiUser(request, {
      allowedRoles: ["admin", "invigilator"],
      roomId
    });
    const store = await readStore();
    const liveState = getRoomLiveState(store, roomId);
    return NextResponse.json(liveState);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load room state." },
      { status: 400 }
    );
  }
}
