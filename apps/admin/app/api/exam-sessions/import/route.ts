import { observeApiHandler } from "@/lib/api-observer";
import { logApiTiming } from "@/lib/timing";
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
import { API_ERROR_CODES, ApiRequestError } from "@/lib/api-errors";
import { apiErrorResponse, handleApiError } from "@/lib/api-response";

const maxSpreadsheetBytes = 2 * 1024 * 1024;
const maxSpreadsheetFiles = 10;

async function handlePOST(request: Request) {
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
      return apiErrorResponse(request, API_ERROR_CODES.validationError, "At least one spreadsheet is required.", { status: 422 });
    }

    if (files.length > maxSpreadsheetFiles) {
      return apiErrorResponse(request, API_ERROR_CODES.validationError, `Upload ${maxSpreadsheetFiles} spreadsheets or fewer.`, { status: 422 });
    }

    const parsedFiles: ImportFileWithRows[] = [];
    for (const [fileIndex, file] of files.entries()) {
      if (file.size > maxSpreadsheetBytes) {
        return apiErrorResponse(request, API_ERROR_CODES.payloadTooLarge, `${file.name || "Spreadsheet"} must be 2 MB or smaller.`, { status: 413 });
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
        return apiErrorResponse(request, API_ERROR_CODES.validationError, `${file.name || "Spreadsheet"}: ${message}`, { status: 422 });
      }
    }

    let rows;
    try {
      rows = validateAndMergeImportFiles(parsedFiles);
    } catch (error) {
      throw new ApiRequestError(
        error instanceof Error ? error.message : "Spreadsheet validation failed.",
        422
      );
    }

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
    return handleApiError(request, error, "Exam spreadsheet import failed.");
  }
}

export const POST = observeApiHandler(handlePOST, logApiTiming);
