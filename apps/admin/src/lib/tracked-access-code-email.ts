import "server-only";

import { randomUUID } from "node:crypto";
import {
  claimEmailDeliveries,
  completeEmailDeliveryAttempt,
  createAccessCodeEmailJob,
  getEmailJob
} from "./email-delivery-repository";
import { sendInvigilatorAccessCodeEmail } from "./invigilator-instruction-email";
import { recordInvigilatorAccessCodeEmailed } from "./repository";

const accessCodeTemplateVersion = "access-code-v1";

export async function sendTrackedAccessCodeEmail(input: {
  accessCode: string;
  appBaseUrl: string;
  idempotencyKey: string;
  requestedBy: string;
  userId: string;
}) {
  const job = await createAccessCodeEmailJob({
    idempotencyKey: input.idempotencyKey,
    requestedBy: input.requestedBy,
    templateVersion: accessCodeTemplateVersion,
    userId: input.userId
  });
  const workerId = randomUUID();
  const [delivery] = await claimEmailDeliveries({
    jobId: job.jobId,
    limit: 1,
    workerId
  });

  if (!delivery) {
    const currentJob = await getEmailJob(job.jobId);
    return {
      job: currentJob,
      message:
        currentJob?.status === "completed"
          ? "This access-code email was already accepted by the provider."
          : "This access-code email request is already being processed."
    };
  }

  const templateData = delivery.templateData as { fullName?: unknown } | null;
  try {
    const providerResult = await sendInvigilatorAccessCodeEmail({
      accessCode: input.accessCode,
      appBaseUrl: input.appBaseUrl,
      email: delivery.recipientEmail,
      fullName: typeof templateData?.fullName === "string" ? templateData.fullName : undefined
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

  await recordInvigilatorAccessCodeEmailed(input.userId, input.accessCode);
  return {
    job: await getEmailJob(job.jobId),
    message: "Access-code email accepted by the email provider."
  };
}
