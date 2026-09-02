import "server-only";

import type { ExamSession, Room, User } from "@algo-attendance/shared";
import {
  claimEmailDeliveries,
  completeEmailDeliveryAttempt,
  getEmailJob,
  type ClaimedEmailDelivery
} from "./email-delivery-repository";
import {
  EmailProviderError,
  sendInvigilatorInstructionEmail
} from "./invigilator-instruction-email";

type AssignmentTemplateData = {
  fullName: string;
  rooms: Room[];
  session: ExamSession;
};

const defaultSendIntervalMs = 600;

function sendIntervalMs() {
  const configured = Number(process.env.EMAIL_SEND_INTERVAL_MS);
  if (!Number.isFinite(configured)) {
    return defaultSendIntervalMs;
  }

  return Math.min(Math.max(Math.round(configured), 250), 5000);
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function readAssignmentTemplate(delivery: ClaimedEmailDelivery): AssignmentTemplateData {
  const value = delivery.templateData as Partial<AssignmentTemplateData> | null;
  if (
    delivery.templateType !== "assignment" ||
    !value ||
    typeof value.fullName !== "string" ||
    !Array.isArray(value.rooms) ||
    !value.rooms.length ||
    !value.session ||
    typeof value.session.id !== "string" ||
    typeof value.session.name !== "string" ||
    typeof value.session.examDate !== "string" ||
    typeof value.session.startTime !== "string"
  ) {
    throw new Error("The queued assignment email snapshot is incomplete.");
  }

  return value as AssignmentTemplateData;
}

function retryDelaySeconds(delivery: ClaimedEmailDelivery, error: EmailProviderError) {
  if (error.retryAfterSeconds) {
    return Math.min(error.retryAfterSeconds, 300);
  }

  return Math.min(5 * 2 ** Math.max(delivery.attemptCount - 1, 0), 60);
}

async function processDelivery(input: {
  appBaseUrl: string;
  delivery: ClaimedEmailDelivery;
  workerId: string;
}) {
  try {
    const template = readAssignmentTemplate(input.delivery);
    const invigilator: User = {
      assignedRoomIds: template.rooms.map((room) => room.id),
      email: input.delivery.recipientEmail,
      fullName: template.fullName,
      id: input.delivery.userId || input.delivery.id,
      role: "invigilator"
    };
    const providerResult = await sendInvigilatorInstructionEmail({
      appBaseUrl: input.appBaseUrl,
      invigilator,
      rooms: template.rooms,
      session: template.session
    });

    await completeEmailDeliveryAttempt({
      deliveryId: input.delivery.id,
      provider: providerResult.provider,
      providerMessageId: providerResult.providerMessageId,
      status: "accepted",
      workerId: input.workerId
    });

    return { deliveryId: input.delivery.id, status: "accepted" as const };
  } catch (error) {
    const providerError = error instanceof EmailProviderError ? error : null;
    const shouldRetry = Boolean(providerError?.transient && input.delivery.attemptCount < 4);

    await completeEmailDeliveryAttempt({
      deliveryId: input.delivery.id,
      failureReason: error instanceof Error ? error.message : "Email delivery failed.",
      retryAfterSeconds:
        shouldRetry && providerError
          ? retryDelaySeconds(input.delivery, providerError)
          : undefined,
      status: "failed",
      workerId: input.workerId
    });

    return {
      deliveryId: input.delivery.id,
      status: shouldRetry ? ("retrying" as const) : ("failed" as const)
    };
  }
}

export async function processEmailJobBatch(input: {
  appBaseUrl: string;
  batchSize?: number;
  jobId: string;
  workerId: string;
}) {
  const deliveries = await claimEmailDeliveries({
    jobId: input.jobId,
    limit: input.batchSize || 3,
    workerId: input.workerId
  });
  const results: Awaited<ReturnType<typeof processDelivery>>[] = [];
  for (const [index, delivery] of deliveries.entries()) {
    if (index > 0) {
      await wait(sendIntervalMs());
    }

    results.push(
      await processDelivery({
        appBaseUrl: input.appBaseUrl,
        delivery,
        workerId: input.workerId
      })
    );
  }
  const job = await getEmailJob(input.jobId);

  if (!job) {
    throw new Error("Email job not found.");
  }

  return { job, processed: results.length, results };
}
