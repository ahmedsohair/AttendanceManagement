import assert from "node:assert/strict";
import test from "node:test";
import {
  generateAccessCode,
  hashAccessCode,
  normalizeAccessCode
} from "../src/lib/access-code.ts";

test("normalizes access-code input into its canonical form", () => {
  assert.equal(normalizeAccessCode("ams nk7x 22kv"), "AMS-NK7X-22KV");
  assert.equal(normalizeAccessCode("NK7X-22KV"), "AMS-NK7X-22KV");
  assert.equal(normalizeAccessCode(""), "");
});

test("generates access codes using the unambiguous production alphabet", () => {
  for (let index = 0; index < 100; index += 1) {
    const code = generateAccessCode();
    assert.match(code, /^AMS-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    assert.doesNotMatch(code, /[01IO]/);
  }
});

test("hashes equivalent access-code formatting identically", () => {
  const canonicalHash = hashAccessCode("AMS-NK7X-22KV");
  assert.match(canonicalHash, /^[a-f0-9]{64}$/);
  assert.equal(hashAccessCode("ams nk7x 22kv"), canonicalHash);
  assert.notEqual(hashAccessCode("AMS-NK7X-22KX"), canonicalHash);
  assert.equal(hashAccessCode(""), "");
});
