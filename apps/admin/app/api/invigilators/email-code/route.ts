import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { sendInvigilatorAccessCodeEmail } from "@/lib/invigilator-instruction-email";

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
    };
    const accessCode = String(body.accessCode || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const fullName = String(body.fullName || "").trim();

    if (!accessCode || !email) {
      return NextResponse.json(
        { message: "Access code and email are required." },
        { status: 400 }
      );
    }

    await sendInvigilatorAccessCodeEmail({
      accessCode,
      appBaseUrl: getAppBaseUrl(request),
      email,
      fullName
    });

    return NextResponse.json({ message: "Access code emailed." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to email access code." },
      { status: 400 }
    );
  }
}
