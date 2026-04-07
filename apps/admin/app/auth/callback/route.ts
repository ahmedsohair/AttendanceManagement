import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

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

function getSafeNextPath(nextPath: string | null) {
  if (!nextPath || !nextPath.startsWith("/")) {
    return "/update-password";
  }

  return nextPath;
}

export async function GET(request: NextRequest) {
  try {
    const { url, publishableKey } = getSupabaseSessionConfig();
    const code = request.nextUrl.searchParams.get("code");
    const nextPath = getSafeNextPath(request.nextUrl.searchParams.get("next"));
    const response = NextResponse.redirect(new URL(nextPath, request.url));

    if (!code) {
      return NextResponse.redirect(
        new URL("/reset-password?error=Missing+recovery+code.", request.url)
      );
    }

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

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(
          `/reset-password?error=${encodeURIComponent(error.message)}`,
          request.url
        )
      );
    }

    return response;
  } catch (error) {
    return NextResponse.redirect(
      new URL(
        `/reset-password?error=${encodeURIComponent(
          error instanceof Error ? error.message : "Unable to verify recovery link."
        )}`,
        request.url
      )
    );
  }
}
