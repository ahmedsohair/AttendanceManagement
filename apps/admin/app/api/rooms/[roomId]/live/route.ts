import { NextResponse } from "next/server";
import { uuidSchema } from "@algo-attendance/shared";
import { requireApiUserForRoom, requireApiUserWithStore } from "@/lib/auth";
import { getRoomLiveStateFast } from "@/lib/repository";
import { getRoomLiveState } from "@/lib/selectors";
import { readStore } from "@/lib/store";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { logServerTiming } from "@/lib/timing";
import { ApiRequestError, getApiErrorStatus } from "@/lib/api-errors";
import { handleApiError } from "@/lib/api-response";

async function getRoomExamSessionId(roomId: string) {
  const roomResponse = await getSupabaseAdmin()
    .from("rooms")
    .select("exam_session_id")
    .eq("id", roomId)
    .maybeSingle();

  if (roomResponse.error) {
    throw new Error(roomResponse.error.message);
  }

  if (!roomResponse.data) {
    throw new ApiRequestError("Room not found.", 404);
  }

  return String(roomResponse.data.exam_session_id);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const startedAt = performance.now();
  let status = 200;
  let presentCount: number | undefined;
  let incidentCount: number | undefined;

  try {
    const { roomId: rawRoomId } = await params;
    const roomId = uuidSchema.parse(rawRoomId);
    if (isSupabaseConfigured()) {
      const examSessionId = await getRoomExamSessionId(roomId);
      await requireApiUserForRoom(request, {
        allowedRoles: ["admin", "invigilator"],
        roomId,
        examSessionId
      });
      const roomState = await getRoomLiveStateFast(roomId);
      presentCount = roomState.summary?.presentCount;
      incidentCount = roomState.recentIncidents?.length;
      return NextResponse.json(roomState);
    }

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
    status = getApiErrorStatus(error);
    return handleApiError(request, error, "Room live-state request failed.");
  } finally {
    logServerTiming("api.rooms.live", startedAt, {
      status,
      presentCount,
      incidentCount
    });
  }
}
