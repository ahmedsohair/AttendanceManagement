import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { sendInvigilatorAccessCodeEmail } from "@/lib/invigilator-instruction-email";
import { recordInvigilatorAccessCodeEmailed } from "@/lib/repository";
import { isSupabaseConfigured } from "@/lib/supabase";
import { sendTrackedAccessCodeEmail } from "@/lib/tracked-access-code-email";

function getAppBaseUrl(request: Request) {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    new URL(request.url).origin
  );
}

export async function POST(request: Request) {
  try {
    const admin = await requireApiUser(request, { allowedRoles: ["admin"] });
    const body = (await request.json()) as {
      accessCode?: string;
      email?: string;
      fullName?: string;
      userId?: string;
    };
    const accessCode = String(body.accessCode || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const userId = String(body.userId || "").trim();

    if (!accessCode || !email || !userId) {
      return NextResponse.json(
        { message: "Invigilator, access code, and email are required." },
        { status: 400 }
      );
    }

    if (!isSupabaseConfigured()) {
      await sendInvigilatorAccessCodeEmail({
        accessCode,
        appBaseUrl: getAppBaseUrl(request),
        email,
        fullName: String(body.fullName || "").trim()
      });
      await recordInvigilatorAccessCodeEmailed(userId, accessCode);
      return NextResponse.json({ message: "Access code emailed." });
    }

    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey) {
      return NextResponse.json(
        { message: "The email request identifier is required." },
        { status: 400 }
      );
    }
    if (idempotencyKey.length > 200) {
      return NextResponse.json(
        { message: "The email request identifier is invalid." },
        { status: 400 }
      );
    }
    const result = await sendTrackedAccessCodeEmail({
      accessCode,
      appBaseUrl: getAppBaseUrl(request),
      idempotencyKey,
      requestedBy: admin.id,
      userId
    });
    return NextResponse.json(result, { status: result.job?.status === "processing" ? 202 : 200 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to email access code." },
      { status: 400 }
    );
  }
}
