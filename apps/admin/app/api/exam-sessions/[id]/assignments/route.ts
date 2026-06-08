import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { updateExamRoomAssignments } from "@/lib/repository";

type AssignmentPayload = {
  roomAssignments?: Array<{
    roomId?: string;
    invigilatorIds?: string[];
  }>;
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await requireApiUser(request, { allowedRoles: ["admin"] });
    const payload = (await request.json()) as AssignmentPayload;
    const roomAssignments = (payload.roomAssignments || []).map((assignment) => ({
      roomId: String(assignment.roomId || "").trim(),
      invigilatorIds: (assignment.invigilatorIds || [])
        .map((invigilatorId) => String(invigilatorId).trim())
        .filter(Boolean)
    }));

    await updateExamRoomAssignments({
      examSessionId: id,
      roomAssignments
    });

    revalidatePath(`/sessions/${id}`);
    revalidatePath("/sessions/new");
    revalidatePath("/invigilators");

    return NextResponse.json({
      message: "Room assignments saved."
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save room assignments.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
