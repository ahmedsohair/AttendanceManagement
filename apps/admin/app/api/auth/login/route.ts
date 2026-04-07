import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { upsertFallbackUser } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    if (isSupabaseConfigured()) {
      return NextResponse.json(
        { message: "Direct API login is disabled when Supabase Auth is enabled." },
        { status: 410 }
      );
    }

    const body = (await request.json()) as { email?: string; fullName?: string };
    if (!body.email) {
      return NextResponse.json({ message: "email is required" }, { status: 400 });
    }

    const user = await upsertFallbackUser(body.email, body.fullName);
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Login failed." },
      { status: 500 }
    );
  }
}
