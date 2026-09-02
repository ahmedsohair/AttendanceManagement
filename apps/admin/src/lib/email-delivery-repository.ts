import "server-only";

import { getSupabaseAdmin } from "./supabase";

export type EmailDeliveryStatus =
  | "queued"
  | "sending"
  | "accepted"
  | "delivered"
  | "bounced"
  | "complained"
  | "failed"
  | "unknown";

export type EmailJobStatus = "queued" | "processing" | "completed" | "partial" | "failed";

export type EmailJobSummary = {
  acceptedCount: number;
  completedAt: string | null;
  created: boolean;
  failedCount: number;
  jobId: string;
  processedCount: number;
  status: EmailJobStatus;
  totalCount: number;
};

export type EmailDeliverySummary = {
  acceptedAt: string | null;
  attemptCount: number;
  deliveredAt: string | null;
  failureReason: string | null;
  id: string;
  provider: "resend" | "smtp" | null;
  recipientEmail: string;
  requestedAt: string;
  status: EmailDeliveryStatus;
};

export type ClaimedEmailDelivery = {
  attemptCount: number;
  examSessionId: string | null;
  id: string;
  jobId: string;
  recipientEmail: string;
  templateType: "assignment" | "access_code";
  templateData: unknown;
  templateVersion: string;
  userId: string | null;
};

type EmailJobRow = {
  accepted_count: number;
  completed_at: string | null;
  created_at: string;
  failed_count: number;
  id: string;
  processed_count: number;
  status: EmailJobStatus;
  total_count: number;
};

type EmailDeliveryRow = {
  accepted_at?: string | null;
  attempt_count: number;
  delivered_at?: string | null;
  exam_session_id: string | null;
  id: string;
  job_id: string;
  failure_reason?: string | null;
  provider?: "resend" | "smtp" | null;
  recipient_email: string;
  requested_at?: string;
  status?: EmailDeliveryStatus;
  template_type: "assignment" | "access_code";
  template_data: unknown;
  template_version: string;
  user_id: string | null;
};

function mapJob(row: EmailJobRow, created = false): EmailJobSummary {
  return {
    acceptedCount: row.accepted_count,
    completedAt: row.completed_at,
    created,
    failedCount: row.failed_count,
    jobId: row.id,
    processedCount: row.processed_count,
    status: row.status,
    totalCount: row.total_count
  };
}

function mapDeliverySummary(row: EmailDeliveryRow): EmailDeliverySummary {
  return {
    acceptedAt: row.accepted_at || null,
    attemptCount: row.attempt_count,
    deliveredAt: row.delivered_at || null,
    failureReason: row.failure_reason || null,
    id: row.id,
    provider: row.provider || null,
    recipientEmail: row.recipient_email,
    requestedAt: row.requested_at || "",
    status: row.status || "unknown"
  };
}

function mapDelivery(row: EmailDeliveryRow): ClaimedEmailDelivery {
  return {
    attemptCount: row.attempt_count,
    examSessionId: row.exam_session_id,
    id: row.id,
    jobId: row.job_id,
    recipientEmail: row.recipient_email,
    templateType: row.template_type,
    templateData: row.template_data,
    templateVersion: row.template_version,
    userId: row.user_id
  };
}

export async function createAssignmentEmailJob(input: {
  examSessionId: string;
  idempotencyKey: string;
  requestedBy: string;
  templateVersion: string;
}) {
  const response = await getSupabaseAdmin().rpc("create_assignment_email_job", {
    p_exam_session_id: input.examSessionId,
    p_idempotency_key: input.idempotencyKey,
    p_requested_by: input.requestedBy,
    p_template_version: input.templateVersion
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  const result = response.data as {
    acceptedCount: number;
    created: boolean;
    failedCount: number;
    jobId: string;
    processedCount: number;
    status: EmailJobStatus;
    totalCount: number;
  };

  return { ...result, completedAt: null } satisfies EmailJobSummary;
}

export async function createAccessCodeEmailJob(input: {
  idempotencyKey: string;
  requestedBy: string;
  templateVersion: string;
  userId: string;
}) {
  const response = await getSupabaseAdmin().rpc("create_access_code_email_job", {
    p_idempotency_key: input.idempotencyKey,
    p_requested_by: input.requestedBy,
    p_template_version: input.templateVersion,
    p_user_id: input.userId
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  const result = response.data as {
    acceptedCount: number;
    created: boolean;
    failedCount: number;
    jobId: string;
    processedCount: number;
    status: EmailJobStatus;
    totalCount: number;
  };

  return { ...result, completedAt: null } satisfies EmailJobSummary;
}

export async function getEmailJob(jobId: string) {
  const response = await getSupabaseAdmin()
    .from("email_jobs")
    .select(
      "id, status, total_count, processed_count, accepted_count, failed_count, created_at, completed_at"
    )
    .eq("id", jobId)
    .maybeSingle();

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data ? mapJob(response.data as EmailJobRow) : null;
}

export async function listEmailDeliveries(jobId: string) {
  const response = await getSupabaseAdmin()
    .from("email_deliveries")
    .select(
      "id, job_id, recipient_email, status, provider, attempt_count, failure_reason, requested_at, accepted_at, delivered_at, exam_session_id, user_id, template_type, template_version, template_data"
    )
    .eq("job_id", jobId)
    .order("recipient_email");

  if (response.error) {
    throw new Error(response.error.message);
  }

  return ((response.data || []) as EmailDeliveryRow[]).map(mapDeliverySummary);
}

export async function retryFailedEmailDeliveries(input: {
  deliveryIds: string[];
  jobId: string;
}) {
  const response = await getSupabaseAdmin().rpc("retry_failed_email_deliveries", {
    p_delivery_ids: input.deliveryIds,
    p_job_id: input.jobId
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data as {
    jobId: string;
    retriedCount: number;
    status: EmailJobStatus;
  };
}

export async function claimEmailDeliveries(input: {
  jobId: string;
  leaseSeconds?: number;
  limit?: number;
  workerId: string;
}) {
  const response = await getSupabaseAdmin().rpc("claim_email_deliveries", {
    p_job_id: input.jobId,
    p_lease_seconds: input.leaseSeconds || 60,
    p_limit: input.limit || 5,
    p_worker_id: input.workerId
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return ((response.data || []) as EmailDeliveryRow[]).map(mapDelivery);
}

export async function completeEmailDeliveryAttempt(input: {
  deliveryId: string;
  failureReason?: string;
  provider?: "resend" | "smtp";
  providerMessageId?: string | null;
  retryAfterSeconds?: number;
  status: "accepted" | "failed";
  workerId: string;
}) {
  const response = await getSupabaseAdmin().rpc("complete_email_delivery_attempt", {
    p_delivery_id: input.deliveryId,
    p_failure_reason: input.failureReason || null,
    p_provider: input.provider || null,
    p_provider_message_id: input.providerMessageId || null,
    p_retry_after_seconds: input.retryAfterSeconds || null,
    p_status: input.status,
    p_worker_id: input.workerId
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data as {
    deliveryId: string;
    deliveryStatus: EmailDeliveryStatus;
    jobId: string;
    jobStatus: EmailJobStatus;
  };
}

export async function recordEmailProviderEvent(input: {
  eventType: string;
  payload: unknown;
  providerEventId: string;
  providerMessageId: string | null;
}) {
  const response = await getSupabaseAdmin().rpc("record_email_provider_event", {
    p_event_type: input.eventType,
    p_payload: input.payload,
    p_provider: "resend",
    p_provider_event_id: input.providerEventId,
    p_provider_message_id: input.providerMessageId
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data as {
    deliveryStatus?: EmailDeliveryStatus;
    duplicate: boolean;
    eventId: string;
    matched?: boolean;
  };
}
