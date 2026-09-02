import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { processEmailJobBatch } from "@/lib/email-job-processor";

function getAppBaseUrl(request: Request) {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    new URL(request.url).origin
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    await requireApiUser(request, { allowedRoles: ["admin"] });
    const { jobId } = await params;
    const result = await processEmailJobBatch({
      appBaseUrl: getAppBaseUrl(request),
      jobId,
      workerId: randomUUID()
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to process email job." },
      { status: 400 }
    );
  }
}
