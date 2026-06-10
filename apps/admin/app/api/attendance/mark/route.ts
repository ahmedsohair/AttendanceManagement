import { NextResponse } from "next/server";
import { markAttendanceRequestSchema } from "@algo-attendance/shared";
import { requireApiUserWithStore } from "@/lib/auth";
import { applyAttendanceMark } from "@/lib/repository";
import { logServerTiming } from "@/lib/timing";

export async function POST(request: Request) {
  const startedAt = performance.now();
  let status = 200;

  try {
    const body = markAttendanceRequestSchema.parse(await request.json());
    const { user, store } = await requireApiUserWithStore(request, {
      allowedRoles: ["admin", "invigilator"],
      roomId: body.roomId,
      examSessionId: body.examSessionId
    });
    const response = await applyAttendanceMark({
      ...body,
      userId: user.id
    }, store);
    return NextResponse.json(response);
  } catch (error) {
    status = 400;
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to mark attendance." },
      { status: 400 }
    );
  } finally {
    logServerTiming("api.attendance.mark", startedAt, { status });
  }
}
