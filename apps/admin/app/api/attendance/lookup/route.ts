import { NextResponse } from "next/server";
import { lookupRequestSchema, lookupStudent } from "@algo-attendance/shared";
import { requireApiUserWithStore } from "@/lib/auth";
import { readStore } from "@/lib/store";
import { logServerTiming } from "@/lib/timing";

export async function POST(request: Request) {
  const startedAt = performance.now();
  let status = 200;

  try {
    const body = lookupRequestSchema.parse(await request.json());
    const { store: authorizedStore } = await requireApiUserWithStore(request, {
      allowedRoles: ["admin", "invigilator"],
      roomId: body.roomId,
      examSessionId: body.examSessionId
    });
    const store = authorizedStore || (await readStore());
    const result = lookupStudent(store, body);
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
