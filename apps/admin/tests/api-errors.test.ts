import assert from "node:assert/strict";
import test from "node:test";
import {
  API_ERROR_CODES,
  ApiRequestError,
  getApiErrorCode,
  getApiErrorStatus,
  getRequestId
} from "../src/lib/api-errors.ts";

test("maps stable API errors to their HTTP status and code", () => {
  const error = new ApiRequestError("Not authenticated.", 401);
  assert.equal(getApiErrorStatus(error), 401);
  assert.equal(getApiErrorCode(error), API_ERROR_CODES.unauthenticated);
});

test("distinguishes malformed JSON from schema validation", () => {
  assert.equal(getApiErrorStatus(new SyntaxError("bad JSON")), 400);
  assert.equal(getApiErrorCode(new SyntaxError("bad JSON")), API_ERROR_CODES.malformedRequest);

  const validationError = new Error("invalid field");
  validationError.name = "ZodError";
  assert.equal(getApiErrorStatus(validationError), 422);
  assert.equal(getApiErrorCode(validationError), API_ERROR_CODES.validationError);
});

test("accepts only UUID-shaped inbound request IDs", () => {
  const valid = "123e4567-e89b-42d3-a456-426614174000";
  assert.equal(getRequestId(new Request("https://example.test", {
    headers: { "x-request-id": valid }
  })), valid);

  const generated = getRequestId(new Request("https://example.test", {
    headers: { "x-request-id": "attacker-controlled-value" }
  }));
  assert.match(generated, /^[0-9a-f-]{36}$/i);
  assert.notEqual(generated, "attacker-controlled-value");
});
