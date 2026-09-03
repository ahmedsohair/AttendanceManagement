import assert from "node:assert/strict";
import test from "node:test";
import {
  emailAddressSchema,
  emailAccessCodeRequestSchema,
  examDateSchema,
  examStartTimeSchema,
  lookupRequestSchema,
  normalizeRoomCode,
  retryEmailDeliveriesRequestSchema,
  roomAssignmentRequestSchema,
  sessionImportPayloadSchema
} from "../src/schemas.ts";

test("accepts only real ISO exam dates", () => {
  assert.equal(examDateSchema.parse("2028-02-29"), "2028-02-29");
  assert.throws(() => examDateSchema.parse("2027-02-29"));
  assert.throws(() => examDateSchema.parse("03/09/2026"));
});

test("accepts only complete 24-hour exam start times", () => {
  assert.equal(examStartTimeSchema.parse("09:05"), "09:05");
  assert.equal(examStartTimeSchema.parse("23:59"), "23:59");
  assert.throws(() => examStartTimeSchema.parse("24:00"));
  assert.throws(() => examStartTimeSchema.parse("9:05"));
});

test("normalizes room codes to one canonical case and spacing", () => {
  assert.equal(normalizeRoomCode("  room   a  "), "ROOM A");
  const payload = sessionImportPayloadSchema.parse({
    name: "Test Exam",
    examDate: "2026-09-03",
    startTime: "09:30",
    rows: [
      {
        student_id: "1234567",
        student_name: "Student One",
        room: " 08.02.007 ",
        zone: "A"
      }
    ]
  });
  assert.equal(payload.rows[0].room, "08.02.007");
});

test("normalizes valid emails and rejects malformed or control-character input", () => {
  assert.equal(emailAddressSchema.parse(" Invigilator@Example.COM "), "invigilator@example.com");
  assert.throws(() => emailAddressSchema.parse("not-an-email"));
  assert.throws(() => emailAddressSchema.parse("admin@example.com\n"));
  assert.throws(() => emailAddressSchema.parse("admin@example.com\r\nBcc: attacker@example.com"));
});

test("rejects non-UUID request identifiers and unknown request fields", () => {
  const valid = {
    examSessionId: "123e4567-e89b-42d3-a456-426614174000",
    roomId: "123e4567-e89b-42d3-a456-426614174001",
    studentId: "1234567"
  };
  assert.deepEqual(lookupRequestSchema.parse(valid), valid);
  assert.throws(() => lookupRequestSchema.parse({ ...valid, roomId: "room-one" }));
  assert.throws(() => lookupRequestSchema.parse({ ...valid, unexpected: true }));
});

test("validates complete assignment snapshots", () => {
  const roomId = "123e4567-e89b-42d3-a456-426614174000";
  const invigilatorId = "123e4567-e89b-42d3-a456-426614174001";
  assert.deepEqual(
    roomAssignmentRequestSchema.parse({
      roomAssignments: [{ roomId, invigilatorIds: [invigilatorId] }]
    }),
    { roomAssignments: [{ roomId, invigilatorIds: [invigilatorId] }] }
  );
  assert.throws(() =>
    roomAssignmentRequestSchema.parse({
      roomAssignments: [{ roomId: "not-a-uuid", invigilatorIds: [] }]
    })
  );
});

test("validates access-code email and retry payloads", () => {
  const userId = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(
    emailAccessCodeRequestSchema.parse({
      accessCode: "ams-abcd-2345",
      email: "Person@Example.com",
      userId
    }).accessCode,
    "AMS-ABCD-2345"
  );
  assert.throws(() =>
    emailAccessCodeRequestSchema.parse({
      accessCode: "AMS-INVALID",
      email: "person@example.com",
      userId
    })
  );
  assert.throws(() => retryEmailDeliveriesRequestSchema.parse({ deliveryIds: ["invalid"] }));
});
