import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { resetInvigilatorAccessCode } from "@/lib/repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireApiUser(request, { allowedRoles: ["admin"] });
    const { id } = await params;
    const result = await resetInvigilatorAccessCode(id);
    return NextResponse.json({
      accessCode: result.accessCode,
      message: "New access code generated."
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to generate access code." },
      { status: 400 }
    );
  }
}
