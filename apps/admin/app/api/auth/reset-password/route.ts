import { observeApiHandler } from "@/lib/api-observer";
import { logApiTiming } from "@/lib/timing";
import { NextResponse } from "next/server";
import { emailAddressSchema } from "@algo-attendance/shared";

import { enforceAuthRateLimits } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";
import { API_ERROR_CODES } from "@/lib/api-errors";
import { apiErrorResponse, handleApiError } from "@/lib/api-response";

const resetPasswordLimits = {
  address: { limit: 20, windowSeconds: 3600, blockSeconds: 3600 },
  identity: { limit: 3, windowSeconds: 3600, blockSeconds: 3600 }
};

const genericMessage =
  "If an eligible account exists, a password reset email will be sent shortly.";

async function handlePOST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string };
    const parsedEmail = emailAddressSchema.safeParse(body.email);
    const email = parsedEmail.success ? parsedEmail.data : "";

    const rateLimit = await enforceAuthRateLimits(
      request,
      "admin-password-reset",
      email || "invalid",
      resetPasswordLimits
    );
    if (!rateLimit.allowed) {
      return apiErrorResponse(
        request,
        API_ERROR_CODES.rateLimited,
        "Too many reset requests. Try again later.",
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    if (email) {
      const supabase = getSupabaseAdmin();
      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("role")
        .eq("email", email)
        .maybeSingle();

      if (profileError) {
        throw new Error(profileError.message);
      }

      if (profile?.role === "admin") {
        const appBaseUrl =
          process.env.APP_BASE_URL?.trim() || new URL(request.url).origin;
        const redirectTo = new URL(
          "/auth/callback?next=/update-password",
          appBaseUrl
        ).toString();
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo
        });

        if (error) {
          throw new Error(error.message);
        }
      }
    }

    return NextResponse.json({ ok: true, message: genericMessage });
  } catch (error) {
    return handleApiError(request, error, "Password reset request failed.", 503);
  }
}

export const POST = observeApiHandler(handlePOST, logApiTiming);
