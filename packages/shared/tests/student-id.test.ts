import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStudentId } from "../src/student-id.ts";

test("normalizes RMIT student identifiers", () => {
  assert.equal(normalizeStudentId(" s4181947 "), "4181947");
  assert.equal(normalizeStudentId("S 4181947"), "4181947");
  assert.equal(normalizeStudentId(" 4181947 "), "4181947");
});

test("preserves non-RMIT identifiers after canonical spacing and case", () => {
  assert.equal(normalizeStudentId(" ab 12 34 "), "AB1234");
  assert.equal(normalizeStudentId("S123"), "S123");
});
