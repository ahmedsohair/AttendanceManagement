import assert from "node:assert/strict";
import test from "node:test";
import { extractApplicationData, parseManifest } from "../rehearse-production-application-backup.mjs";

const names = ["attendance_events", "exam_sessions", "incidents", "room_assignments", "rooms", "student_allocations", "users"];
const block = (schema, table, row = "synthetic") => `COPY "${schema}"."${table}" ("id") FROM stdin;\n${row}\n\\.\n`;
const application = names.map((name) => block("public", name)).join("");

test("accepts the UTF-8 BOM emitted by Windows PowerShell backup manifests", () => {
  assert.deepEqual(parseManifest('\uFEFF{"files":[]}'), { files: [] });
  assert.deepEqual(parseManifest('{"files":[]}'), { files: [] });
});

test("extracts every original application COPY block without managed Auth data", () => {
  const value = extractApplicationData(block("auth", "users", "PRIVATE-AUTH-ROW") + application + block("storage", "objects", "PRIVATE-STORAGE-ROW"));
  assert.equal(value.tables.size, 7);
  for (const table of value.tables.values()) {
    assert.equal(table.rows, 1);
    assert.deepEqual(table.columns, ["id"]);
  }
  assert.deepEqual(value.omitted, [{ schema: "auth", table: "users", rows: 1 }, { schema: "storage", table: "objects", rows: 1 }]);
  assert.doesNotMatch(value.sql, /PRIVATE|"auth"|"storage"/);
});

test("handles Windows line endings and does not treat COPY escaped newlines as rows", () => {
  const value = extractApplicationData(application.replaceAll("synthetic", "synthetic\\nsecond\\tfield").replaceAll("\n", "\r\n"));
  assert([...value.tables.values()].every((table) => table.rows === 1));
});

test("rejects incomplete, duplicated and unexpected application inventories", () => {
  assert.throws(() => extractApplicationData(application + block("public", "users")), /Duplicate/);
  assert.throws(() => extractApplicationData(block("public", "users")), /all seven/);
  assert.throws(() => extractApplicationData(application + block("public", "unexpected")), /Unexpected public/);
  assert.throws(() => extractApplicationData(application + 'COPY "auth"."users" ("id") FROM stdin;\nunfinished'), /Unterminated/);
});

test("rejects nested COPY headers rather than leaking or silently dropping records", () => {
  assert.throws(() => extractApplicationData('COPY "auth"."users" ("id") FROM stdin;\n' + application), /Nested/);
});
