import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { getEmailJob } from "@/lib/email-delivery-repository";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    await requireApiUser(request, { allowedRoles: ["admin"] });
    const { jobId } = await params;
    const job = await getEmailJob(jobId);

    if (!job) {
      return NextResponse.json({ message: "Email job not found." }, { status: 404 });
    }

    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to read email job." },
      { status: 400 }
    );
  }
}
