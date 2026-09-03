import { NextResponse } from "next/server";
import { fallbackLoginRequestSchema } from "@algo-attendance/shared";
import { isSupabaseConfigured } from "@/lib/supabase";
import { upsertFallbackUser } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    }

    if (isSupabaseConfigured()) {
      return NextResponse.json(
        { message: "Direct API login is disabled when Supabase Auth is enabled." },
        { status: 410 }
      );
    }

    const parsedBody = fallbackLoginRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json({ message: "A valid email is required." }, { status: 400 });
    }
    const body = parsedBody.data;
    const user = await upsertFallbackUser(body.email, body.fullName);
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Login failed." },
      { status: 500 }
    );
  }
}
