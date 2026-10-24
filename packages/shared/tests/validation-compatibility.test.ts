import assert from "node:assert/strict";
import test from "node:test";
import * as schemas from "../src/schemas.ts";

const id = "123e4567-e89b-42d3-a456-426614174000";
const roomId = "123e4567-e89b-42d3-a456-426614174001";
const row = { student_id: "1234567", student_name: "Student One", room: "ROOM A", zone: "A" };
const exam = { name: "Test Exam", examDate: "2026-11-03", startTime: "09:30", rows: [row] };
const mark = { requestId: id, examSessionId: id, roomId, studentId: "1234567", source: "manual" as const,
  userId: id, deviceId: "test-device", action: "mark_present" as const };

test("patched validation preserves identifier and email formats accepted before the upgrade", () => {
  for (const value of [id, id.toUpperCase(), "00000000-0000-0000-0000-000000000000", "ffffffff-ffff-ffff-ffff-ffffffffffff"]) {
    assert.equal(schemas.uuidSchema.parse(value), value);
  }
  for (const value of ["not-a-uuid", ` ${id}`, id.replaceAll("-", "")]) {
    assert.equal(schemas.uuidSchema.safeParse(value).success, false);
  }
  for (const value of ["staff+exam@example.edu.au", "o'connor@example.test", "A_B@example.test"]) {
    assert.equal(schemas.emailAddressSchema.parse(` ${value} `), value.toLowerCase());
  }
  for (const value of [".name@example.test", "name..last@example.test", "name@example", "Name <name@example.test>",
    "name@example.test\n", "name@example.test,other@example.test", "name@-example.test", "user@host_name.example"]) {
    assert.equal(schemas.emailAddressSchema.safeParse(value).success, false, value);
  }
});

test("all request schemas preserve normalization, defaults and strict object boundaries", () => {
  const fixtures = [
    { schema: schemas.sessionImportRowSchema, input: { ...row, room: " room   a " }, expected: row },
    { schema: schemas.sessionImportPayloadSchema, input: { ...exam, name: " Test Exam " }, expected: exam },
    { schema: schemas.lookupRequestSchema, input: { examSessionId: id, roomId, studentId: " 1234567 " }, expected: { examSessionId: id, roomId, studentId: "1234567" } },
    { schema: schemas.markAttendanceRequestSchema, input: mark, expected: mark },
    { schema: schemas.roomAssignmentRequestSchema, input: { expectedRoomAssignments: [], roomAssignments: [{ roomId, invigilatorIds: [id] }] }, expected: { expectedRoomAssignments: [], roomAssignments: [{ roomId, invigilatorIds: [id] }] } },
    { schema: schemas.createInvigilatorRequestSchema, input: { email: " Staff@Example.TEST " }, expected: { email: "staff@example.test", fullName: "", assignedRoomIds: [] } },
    { schema: schemas.updateInvigilatorRequestSchema, input: { userId: id, email: " Staff@Example.TEST ", fullName: " Staff " }, expected: { userId: id, email: "staff@example.test", fullName: "Staff" } },
    { schema: schemas.emailAccessCodeRequestSchema, input: { userId: id, email: " Staff@Example.TEST ", accessCode: " ams-abcd-2345 " }, expected: { userId: id, email: "staff@example.test", accessCode: "AMS-ABCD-2345", fullName: "" } },
    { schema: schemas.activateAccessCodeRequestSchema, input: { accessCode: " ams-abcd-2345 " }, expected: { accessCode: "AMS-ABCD-2345" } },
    { schema: schemas.retryEmailDeliveriesRequestSchema, input: { deliveryIds: [id] }, expected: { deliveryIds: [id] } },
    { schema: schemas.adminLoginRequestSchema, input: { email: " Staff@Example.TEST ", password: " keep spaces " }, expected: { email: "staff@example.test", password: " keep spaces " } },
    { schema: schemas.fallbackLoginRequestSchema, input: { email: " Staff@Example.TEST " }, expected: { email: "staff@example.test" } },
    { schema: schemas.accessCodeLoginRequestSchema, input: { accessCode: " AMS-ABCD-2345 " }, expected: { accessCode: "AMS-ABCD-2345" } }
  ];
  for (const { schema, input, expected } of fixtures) {
    assert.deepEqual(schema.parse(input), expected);
    assert.equal(schema.safeParse({ ...input, unexpected: true }).success, false);
  }
  assert.equal(schemas.roomAssignmentRequestSchema.safeParse({ roomAssignments: [{ roomId, invigilatorIds: [id], unexpected: true }] }).success, false);
  assert.equal(schemas.sessionImportPayloadSchema.safeParse({ ...exam, rows: [{ ...row, unexpected: true }] }).success, false);
});

test("patched collection limits reject oversized input without one issue per invalid element", () => {
  const cases = [
    schemas.sessionImportPayloadSchema.safeParse({ ...exam, rows: Array(2501).fill(null) }),
    schemas.roomAssignmentRequestSchema.safeParse({ roomAssignments: Array(501).fill(null) }),
    schemas.roomAssignmentRequestSchema.safeParse({ roomAssignments: [], expectedRoomAssignments: Array(501).fill(null) }),
    schemas.roomAssignmentRequestSchema.safeParse({ roomAssignments: [{ roomId, invigilatorIds: Array(101).fill(null) }] }),
    schemas.createInvigilatorRequestSchema.safeParse({ email: "staff@example.test", assignedRoomIds: Array(501).fill(null) }),
    schemas.retryEmailDeliveriesRequestSchema.safeParse({ deliveryIds: Array(101).fill(null) })
  ];
  for (const result of cases) {
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.issues.length, 1);
      assert.equal(result.error.issues[0].code, "too_big");
      assert.equal(result.error.name, "ZodError");
      assert.ok(result.error instanceof Error);
    }
  }
  assert.equal(schemas.sessionImportPayloadSchema.safeParse({ ...exam, rows: [] }).success, false);
  assert.equal(schemas.retryEmailDeliveriesRequestSchema.safeParse({ deliveryIds: [] }).success, false);
  assert.equal(schemas.roomAssignmentRequestSchema.safeParse({ roomAssignments: [] }).success, true);
  assert.equal(schemas.sessionImportPayloadSchema.safeParse({ ...exam, rows: Array(2500).fill(row) }).success, true);
});

test("attendance and access validation retain their existing enums and length constraints", () => {
  for (const change of [{ source: "unknown" }, { action: "unknown" }, { overrideWrongRoom: "yes" },
    { studentId: " " }, { studentId: "x".repeat(65) }, { comment: "x".repeat(281) }]) {
    assert.equal(schemas.markAttendanceRequestSchema.safeParse({ ...mark, ...change }).success, false);
  }
  assert.deepEqual(schemas.markAttendanceRequestSchema.parse({ ...mark, source: "ocr", action: "redirect_only", overrideWrongRoom: false, comment: " note " }),
    { ...mark, source: "ocr", action: "redirect_only", overrideWrongRoom: false, comment: "note" });
  assert.equal(schemas.adminLoginRequestSchema.safeParse({ email: "staff@example.test", password: "" }).success, false);
  assert.equal(schemas.adminLoginRequestSchema.safeParse({ email: "staff@example.test", password: "x".repeat(1025) }).success, false);
});
