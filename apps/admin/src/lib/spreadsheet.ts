import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import type { SessionImportRow } from "@algo-attendance/shared";

const requiredColumns = ["student_id", "student_name", "room", "zone"] as const;
const maxImportRows = 2500;
const maxCellLength = 200;

function cellToString(cell: ExcelJS.Cell) {
  if (cell.text) {
    return cell.text.trim();
  }

  const value = cell.value;
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object" && "result" in value) {
    return String(value.result ?? "").trim();
  }

  return String(value).trim();
}

async function readWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;
    await workbook.xlsx.load(arrayBuffer);
  } catch {
    await workbook.csv.read(Readable.from(buffer));
  }
  return workbook;
}

function safeExportValue(value: string | number | boolean | null | undefined) {
  if (typeof value !== "string") {
    return value ?? "";
  }

  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export async function parseSpreadsheet(buffer: Buffer): Promise<SessionImportRow[]> {
  const workbook = await readWorkbook(buffer);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error("Spreadsheet does not contain any sheets.");
  }

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, columnNumber) => {
    headers[columnNumber - 1] = cellToString(cell).toLowerCase();
  });

  const rows: Record<string, unknown>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const item: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      if (header) {
        item[header] = cellToString(row.getCell(index + 1));
      }
    });
    rows.push(item);
  });

  if (!rows.length) {
    throw new Error("Spreadsheet is empty.");
  }

  if (rows.length > maxImportRows) {
    throw new Error(`Spreadsheet has too many rows. Maximum allowed is ${maxImportRows}.`);
  }

  const normalizedRows = rows.map((row, index) => {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      const normalizedValue = String(value).trim();
      if (normalizedValue.length > maxCellLength) {
        throw new Error(`Row ${index + 2} has a cell longer than ${maxCellLength} characters.`);
      }
      normalized[key.trim().toLowerCase()] = normalizedValue;
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

export async function buildWorkbookSheets(data: {
  summary: Record<string, string | number>[];
  attendance: Record<string, string | number | boolean>[];
  incidents: Record<string, string | number | boolean | null | undefined>[];
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  for (const [sheetName, rows] of Object.entries(data)) {
    const worksheet = workbook.addWorksheet(
      sheetName.charAt(0).toUpperCase() + sheetName.slice(1)
    );
    const headers = Array.from(
      rows.reduce((keys, row) => {
        Object.keys(row).forEach((key) => keys.add(key));
        return keys;
      }, new Set<string>())
    );

    worksheet.columns = headers.map((header) => ({
      header,
      key: header,
      width: Math.max(14, header.length + 2)
    }));

    for (const row of rows) {
      worksheet.addRow(
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [key, safeExportValue(value)])
        )
      );
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
