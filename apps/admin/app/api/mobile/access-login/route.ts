import { NextResponse } from "next/server";
import { hashAccessCode, normalizeAccessCode } from "@/lib/access-code";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { readStore } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { accessCode?: string };
    const accessCode = normalizeAccessCode(body.accessCode || "");
    const accessCodeHash = hashAccessCode(accessCode);

    if (!accessCode || !accessCodeHash) {
      throw new Error("Enter a valid invigilator access code.");
    }

    if (!isSupabaseConfigured()) {
      const store = await readStore();
      const user = store.users.find(
        (candidate) =>
          candidate.role === "invigilator" &&
          candidate.accessCodeHash === accessCodeHash
      );

      if (!user) {
        throw new Error("Access code was not found.");
      }

      return NextResponse.json({ email: user.email, user });
    }

    const supabase = getSupabaseAdmin();
    const userResponse = await supabase
      .from("users")
      .select("id, email, full_name, role")
      .eq("access_code_hash", accessCodeHash)
      .maybeSingle();

    if (userResponse.error) {
      throw new Error(userResponse.error.message);
    }

    if (!userResponse.data || userResponse.data.role !== "invigilator") {
      throw new Error("Access code was not found.");
    }

    return NextResponse.json({
      email: userResponse.data.email
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to verify access code." },
      { status: 401 }
    );
  }
}
