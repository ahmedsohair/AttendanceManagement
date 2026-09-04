import { NextResponse } from "next/server";
import { lookupRequestSchema, lookupStudent, normalizeStudentId } from "@algo-attendance/shared";
import { requireApiUserForRoom } from "@/lib/auth";
import { lookupStudentFast } from "@/lib/repository";
import { logApiTiming } from "@/lib/timing";
import { getApiErrorStatus, getApiErrorCode } from "@/lib/api-errors";
import { handleApiError } from "@/lib/api-response";

export async function POST(request: Request) {
  const startedAt = performance.now();
  let status = 200;
  let code = "OK";

  try {
    const parsedBody = lookupRequestSchema.parse(await request.json());
    const body = {
      ...parsedBody,
      studentId: normalizeStudentId(parsedBody.studentId)
    };
    const { store } = await requireApiUserForRoom(request, {
      allowedRoles: ["admin", "invigilator"],
      roomId: body.roomId,
      examSessionId: body.examSessionId
    });
    const result = store ? lookupStudent(store, body) : await lookupStudentFast(body);
    code = result.status;
    return NextResponse.json({ result });
  } catch (error) {
    status = getApiErrorStatus(error);
    code = getApiErrorCode(error);
    return handleApiError(request, error, "Attendance lookup failed.");
  } finally {
    logApiTiming(request, startedAt, status, code);
  }
}
