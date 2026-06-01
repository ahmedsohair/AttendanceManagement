import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

import { getUserById } from "@/lib/auth";

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
    const { email, password } = (await request.json()) as {
      email?: string;
      password?: string;
    };

    if (!email?.trim() || !password) {
      return NextResponse.json(
        { message: "Email and password are required." },
        { status: 400 }
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
      email: email.trim().toLowerCase(),
      password
    });

    if (error || !user) {
      return NextResponse.json(
        { message: error?.message || "Unable to sign in." },
        { status: 401 }
      );
    }

    const profile = await getUserById(user.id);
    if (!profile || profile.role !== "admin") {
      return NextResponse.json(
        { message: "This account is not allowed to access the admin dashboard." },
        { status: 403 }
      );
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Unable to sign in."
      },
      { status: 500 }
    );
  }
}
