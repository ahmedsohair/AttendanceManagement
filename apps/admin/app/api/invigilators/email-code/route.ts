import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { sendInvigilatorAccessCodeEmail } from "@/lib/invigilator-instruction-email";
import { recordInvigilatorAccessCodeEmailed } from "@/lib/repository";

function getAppBaseUrl(request: Request) {
  return (
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_BASE_URL ||
    new URL(request.url).origin
  );
}

export async function POST(request: Request) {
  try {
    await requireApiUser(request, { allowedRoles: ["admin"] });
    const body = (await request.json()) as {
      accessCode?: string;
      email?: string;
      fullName?: string;
      userId?: string;
    };
    const accessCode = String(body.accessCode || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const fullName = String(body.fullName || "").trim();
    const userId = String(body.userId || "").trim();

    if (!accessCode || !email || !userId) {
      return NextResponse.json(
        { message: "Invigilator, access code, and email are required." },
        { status: 400 }
      );
    }

    await sendInvigilatorAccessCodeEmail({
      accessCode,
      appBaseUrl: getAppBaseUrl(request),
      email,
      fullName
    });
    await recordInvigilatorAccessCodeEmailed(userId, accessCode);

    return NextResponse.json({ message: "Access code emailed." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to email access code." },
      { status: 400 }
    );
  }
}
