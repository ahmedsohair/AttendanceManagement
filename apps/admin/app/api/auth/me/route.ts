import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request, {
      allowedRoles: ["admin", "invigilator"]
    });

    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load user profile." },
      { status: 401 }
    );
  }
}
