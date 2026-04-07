import { NextResponse } from "next/server";
import { sessionImportPayloadSchema } from "@algo-attendance/shared";
import { requireApiUser } from "@/lib/auth";
import { parseSpreadsheet } from "@/lib/spreadsheet";
import { importExamSession } from "@/lib/repository";

export async function POST(request: Request) {
  try {
    await requireApiUser(request, { allowedRoles: ["admin"] });
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ message: "file is required" }, { status: 400 });
    }

    const payload = sessionImportPayloadSchema.parse({
      name: form.get("name"),
      examDate: form.get("examDate"),
      startTime: form.get("startTime"),
      rows: parseSpreadsheet(Buffer.from(await file.arrayBuffer()))
    });
    const { sessionId } = await importExamSession(payload);
    return NextResponse.json({ sessionId, message: "Import successful." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Import failed." },
      { status: 400 }
    );
  }
}
