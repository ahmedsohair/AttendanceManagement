import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request, {
      allowedRoles: ["admin", "invigilator"]
    });

    return NextResponse.json({ user });
  } catch (error) {
    return handleApiError(request, error, "User profile request failed.");
  }
}
