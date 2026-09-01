import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import {
  activateInvigilatorAccessCode,
  stageInvigilatorAccessCode
} from "@/lib/repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireApiUser(request, { allowedRoles: ["admin"] });
    const { id } = await params;
    const result = await stageInvigilatorAccessCode(id);
    return NextResponse.json({
      accessCode: result.accessCode,
      message: "New code generated. Activate it when you are ready to replace the current code.",
      status: result.status
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to generate access code." },
      { status: 400 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireApiUser(request, { allowedRoles: ["admin"] });
    const { id } = await params;
    const body = (await request.json()) as { accessCode?: string };
    const result = await activateInvigilatorAccessCode(
      id,
      String(body.accessCode || "")
    );

    return NextResponse.json({
      message: "New access code activated. Existing signed-in scanner sessions remain active.",
      status: result.status
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to activate access code." },
      { status: 400 }
    );
  }
}
