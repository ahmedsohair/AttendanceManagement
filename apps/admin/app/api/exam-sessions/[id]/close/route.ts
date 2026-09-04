import { observeApiHandler } from "@/lib/api-observer";
import { logApiTiming } from "@/lib/timing";
import { NextResponse } from "next/server";
import { uuidSchema } from "@algo-attendance/shared";
import { requireApiUser } from "@/lib/auth";
import { closeExamSession } from "@/lib/repository";
import { handleApiError } from "@/lib/api-response";

async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireApiUser(request, { allowedRoles: ["admin"] });
    const { id: rawId } = await params;
    const id = uuidSchema.parse(rawId);
    await closeExamSession(id, admin.id);
    return new NextResponse(null, {
      status: 303,
      headers: {
        Location: `/sessions/${id}`
      }
    });
  } catch (error) {
    return handleApiError(request, error, "Exam closure failed.");
  }
}

export const POST = observeApiHandler(handlePOST, logApiTiming);
