import { NextResponse } from "next/server";
import { requireApiUserWithStore } from "@/lib/auth";
import { getRoomLiveState } from "@/lib/selectors";
import { readStore } from "@/lib/store";
import { logServerTiming } from "@/lib/timing";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const startedAt = performance.now();
  let status = 200;
  let presentCount: number | undefined;
  let incidentCount: number | undefined;

  try {
    const { roomId } = await params;
    const { store: authorizedStore } = await requireApiUserWithStore(request, {
      allowedRoles: ["admin", "invigilator"],
      roomId
    });
    const store = authorizedStore || (await readStore());
    const liveState = getRoomLiveState(store, roomId);
    presentCount = liveState.summary?.presentCount;
    incidentCount = liveState.recentIncidents?.length;
    return NextResponse.json(liveState);
  } catch (error) {
    status = 400;
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load room state." },
      { status: 400 }
    );
  } finally {
    logServerTiming("api.rooms.live", startedAt, {
      status,
      presentCount,
      incidentCount
    });
  }
}
