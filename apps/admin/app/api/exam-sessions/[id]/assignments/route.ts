import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { roomAssignmentRequestSchema, uuidSchema } from "@algo-attendance/shared";
import { requireApiUser } from "@/lib/auth";
import { updateExamRoomAssignments } from "@/lib/repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireApiUser(request, { allowedRoles: ["admin"] });
    const { id: rawId } = await params;
    const id = uuidSchema.parse(rawId);
    const payload = roomAssignmentRequestSchema.parse(await request.json());

    const committedRoomAssignments = await updateExamRoomAssignments({
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
    const message =
      error instanceof Error ? error.message : "Unable to save room assignments.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
