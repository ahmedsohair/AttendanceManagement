import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { validateAndMergeImportFiles } from "@algo-attendance/shared";
import { parseSpreadsheetWithRowNumbers } from "../src/lib/spreadsheet.ts";

async function workbookBuffer(rows: Array<Array<string | number>>) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Allocations");
  rows.forEach((row) => worksheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test("parses header aliases and ignores completely blank rows", async () => {
  const buffer = await workbookBuffer([
    ["Student Number", "Name", "Location", "Zone", "Course"],
    ["S4181947", "Student One", "08.02.007", "A", "COSC2123"],
    ["", "", "", "", ""],
    [4181948, "Student Two", "08.02.008", "B", "COSC2123"]
  ]);

  const rows = await parseSpreadsheetWithRowNumbers(buffer);
  assert.deepEqual(rows, [
    {
      rowNumber: 2,
      row: {
        course_code: "COSC2123",
        program: undefined,
        room: "08.02.007",
        student_id: "4181947",
        student_name: "Student One",
        zone: "A"
      }
    },
    {
      rowNumber: 4,
      row: {
        course_code: "COSC2123",
        program: undefined,
        room: "08.02.008",
        student_id: "4181948",
        student_name: "Student Two",
        zone: "B"
      }
    }
  ]);
});

test("reports duplicate students with both workbook row numbers", async () => {
  const buffer = await workbookBuffer([
    ["Student ID", "Room", "Zone"],
    ["1234567", "A", "1"],
    ["1234567", "B", "2"]
  ]);
  const rows = await parseSpreadsheetWithRowNumbers(buffer);

  assert.throws(
    () => validateAndMergeImportFiles([{ checksum: "one", fileName: "room.xlsx", rows }]),
    /room\.xlsx, row 2.*room\.xlsx, row 3/i
  );
});

test("rejects missing columns, malformed files, protected files, and excessive rows", async () => {
  const missingColumn = await workbookBuffer([
    ["Student ID", "Room"],
    ["1234567", "A"]
  ]);
  await assert.rejects(parseSpreadsheetWithRowNumbers(missingColumn), /Missing required column: zone/);
  await assert.rejects(parseSpreadsheetWithRowNumbers(Buffer.from("not a workbook")), /empty/i);
  await assert.rejects(
    parseSpreadsheetWithRowNumbers(Buffer.from("d0cf11e0a1b11ae1", "hex")),
    /encrypted, protected, or saved in legacy Excel format/i
  );

  const rows: Array<Array<string | number>> = [["Student ID", "Room", "Zone"]];
  for (let index = 0; index < 2501; index += 1) rows.push([9000000 + index, "A", "1"]);
  await assert.rejects(
    parseSpreadsheetWithRowNumbers(await workbookBuffer(rows)),
    /Maximum allowed is 2500/
  );
});
