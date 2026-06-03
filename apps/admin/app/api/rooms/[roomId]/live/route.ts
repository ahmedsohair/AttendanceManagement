import { NextResponse } from "next/server";
import { requireApiUserWithStore } from "@/lib/auth";
import { getRoomLiveState } from "@/lib/selectors";
import { readStore } from "@/lib/store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const { store: authorizedStore } = await requireApiUserWithStore(request, {
      allowedRoles: ["admin", "invigilator"],
      roomId
    });
    const store = authorizedStore || (await readStore());
    const liveState = getRoomLiveState(store, roomId);
    return NextResponse.json(liveState);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load room state." },
      { status: 400 }
    );
  }
}
