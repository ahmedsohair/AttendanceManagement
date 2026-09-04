import { observeApiHandler } from "@/lib/api-observer";
import { logApiTiming } from "@/lib/timing";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { adminLoginRequestSchema } from "@algo-attendance/shared";

import { getUserById } from "@/lib/auth";
import { enforceAuthRateLimits } from "@/lib/rate-limit";
import { API_ERROR_CODES } from "@/lib/api-errors";
import { apiErrorResponse, handleApiError } from "@/lib/api-response";

const adminLoginLimits = {
  address: { limit: 30, windowSeconds: 600, blockSeconds: 900 },
  identity: { limit: 8, windowSeconds: 600, blockSeconds: 900 }
};

function getSupabaseSessionConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim();

  if (!url || !publishableKey) {
    throw new Error(
      "Supabase session auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY."
    );
  }

  return { url, publishableKey };
}

async function handlePOST(request: NextRequest) {
  try {
    const parsedCredentials = adminLoginRequestSchema.safeParse(await request.json());
    if (!parsedCredentials.success) {
      return apiErrorResponse(
        request,
        API_ERROR_CODES.validationError,
        "Enter a valid email address and password.",
        { status: 422 }
      );
    }
    const { email: normalizedEmail, password } = parsedCredentials.data;
    const rateLimit = await enforceAuthRateLimits(
      request,
      "admin-login",
      normalizedEmail,
      adminLoginLimits
    );
    if (!rateLimit.allowed) {
      return apiErrorResponse(
        request,
        API_ERROR_CODES.rateLimited,
        "Too many attempts. Try again later.",
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const { url, publishableKey } = getSupabaseSessionConfig();
    const response = NextResponse.json({ ok: true });
    const supabase = createServerClient(url, publishableKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const cookie of cookiesToSet) {
            response.cookies.set(cookie.name, cookie.value, cookie.options);
          }
        }
      }
    });

    const {
      data: { user },
      error
    } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    });

    if (error || !user) {
      return apiErrorResponse(
        request,
        API_ERROR_CODES.unauthenticated,
        "Invalid email or password.",
        { status: 401 }
      );
    }

    const profile = await getUserById(user.id);
    if (!profile || profile.role !== "admin") {
      await supabase.auth.signOut();
      return apiErrorResponse(
        request,
        API_ERROR_CODES.unauthenticated,
        "Invalid email or password.",
        { status: 401 }
      );
    }

    return response;
  } catch (error) {
    return handleApiError(request, error, "Admin sign-in request failed.");
  }
}

export const POST = observeApiHandler(handlePOST, logApiTiming);
