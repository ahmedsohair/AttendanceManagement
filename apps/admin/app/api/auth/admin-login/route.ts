import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { adminLoginRequestSchema } from "@algo-attendance/shared";

import { getUserById } from "@/lib/auth";
import { enforceAuthRateLimits } from "@/lib/rate-limit";

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

export async function POST(request: NextRequest) {
  try {
    const parsedCredentials = adminLoginRequestSchema.safeParse(await request.json());
    if (!parsedCredentials.success) {
      return NextResponse.json(
        { message: "Enter a valid email address and password." },
        { status: 400 }
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
      return NextResponse.json(
        { message: "Too many attempts. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }
        }
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
      return NextResponse.json(
        { message: "Invalid email or password." },
        { status: 401 }
      );
    }

    const profile = await getUserById(user.id);
    if (!profile || profile.role !== "admin") {
      await supabase.auth.signOut();
      return NextResponse.json(
        { message: "Invalid email or password." },
        { status: 401 }
      );
    }

    return response;
  } catch (error) {
    console.error("Admin sign-in request failed.", error);
    return NextResponse.json(
      { message: "Unable to sign in. Try again shortly." },
      { status: 500 }
    );
  }
}
