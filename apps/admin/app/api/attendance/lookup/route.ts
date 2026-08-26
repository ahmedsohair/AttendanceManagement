import { NextResponse } from "next/server";
import { lookupRequestSchema, lookupStudent, normalizeStudentId } from "@algo-attendance/shared";
import { requireApiUserForRoom } from "@/lib/auth";
import { lookupStudentFast } from "@/lib/repository";
import { logServerTiming } from "@/lib/timing";

export async function POST(request: Request) {
  const startedAt = performance.now();
  let status = 200;

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
    return NextResponse.json({ result });
  } catch (error) {
    status = 400;
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Lookup failed." },
      { status: 400 }
    );
  } finally {
    logServerTiming("api.attendance.lookup", startedAt, { status });
  }
}
