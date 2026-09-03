import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { normalizeStudentId, type SessionImportRow } from "@algo-attendance/shared";

const requiredColumns = ["student_id", "room", "zone"] as const;
const maxImportRows = 2500;
const maxCellLength = 200;
const oleCompoundDocumentSignature = "d0cf11e0a1b11ae1";

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
  if (buffer.subarray(0, 8).toString("hex") === oleCompoundDocumentSignature) {
    throw new Error(
      "This file is encrypted, protected, or saved in legacy Excel format. Open it in Excel and save/export it as a standard unprotected .xlsx file, then upload again."
    );
  }

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

function normalizeHeader(value: string) {
  const compact = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const aliases: Record<string, keyof SessionImportRow> = {
    studentid: "student_id",
    studentnumber: "student_id",
    studentno: "student_id",
    studentname: "student_name",
    name: "student_name",
    room: "room",
    roomcode: "room",
    location: "room",
    venue: "room",
    zone: "zone",
    coursecode: "course_code",
    course: "course_code",
    program: "program"
  };

  return aliases[compact] || value.trim().toLowerCase();
}

export type ParsedSpreadsheetRow = {
  row: SessionImportRow;
  rowNumber: number;
};

export async function parseSpreadsheetWithRowNumbers(
  buffer: Buffer
): Promise<ParsedSpreadsheetRow[]> {
  const workbook = await readWorkbook(buffer);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error("Spreadsheet does not contain any sheets.");
  }

  const headerRow = worksheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, columnNumber) => {
    headers[columnNumber - 1] = normalizeHeader(cellToString(cell));
  });

  const rows: Array<{ values: Record<string, unknown>; rowNumber: number }> = [];
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
    rows.push({ values: item, rowNumber });
  });

  if (!rows.length) {
    throw new Error("Spreadsheet is empty.");
  }

  if (rows.length > maxImportRows) {
    throw new Error(`Spreadsheet has too many rows. Maximum allowed is ${maxImportRows}.`);
  }

  const normalizedRows = rows.map(({ values, rowNumber }) => {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      const normalizedValue = String(value).trim();
      if (normalizedValue.length > maxCellLength) {
        throw new Error(`Row ${rowNumber} has a cell longer than ${maxCellLength} characters.`);
      }
      normalized[key.trim().toLowerCase()] = normalizedValue;
    }
    return { rowNumber, values: normalized };
  });

  for (const column of requiredColumns) {
    if (!(column in normalizedRows[0].values)) {
      throw new Error(`Missing required column: ${column}`);
    }
  }

  return normalizedRows.map(({ values: row, rowNumber }) => {
    for (const column of requiredColumns) {
      if (!row[column]) {
        throw new Error(`Row ${rowNumber} is missing ${column}`);
      }
    }

    return {
      row: {
        student_id: normalizeStudentId(row.student_id),
        student_name: row.student_name || normalizeStudentId(row.student_id),
        room: row.room,
        zone: row.zone,
        course_code: row.course_code || undefined,
        program: row.program || undefined
      },
      rowNumber
    };
  });
}

export async function parseSpreadsheet(buffer: Buffer): Promise<SessionImportRow[]> {
  return (await parseSpreadsheetWithRowNumbers(buffer)).map((item) => item.row);
}

export async function buildWorkbookSheets(data: {
  [sheetName: string]: Record<string, string | number | boolean | null | undefined>[];
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
