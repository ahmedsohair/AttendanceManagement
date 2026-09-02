import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import {
  claimEmailDeliveries,
  completeEmailDeliveryAttempt,
  createAccessCodeEmailJob,
  getEmailJob
} from "@/lib/email-delivery-repository";
import { sendInvigilatorAccessCodeEmail } from "@/lib/invigilator-instruction-email";
import { recordInvigilatorAccessCodeEmailed } from "@/lib/repository";
import { isSupabaseConfigured } from "@/lib/supabase";

const accessCodeTemplateVersion = "access-code-v1";

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

    const idempotencyKey = request.headers.get("idempotency-key")?.trim() || randomUUID();
    if (idempotencyKey.length > 200) {
      return NextResponse.json(
        { message: "The email request identifier is invalid." },
        { status: 400 }
      );
    }
    const job = await createAccessCodeEmailJob({
      idempotencyKey,
      requestedBy: admin.id,
      templateVersion: accessCodeTemplateVersion,
      userId
    });
    const workerId = randomUUID();
    const [delivery] = await claimEmailDeliveries({
      jobId: job.jobId,
      limit: 1,
      workerId
    });

    if (!delivery) {
      const currentJob = await getEmailJob(job.jobId);
      return NextResponse.json(
        {
          job: currentJob,
          message:
            currentJob?.status === "completed"
              ? "This access-code email was already accepted by the provider."
              : "This access-code email request is already being processed."
        },
        { status: 202 }
      );
    }

    const templateData = delivery.templateData as { fullName?: unknown } | null;
    try {
      const providerResult = await sendInvigilatorAccessCodeEmail({
        accessCode,
        appBaseUrl: getAppBaseUrl(request),
        email: delivery.recipientEmail,
        fullName:
          typeof templateData?.fullName === "string" ? templateData.fullName : undefined
      });
      await completeEmailDeliveryAttempt({
        deliveryId: delivery.id,
        provider: providerResult.provider,
        providerMessageId: providerResult.providerMessageId,
        status: "accepted",
        workerId
      });
    } catch (error) {
      await completeEmailDeliveryAttempt({
        deliveryId: delivery.id,
        failureReason: error instanceof Error ? error.message : "Email delivery failed.",
        status: "failed",
        workerId
      });
      throw error;
    }

    await recordInvigilatorAccessCodeEmailed(userId, accessCode);

    return NextResponse.json({
      jobId: job.jobId,
      message: "Access-code email accepted by the email provider."
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to email access code." },
      { status: 400 }
    );
  }
}
