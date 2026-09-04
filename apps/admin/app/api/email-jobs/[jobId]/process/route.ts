import { observeApiHandler } from "@/lib/api-observer";
import { logApiTiming } from "@/lib/timing";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { uuidSchema } from "@algo-attendance/shared";
import { requireApiUser } from "@/lib/auth";
import { processEmailJobBatch } from "@/lib/email-job-processor";
import { handleApiError } from "@/lib/api-response";

function getAppBaseUrl(request: Request) {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    new URL(request.url).origin
  );
}

async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    await requireApiUser(request, { allowedRoles: ["admin"] });
    const { jobId: rawJobId } = await params;
    const jobId = uuidSchema.parse(rawJobId);
    const result = await processEmailJobBatch({
      appBaseUrl: getAppBaseUrl(request),
      jobId,
      workerId: randomUUID()
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(request, error, "Email job processing failed.");
  }
}

export const POST = observeApiHandler(handlePOST, logApiTiming);
