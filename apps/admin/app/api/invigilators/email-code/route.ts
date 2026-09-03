import { NextResponse } from "next/server";
import {
  emailAccessCodeRequestSchema,
  idempotencyKeySchema
} from "@algo-attendance/shared";
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
    const body = emailAccessCodeRequestSchema.parse(await request.json());

    if (!isSupabaseConfigured()) {
      await sendInvigilatorAccessCodeEmail({
        accessCode: body.accessCode,
        appBaseUrl: getAppBaseUrl(request),
        email: body.email,
        fullName: body.fullName
      });
      await recordInvigilatorAccessCodeEmailed(body.userId, body.accessCode);
      return NextResponse.json({ message: "Access code emailed." });
    }

    const suppliedIdempotencyKey = request.headers.get("idempotency-key");
    if (!suppliedIdempotencyKey) {
      return NextResponse.json(
        { message: "The email request identifier is required." },
        { status: 400 }
      );
    }
    const idempotencyKey = idempotencyKeySchema.parse(suppliedIdempotencyKey);
    const result = await sendTrackedAccessCodeEmail({
      accessCode: body.accessCode,
      appBaseUrl: getAppBaseUrl(request),
      idempotencyKey,
      requestedBy: admin.id,
      userId: body.userId
    });
    return NextResponse.json(result, { status: result.job?.status === "processing" ? 202 : 200 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to email access code." },
      { status: 400 }
    );
  }
}
