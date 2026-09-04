import { observeApiHandler } from "@/lib/api-observer";
import { logApiTiming } from "@/lib/timing";
import { NextResponse } from "next/server";
import { activateAccessCodeRequestSchema, uuidSchema } from "@algo-attendance/shared";
import { requireApiUser } from "@/lib/auth";
import {
  activateInvigilatorAccessCode,
  stageInvigilatorAccessCode
} from "@/lib/repository";
import { handleApiError } from "@/lib/api-response";

async function handlePOST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireApiUser(request, { allowedRoles: ["admin"] });
    const { id: rawId } = await params;
    const id = uuidSchema.parse(rawId);
    const result = await stageInvigilatorAccessCode(id, admin.id);
    return NextResponse.json({
      accessCode: result.accessCode,
      message: "New code generated. Activate it when you are ready to replace the current code.",
      status: result.status
    });
  } catch (error) {
    return handleApiError(request, error, "Access-code generation failed.");
  }
}

async function handlePUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireApiUser(request, { allowedRoles: ["admin"] });
    const { id: rawId } = await params;
    const id = uuidSchema.parse(rawId);
    const body = activateAccessCodeRequestSchema.parse(await request.json());
    const result = await activateInvigilatorAccessCode(
      id,
      body.accessCode,
      admin.id
    );

    return NextResponse.json({
      message: "New access code activated. Existing signed-in scanner sessions remain active.",
      status: result.status
    });
  } catch (error) {
    return handleApiError(request, error, "Access-code activation failed.");
  }
}

export const POST = observeApiHandler(handlePOST, logApiTiming);
export const PUT = observeApiHandler(handlePUT, logApiTiming);
