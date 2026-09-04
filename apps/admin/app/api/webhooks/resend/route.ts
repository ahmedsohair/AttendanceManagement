import { observeApiHandler } from "@/lib/api-observer";
import { logApiTiming } from "@/lib/timing";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { recordEmailProviderEvent } from "@/lib/email-delivery-repository";
import { API_ERROR_CODES } from "@/lib/api-errors";
import { apiErrorResponse, handleApiError } from "@/lib/api-response";

export const runtime = "nodejs";

const maximumPayloadBytes = 256 * 1024;

type ResendWebhookEvent = {
  data?: {
    email_id?: string;
  };
  type?: string;
};

function readSignatureHeaders(request: Request) {
  const id = request.headers.get("svix-id")?.trim();
  const signature = request.headers.get("svix-signature")?.trim();
  const timestamp = request.headers.get("svix-timestamp")?.trim();

  if (!id || !signature || !timestamp) {
    throw new Error("Missing webhook signature headers.");
  }

  return {
    "svix-id": id,
    "svix-signature": signature,
    "svix-timestamp": timestamp
  };
}

async function handlePOST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return apiErrorResponse(request, API_ERROR_CODES.serviceUnavailable, "Webhook is not configured.", { status: 503 });
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumPayloadBytes) {
    return apiErrorResponse(request, API_ERROR_CODES.payloadTooLarge, "Webhook payload is too large.", { status: 413 });
  }

  const payload = await request.text();
  if (Buffer.byteLength(payload, "utf8") > maximumPayloadBytes) {
    return apiErrorResponse(request, API_ERROR_CODES.payloadTooLarge, "Webhook payload is too large.", { status: 413 });
  }

  let headers: ReturnType<typeof readSignatureHeaders>;
  try {
    headers = readSignatureHeaders(request);
    new Webhook(webhookSecret).verify(payload, headers);
  } catch {
    return apiErrorResponse(request, API_ERROR_CODES.unauthenticated, "Invalid webhook signature.", { status: 401 });
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(payload) as ResendWebhookEvent;
  } catch {
    return apiErrorResponse(request, API_ERROR_CODES.malformedRequest, "Webhook payload is invalid.", { status: 400 });
  }

  const eventType = event.type?.trim();
  if (!eventType) {
    return apiErrorResponse(request, API_ERROR_CODES.validationError, "Webhook event type is missing.", { status: 422 });
  }

  try {
    const result = await recordEmailProviderEvent({
      eventType,
      payload: event,
      providerEventId: headers["svix-id"],
      providerMessageId: event.data?.email_id?.trim() || null
    });

    return NextResponse.json({ duplicate: result.duplicate, received: true });
  } catch (error) {
    return handleApiError(request, error, "Unable to persist verified Resend webhook event.");
  }
}

export const POST = observeApiHandler(handlePOST, logApiTiming);
