import { NextResponse } from "next/server";
import { uuidSchema } from "@algo-attendance/shared";
import { requireApiUser } from "@/lib/auth";
import { deleteExamSession } from "@/lib/repository";
import { handleApiError } from "@/lib/api-response";

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
    return handleApiError(request, error, "Exam deletion failed.");
  }
}
