import { NextResponse } from "next/server";
import { markAttendanceRequestSchema, normalizeStudentId } from "@algo-attendance/shared";
import { requireApiUserForRoom } from "@/lib/auth";
import { applyAttendanceMark } from "@/lib/repository";
import { logApiTiming } from "@/lib/timing";
import { getApiErrorStatus, getApiErrorCode } from "@/lib/api-errors";
import { handleApiError } from "@/lib/api-response";

export async function POST(request: Request) {
  const startedAt = performance.now();
  let status = 200;
  let code = "OK";

  try {
    const parsedBody = markAttendanceRequestSchema.parse(await request.json());
    const body = {
      ...parsedBody,
      studentId: normalizeStudentId(parsedBody.studentId)
    };
    const { user, store } = await requireApiUserForRoom(request, {
      allowedRoles: ["admin", "invigilator"],
      roomId: body.roomId,
      examSessionId: body.examSessionId
    });
    const response = await applyAttendanceMark({
      ...body,
      userId: user.id
    }, store);
    code = response.result.status;
    return NextResponse.json(response);
  } catch (error) {
    status = getApiErrorStatus(error);
    code = getApiErrorCode(error);
    return handleApiError(request, error, "Attendance mark failed.");
  } finally {
    logApiTiming(request, startedAt, status, code);
  }
}
