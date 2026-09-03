import { NextResponse } from "next/server";
import { uuidSchema } from "@algo-attendance/shared";
import { requireApiUser } from "@/lib/auth";
import { getEmailJob, listEmailDeliveries } from "@/lib/email-delivery-repository";

export async function GET(
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
      return NextResponse.json({ message: "Email job not found." }, { status: 404 });
    }

    return NextResponse.json({ deliveries, job });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to read email job." },
      { status: 400 }
    );
  }
}
