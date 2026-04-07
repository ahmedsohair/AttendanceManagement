import { NextResponse } from "next/server";
import { markAttendanceRequestSchema } from "@algo-attendance/shared";
import { requireApiUser } from "@/lib/auth";
import { applyAttendanceMark } from "@/lib/repository";

export async function POST(request: Request) {
  try {
    const body = markAttendanceRequestSchema.parse(await request.json());
    const user = await requireApiUser(request, {
      allowedRoles: ["admin", "invigilator"],
      roomId: body.roomId
    });
    const response = await applyAttendanceMark({
      ...body,
      userId: user.id
    });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to mark attendance." },
      { status: 400 }
    );
  }
}
