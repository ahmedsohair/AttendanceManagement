import { observeApiHandler } from "@/lib/api-observer";
import { logApiTiming } from "@/lib/timing";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { roomAssignmentRequestSchema, uuidSchema } from "@algo-attendance/shared";
import { requireApiUser } from "@/lib/auth";
import { updateExamRoomAssignments } from "@/lib/repository";
import { handleApiError } from "@/lib/api-response";

async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireApiUser(request, { allowedRoles: ["admin"] });
    const { id: rawId } = await params;
    const id = uuidSchema.parse(rawId);
    const payload = roomAssignmentRequestSchema.parse(await request.json());

    const committedRoomAssignments = await updateExamRoomAssignments({
      actorUserId: admin.id,
      examSessionId: id,
      expectedRoomAssignments: payload.expectedRoomAssignments,
      roomAssignments: payload.roomAssignments
    });

    revalidatePath(`/sessions/${id}`);
    revalidatePath("/sessions/new");
    revalidatePath("/invigilators");

    return NextResponse.json({
      message: "Room assignments saved.",
      roomAssignments: committedRoomAssignments
    });
  } catch (error) {
    return handleApiError(request, error, "Room-assignment update failed.");
  }
}

export const POST = observeApiHandler(handlePOST, logApiTiming);
