import { NextResponse } from "next/server";
import { uuidSchema } from "@algo-attendance/shared";
import { requireApiUser } from "@/lib/auth";
import { deleteExamSession } from "@/lib/repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireApiUser(request, { allowedRoles: ["admin"] });
    const { id: rawId } = await params;
    const id = uuidSchema.parse(rawId);
    await deleteExamSession(id);
    return new NextResponse(null, {
      status: 303,
      headers: {
        Location: "/sessions"
      }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete session.";
    const status = message === "Session not found." ? 404 : 400;
    return NextResponse.json({ message }, { status });
  }
}
