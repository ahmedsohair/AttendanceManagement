import { NextResponse } from "next/server";
import { lookupRequestSchema, lookupStudent } from "@algo-attendance/shared";
import { requireApiUserWithStore } from "@/lib/auth";
import { readStore } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const body = lookupRequestSchema.parse(await request.json());
    const { store: authorizedStore } = await requireApiUserWithStore(request, {
      allowedRoles: ["admin", "invigilator"],
      roomId: body.roomId
    });
    const store = authorizedStore || (await readStore());
    const result = lookupStudent(store, body);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Lookup failed." },
      { status: 400 }
    );
  }
}
