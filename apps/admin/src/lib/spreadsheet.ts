import * as XLSX from "xlsx";
import type { SessionImportRow } from "@algo-attendance/shared";

const requiredColumns = ["student_id", "student_name", "room", "zone"] as const;

export function parseSpreadsheet(buffer: Buffer): SessionImportRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.SheetNames[0];

  if (!firstSheet) {
    throw new Error("Spreadsheet does not contain any sheets.");
  }

  const worksheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: ""
  });

  if (!rows.length) {
    throw new Error("Spreadsheet is empty.");
  }

  const normalizedRows = rows.map((row) => {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key.trim().toLowerCase()] = String(value).trim();
    }
    return normalized;
  });

  for (const column of requiredColumns) {
    if (!(column in normalizedRows[0])) {
      throw new Error(`Missing required column: ${column}`);
    }
  }

  return normalizedRows.map((row, index) => {
    for (const column of requiredColumns) {
      if (!row[column]) {
        throw new Error(`Row ${index + 2} is missing ${column}`);
      }
    }

    return {
      student_id: row.student_id,
      student_name: row.student_name,
      room: row.room,
      zone: row.zone,
      course_code: row.course_code || undefined,
      program: row.program || undefined
    };
  });
}

export function buildWorkbookSheets(data: {
  summary: Record<string, string | number>[];
  attendance: Record<string, string | number | boolean>[];
  incidents: Record<string, string | number | boolean | null | undefined>[];
}) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(data.summary),
    "Summary"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(data.attendance),
    "Attendance"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(data.incidents),
    "Incidents"
  );
  return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
}
