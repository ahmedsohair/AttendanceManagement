import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { idempotencyKeySchema, uuidSchema } from "@algo-attendance/shared";
import { requireApiUser } from "@/lib/auth";
import { createAssignmentEmailJob } from "@/lib/email-delivery-repository";
import { sendInvigilatorInstructionEmail } from "@/lib/invigilator-instruction-email";
import { isSupabaseConfigured } from "@/lib/supabase";
import { readStore } from "@/lib/store";
import { API_ERROR_CODES, getApiErrorCode, getApiErrorStatus, getRequestId } from "@/lib/api-errors";
import { apiErrorResponse, handleApiError } from "@/lib/api-response";
import { buildApiTelemetry } from "@/lib/telemetry";
import { logApiTiming } from "@/lib/timing";

const assignmentTemplateVersion = "assignment-v2";

function getAppBaseUrl(request: Request) {
  const configured = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL;
  if (configured) {
    return configured;
  }

  return new URL(request.url).origin;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = performance.now();
  let status = 200;
  let code = "OK";
  try {
    const admin = await requireApiUser(request, { allowedRoles: ["admin"] });
    const { id: rawId } = await params;
    const id = uuidSchema.parse(rawId);

    if (isSupabaseConfigured()) {
      const suppliedIdempotencyKey = request.headers.get("idempotency-key");
      const idempotencyKey = suppliedIdempotencyKey
        ? idempotencyKeySchema.parse(suppliedIdempotencyKey)
        : randomUUID();

      const job = await createAssignmentEmailJob({
        examSessionId: id,
        idempotencyKey,
        requestedBy: admin.id,
        templateVersion: assignmentTemplateVersion
      });

      status = 202;
      return NextResponse.json(
        {
          job,
          message: job.created
            ? `${job.totalCount} invigilator email(s) queued.`
            : "This email request is already queued."
        },
        { status }
      );
    }

    const store = await readStore();
    const session = store.examSessions.find((item) => item.id === id);

    if (!session) {
      status = 404;
      code = API_ERROR_CODES.notFound;
      return apiErrorResponse(request, API_ERROR_CODES.notFound, "Exam session not found.", { status: 404 });
    }

    const sessionRooms = store.rooms.filter((room) => room.examSessionId === id);
    const assignedInvigilators = store.users
      .filter((user) => user.role === "invigilator")
      .map((user) => ({
        user,
        rooms: sessionRooms.filter((room) => user.assignedRoomIds.includes(room.id))
      }))
      .filter((item) => item.rooms.length);

    if (!assignedInvigilators.length) {
      status = 422;
      code = API_ERROR_CODES.validationError;
      return apiErrorResponse(request, API_ERROR_CODES.validationError, "No assigned invigilators were found for this exam.", { status: 422 });
    }

    const appBaseUrl = getAppBaseUrl(request);
    const failures: string[] = [];
    let sent = 0;

    for (const item of assignedInvigilators) {
      try {
        await sendInvigilatorInstructionEmail({
          appBaseUrl,
          invigilator: item.user,
          rooms: item.rooms,
          session
        });
        sent += 1;
      } catch {
        failures.push(item.user.email);
        console.error(JSON.stringify(buildApiTelemetry({
          event: "api.error",
          requestId: getRequestId(request),
          url: request.url,
          method: request.method,
          status: 503,
          code: API_ERROR_CODES.serviceUnavailable,
          region: process.env.VERCEL_REGION
        })));
      }
    }

    if (failures.length) {
      status = sent ? 207 : 503;
      code = API_ERROR_CODES.serviceUnavailable;
      return NextResponse.json(
        {
          message: `Sent ${sent} email(s). ${failures.length} failed.`,
          failures,
          sent
        },
        { status }
      );
    }

    return NextResponse.json({
      message: `Sent ${sent} invigilator email(s).`,
      sent
    });
  } catch (error) {
    status = getApiErrorStatus(error);
    code = getApiErrorCode(error);
    return handleApiError(request, error, "Instruction email request failed.");
  } finally {
    logApiTiming(request, startedAt, status, code);
  }
}
