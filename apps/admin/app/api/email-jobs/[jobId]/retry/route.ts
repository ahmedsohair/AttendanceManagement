import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { retryFailedEmailDeliveries } from "@/lib/email-delivery-repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    await requireApiUser(request, { allowedRoles: ["admin"] });
    const { jobId } = await params;
    const body = (await request.json()) as { deliveryIds?: unknown };
    const deliveryIds = Array.isArray(body.deliveryIds)
      ? body.deliveryIds.filter((value): value is string => typeof value === "string")
      : [];

    if (!deliveryIds.length || deliveryIds.length > 100) {
      return NextResponse.json(
        { message: "Select between 1 and 100 failed recipients to retry." },
        { status: 400 }
      );
    }

    const result = await retryFailedEmailDeliveries({ deliveryIds, jobId });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to retry emails." },
      { status: 400 }
    );
  }
}
