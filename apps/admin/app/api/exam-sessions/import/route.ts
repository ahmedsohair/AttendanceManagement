import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import {
  sessionImportPayloadSchema,
  validateAndMergeImportFiles,
  type ImportFileWithRows
} from "@algo-attendance/shared";
import { requireApiUser } from "@/lib/auth";
import { parseSpreadsheetWithRowNumbers } from "@/lib/spreadsheet";
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

    const parsedFiles: ImportFileWithRows[] = [];
    for (const [fileIndex, file] of files.entries()) {
      if (file.size > maxSpreadsheetBytes) {
        return NextResponse.json(
          { message: `${file.name || "Spreadsheet"} must be 2 MB or smaller.` },
          { status: 400 }
        );
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const fileName = `${(file.name || "Spreadsheet").replace(/[\u0000-\u001f\u007f]/g, "_")} (file ${fileIndex + 1})`;
        parsedFiles.push({
          checksum: createHash("sha256").update(buffer).digest("hex"),
          fileName,
          rows: await parseSpreadsheetWithRowNumbers(buffer)
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not read spreadsheet.";
        return NextResponse.json(
          { message: `${file.name || "Spreadsheet"}: ${message}` },
          { status: 400 }
        );
      }
    }

    const rows = validateAndMergeImportFiles(parsedFiles);

    const payload = sessionImportPayloadSchema.parse({
      name: form.get("name"),
      examDate: form.get("examDate"),
      startTime: form.get("startTime"),
      rows
    });
    const { sessionId, stats } = await importExamSession(payload);
    return NextResponse.json({
      sessionId,
      message: "Import successful.",
      stats: {
        files: files.length,
        students: stats.students,
        rooms: stats.rooms,
        checksum: stats.checksum
      }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Import failed." },
      { status: 400 }
    );
  }
}
