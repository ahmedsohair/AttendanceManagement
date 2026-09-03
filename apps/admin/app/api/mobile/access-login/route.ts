import { NextResponse } from "next/server";
import { accessCodeLoginRequestSchema } from "@algo-attendance/shared";
import { hashAccessCode, normalizeAccessCode } from "@/lib/access-code";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { readStore } from "@/lib/store";
import { logServerTiming } from "@/lib/timing";
import { enforceAuthRateLimits } from "@/lib/rate-limit";
import { API_ERROR_CODES, ApiRequestError, getApiErrorStatus } from "@/lib/api-errors";
import { apiErrorResponse, handleApiError } from "@/lib/api-response";

const accessLoginLimits = {
  address: { limit: 120, windowSeconds: 600, blockSeconds: 600 },
  identity: { limit: 10, windowSeconds: 600, blockSeconds: 600 }
};

export async function POST(request: Request) {
  const startedAt = performance.now();
  let status = 200;

  try {
    const parsedBody = accessCodeLoginRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      throw new ApiRequestError("Enter a valid invigilator access code.", 422);
    }
    const body = parsedBody.data;
    const accessCode = normalizeAccessCode(body.accessCode);
    const accessCodeHash = hashAccessCode(accessCode);

    if (!accessCode || !accessCodeHash) {
      throw new ApiRequestError("Enter a valid invigilator access code.", 422);
    }

    const rateLimit = await enforceAuthRateLimits(
      request,
      "invigilator-access-login",
      accessCode,
      accessLoginLimits
    );
    if (!rateLimit.allowed) {
      status = 429;
      return apiErrorResponse(
        request,
        API_ERROR_CODES.rateLimited,
        "Too many attempts. Try again later.",
        { status, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    if (!isSupabaseConfigured()) {
      const store = await readStore();
      const user = store.users.find(
        (candidate) =>
          candidate.role === "invigilator" &&
          (candidate.accessCodeHash === accessCodeHash ||
            candidate.pendingAccessCodeHash === accessCodeHash)
      );

      if (!user) {
        throw new ApiRequestError("Invalid access code.", 401);
      }

      return NextResponse.json({ email: user.email, user });
    }

    const supabase = getSupabaseAdmin();
    const userResponse = await supabase
      .from("users")
      .select("id, email, full_name, role")
      .or(
        `access_code_hash.eq.${accessCodeHash},pending_access_code_hash.eq.${accessCodeHash}`
      )
      .maybeSingle();

    if (userResponse.error) {
      throw new Error(userResponse.error.message);
    }

    if (!userResponse.data || userResponse.data.role !== "invigilator") {
      throw new ApiRequestError("Invalid access code.", 401);
    }

    return NextResponse.json({
      email: userResponse.data.email
    });
  } catch (error) {
    status = getApiErrorStatus(error, 503);
    return handleApiError(request, error, "Invigilator access-code login failed.", 503);
  } finally {
    logServerTiming("api.mobile.access-login", startedAt, { status });
  }
}
