import { NextResponse } from "next/server";
import { sessionImportPayloadSchema } from "@algo-attendance/shared";
import { requireApiUser } from "@/lib/auth";
import { parseSpreadsheet } from "@/lib/spreadsheet";
import { importExamSession } from "@/lib/repository";

const maxSpreadsheetBytes = 2 * 1024 * 1024;
const maxSpreadsheetFiles = 10;

export async function POST(request: Request) {
  try {
    await requireApiUser(request, { allowedRoles: ["admin"] });
    const form = await request.formData();
    const files = form
      .getAll("files")
      .filter((item): item is File => item instanceof File && item.size > 0);
    const legacyFile = form.get("file");
    if (legacyFile instanceof File && legacyFile.size > 0) {
      files.push(legacyFile);
    }

    if (!files.length) {
      return NextResponse.json({ message: "At least one spreadsheet is required." }, { status: 400 });
    }

    if (files.length > maxSpreadsheetFiles) {
      return NextResponse.json(
        { message: `Upload ${maxSpreadsheetFiles} spreadsheets or fewer.` },
        { status: 400 }
      );
    }

    const rows = [];
    for (const file of files) {
      if (file.size > maxSpreadsheetBytes) {
        return NextResponse.json(
          { message: `${file.name || "Spreadsheet"} must be 2 MB or smaller.` },
          { status: 400 }
        );
      }

      try {
        rows.push(...(await parseSpreadsheet(Buffer.from(await file.arrayBuffer()))));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not read spreadsheet.";
        return NextResponse.json(
          { message: `${file.name || "Spreadsheet"}: ${message}` },
          { status: 400 }
        );
      }
    }

    const payload = sessionImportPayloadSchema.parse({
      name: form.get("name"),
      examDate: form.get("examDate"),
      startTime: form.get("startTime"),
      rows
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
