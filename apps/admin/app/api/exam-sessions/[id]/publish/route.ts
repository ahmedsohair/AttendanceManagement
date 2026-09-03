import { NextResponse } from "next/server";
import { uuidSchema } from "@algo-attendance/shared";
import { requireApiUser } from "@/lib/auth";
import { publishExamSession } from "@/lib/repository";
import { handleApiError } from "@/lib/api-response";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireApiUser(request, { allowedRoles: ["admin"] });
    const { id: rawId } = await params;
    const id = uuidSchema.parse(rawId);
    await publishExamSession(id, admin.id);
    return new NextResponse(null, {
      status: 303,
      headers: {
        Location: `/sessions/${id}`
      }
    });
  } catch (error) {
    return handleApiError(request, error, "Exam publication failed.");
  }
}
