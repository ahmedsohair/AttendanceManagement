import { observeApiHandler } from "@/lib/api-observer";
import { logApiTiming } from "@/lib/timing";
import { NextResponse } from "next/server";
import { uuidSchema } from "@algo-attendance/shared";
import { requireApiUser } from "@/lib/auth";
import { getEmailJob, listEmailDeliveries } from "@/lib/email-delivery-repository";
import { API_ERROR_CODES } from "@/lib/api-errors";
import { apiErrorResponse, handleApiError } from "@/lib/api-response";

async function handleGET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    await requireApiUser(request, { allowedRoles: ["admin"] });
    const { jobId: rawJobId } = await params;
    const jobId = uuidSchema.parse(rawJobId);
    const [job, deliveries] = await Promise.all([
      getEmailJob(jobId),
      listEmailDeliveries(jobId)
    ]);

    if (!job) {
      return apiErrorResponse(request, API_ERROR_CODES.notFound, "Email job not found.", { status: 404 });
    }

    return NextResponse.json({ deliveries, job });
  } catch (error) {
    return handleApiError(request, error, "Email job read failed.");
  }
}

export const GET = observeApiHandler(handleGET, logApiTiming);
