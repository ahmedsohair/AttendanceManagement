import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { publishExamSession } from "@/lib/repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await requireApiUser(request, { allowedRoles: ["admin"] });
    await publishExamSession(id);
    return new NextResponse(null, {
      status: 303,
      headers: {
        Location: "/"
      }
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to publish session.";
    const status = message === "Session not found." ? 404 : 400;
    return NextResponse.json({ message }, { status });
  }
}
