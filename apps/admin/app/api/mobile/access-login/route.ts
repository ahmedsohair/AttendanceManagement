import { NextResponse } from "next/server";
import { accessCodeLoginRequestSchema } from "@algo-attendance/shared";
import { hashAccessCode, normalizeAccessCode } from "@/lib/access-code";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { readStore } from "@/lib/store";
import { logServerTiming } from "@/lib/timing";
import { enforceAuthRateLimits } from "@/lib/rate-limit";

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
      throw new Error("Enter a valid invigilator access code.");
    }
    const body = parsedBody.data;
    const accessCode = normalizeAccessCode(body.accessCode);
    const accessCodeHash = hashAccessCode(accessCode);

    if (!accessCode || !accessCodeHash) {
      throw new Error("Enter a valid invigilator access code.");
    }

    const rateLimit = await enforceAuthRateLimits(
      request,
      "invigilator-access-login",
      accessCode,
      accessLoginLimits
    );
    if (!rateLimit.allowed) {
      status = 429;
      return NextResponse.json(
        { message: "Too many attempts. Try again later." },
        {
          status,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }
        }
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
        throw new Error("Invalid access code.");
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
      throw new Error("Invalid access code.");
    }

    return NextResponse.json({
      email: userResponse.data.email
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const isCredentialError =
      message === "Enter a valid invigilator access code." ||
      message === "Invalid access code.";
    status = isCredentialError ? 401 : 503;
    return NextResponse.json(
      {
        message: isCredentialError
          ? message
          : "Unable to verify access code. Try again shortly."
      },
      { status }
    );
  } finally {
    logServerTiming("api.mobile.access-login", startedAt, { status });
  }
}
