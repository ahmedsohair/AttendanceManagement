import { NextResponse } from "next/server";
import { fallbackLoginRequestSchema } from "@algo-attendance/shared";
import { isSupabaseConfigured } from "@/lib/supabase";
import { upsertFallbackUser } from "@/lib/auth";
import { API_ERROR_CODES } from "@/lib/api-errors";
import { apiErrorResponse, handleApiError } from "@/lib/api-response";

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === "production") {
      return apiErrorResponse(request, API_ERROR_CODES.notFound, "Not found.", { status: 404 });
    }

    if (isSupabaseConfigured()) {
      return apiErrorResponse(request, API_ERROR_CODES.notFound, "Not found.", { status: 404 });
    }

    const parsedBody = fallbackLoginRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return apiErrorResponse(request, API_ERROR_CODES.validationError, "A valid email is required.", { status: 422 });
    }
    const body = parsedBody.data;
    const user = await upsertFallbackUser(body.email, body.fullName);
    return NextResponse.json({ user });
  } catch (error) {
    return handleApiError(request, error, "Development login failed.");
  }
}
