import { NextResponse } from "next/server";

import { enforceAuthRateLimits } from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";

const resetPasswordLimits = {
  address: { limit: 20, windowSeconds: 3600, blockSeconds: 3600 },
  identity: { limit: 3, windowSeconds: 3600, blockSeconds: 3600 }
};

const genericMessage =
  "If an eligible account exists, a password reset email will be sent shortly.";

function isPlausibleEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string };
    const email = body.email?.trim().toLowerCase() || "";

    const rateLimit = await enforceAuthRateLimits(
      request,
      "admin-password-reset",
      email || "invalid",
      resetPasswordLimits
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { message: "Too many reset requests. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }
        }
      );
    }

    if (isPlausibleEmail(email)) {
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
    console.error("Password reset request failed.", error);
    return NextResponse.json(
      { message: "Unable to process the request. Try again later." },
      { status: 503 }
    );
  }
}
