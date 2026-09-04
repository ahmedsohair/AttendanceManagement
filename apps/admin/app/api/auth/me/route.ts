import { observeApiHandler } from "@/lib/api-observer";
import { logApiTiming } from "@/lib/timing";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-response";

async function handleGET(request: Request) {
  try {
    const user = await requireApiUser(request, {
      allowedRoles: ["admin", "invigilator"]
    });

    return NextResponse.json({ user });
  } catch (error) {
    return handleApiError(request, error, "User profile request failed.");
  }
}

export const GET = observeApiHandler(handleGET, logApiTiming);
