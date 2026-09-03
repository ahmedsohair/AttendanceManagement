import { NextResponse } from "next/server";
import {
  retryEmailDeliveriesRequestSchema,
  uuidSchema
} from "@algo-attendance/shared";
import { requireApiUser } from "@/lib/auth";
import { retryFailedEmailDeliveries } from "@/lib/email-delivery-repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    await requireApiUser(request, { allowedRoles: ["admin"] });
    const { jobId: rawJobId } = await params;
    const jobId = uuidSchema.parse(rawJobId);
    const { deliveryIds } = retryEmailDeliveriesRequestSchema.parse(await request.json());

    const result = await retryFailedEmailDeliveries({ deliveryIds, jobId });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to retry emails." },
      { status: 400 }
    );
  }
}
