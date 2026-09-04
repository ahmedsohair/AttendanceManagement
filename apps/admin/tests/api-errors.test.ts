import assert from "node:assert/strict";
import test from "node:test";
import { observeApiHandler } from "../src/lib/api-observer.ts";

test("API observation preserves response identity, cookies, body and thrown errors", async () => {
  const response = new Response("private data", { status: 207, headers: { "set-cookie": "session=private" } });
  const request = new Request("https://example.test");
  const handler = observeApiHandler(async (_request: Request, id: number) => { assert.equal(id, 5); return response; }, () => { throw new Error("log failure"); });
  assert.equal(await handler(request, 5), response);
  assert.equal(response.bodyUsed, false);
  assert.equal(response.headers.get("set-cookie"), "session=private");
  const failure = new Error("private");
  const broken = observeApiHandler(async () => { throw failure; }, () => undefined);
  await assert.rejects(broken(request), (error) => error === failure);
});
import { buildApiTelemetry, telemetryRoute } from "../src/lib/telemetry.ts";
import {
  API_ERROR_CODES,
  ApiRequestError,
  getApiClientMessage,
  getApiErrorCode,
  getApiErrorStatus,
  getRequestId
} from "../src/lib/api-errors.ts";

test("maps stable API errors to their HTTP status and code", () => {
  const error = new ApiRequestError("Not authenticated.", 401);
  assert.equal(getApiErrorStatus(error), 401);
  assert.equal(getApiErrorCode(error), API_ERROR_CODES.unauthenticated);
});

test("keeps internal diagnostics out of user-facing messages", () => {
  assert.equal(
    getApiClientMessage(new Error("permission denied for table users"), 500),
    "An unexpected error occurred. Please try again."
  );
  assert.equal(
    getApiClientMessage(new SyntaxError("Unexpected token at position 14"), 400),
    "Request body must be valid JSON."
  );
});

test("distinguishes malformed JSON from schema validation", () => {
  assert.equal(getApiErrorStatus(new SyntaxError("bad JSON")), 400);
  assert.equal(getApiErrorCode(new SyntaxError("bad JSON")), API_ERROR_CODES.malformedRequest);

  const validationError = new Error("invalid field");
  validationError.name = "ZodError";
  assert.equal(getApiErrorStatus(validationError), 422);
  assert.equal(getApiErrorCode(validationError), API_ERROR_CODES.validationError);
});

test("classifies safe repository domain failures without exposing unknown errors", () => {
  const missing = new Error("Session not found.");
  assert.equal(getApiErrorStatus(missing), 404);
  assert.equal(getApiClientMessage(missing, 404), "Session not found.");

  const stale = new Error("Only draft exams can be published.");
  assert.equal(getApiErrorStatus(stale), 409);
  assert.equal(getApiClientMessage(stale, 409), "Only draft exams can be published.");

  const databaseError = new Error("duplicate key value violates unique constraint users_pkey");
  assert.equal(getApiErrorStatus(databaseError), 500);
  assert.equal(
    getApiClientMessage(databaseError, 500),
    "An unexpected error occurred. Please try again."
  );
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

test("keeps generated correlation IDs stable for the same request", () => {
  const request = new Request("https://example.test");
  assert.equal(getRequestId(request), getRequestId(request));
  assert.notEqual(getRequestId(request), getRequestId(new Request(request)));
});

test("telemetry excludes payloads, query strings, identifiers, and raw errors", () => {
  const input = {
    event: "api.request" as const,
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    url: "https://example.test/api/rooms/123e4567-e89b-42d3-a456-426614174000/live?code=secret",
    method: "POST", status: 200, code: "ready_to_mark", durationMs: 125.4, region: "sin1",
    password: "secret", error: new Error("database password=secret"), studentId: "9000001"
  };
  const record = buildApiTelemetry(input);
  assert.equal(record.route, "/api/rooms/:id/live");
  assert.equal(record.durationMs, 125);
  assert.equal(record.region, "sin1");
  assert.equal(record.requestId, input.requestId);
  assert.doesNotMatch(JSON.stringify(record), /secret|password|studentId|9000001|database/);
});

test("telemetry fails closed on unrecognized paths and field values", () => {
  assert.equal(telemetryRoute("https://example.test/api/secret@example.com"), "/api/unknown");
  assert.equal(telemetryRoute("https://example.test/api/rooms/not-a-uuid/live"), "/api/unknown");
  assert.equal(telemetryRoute("not a URL"), "/api/unknown");
  const record = buildApiTelemetry({
    event: "api.error", requestId: "secret", url: "invalid", method: "secret",
    code: "secret", status: NaN, durationMs: Infinity, region: "secret"
  });
  assert.equal(record.requestId, null);
  assert.equal(record.durationMs, null);
  assert.equal(record.status, 500);
  assert.doesNotMatch(JSON.stringify(record), /secret/);
});

test("scanner telemetry preserves safe routes and classified failure codes", () => {
  const routes = ["/api/mobile/access-login", "/api/mobile/my-rooms",
    "/api/rooms/123e4567-e89b-42d3-a456-426614174000/live"];
  const failures = [
    new ApiRequestError("Invalid access code.", 401),
    new ApiRequestError("Not allowed.", 403),
    new ApiRequestError("Too many attempts.", 429),
    new Error("private database diagnostic")
  ];
  for (const route of routes) {
    for (const error of failures) {
      const status = getApiErrorStatus(error, 503);
      const code = getApiErrorCode(error, 503);
      const record = buildApiTelemetry({
        event: "api.request", requestId: "123e4567-e89b-42d3-a456-426614174000",
        url: `https://example.test${route}?accessCode=secret`, method: "GET",
        status, code
      });
      assert.equal(record.route, route.startsWith("/api/rooms/") ? "/api/rooms/:id/live" : route);
      assert.equal(record.status, status);
      assert.equal(record.code, code);
      assert.notEqual(record.code, "UNKNOWN");
      assert.doesNotMatch(JSON.stringify(record), /secret|private database/);
    }
  }
});

test("email telemetry retains partial failure status without recipient or provider data", () => {
  const input = {
    event: "api.request" as const,
    requestId: "123e4567-e89b-42d3-a456-426614174000",
    url: "https://example.test/api/exam-sessions/123e4567-e89b-42d3-a456-426614174000/email-instructions?token=private",
    method: "POST", status: 207, code: API_ERROR_CODES.serviceUnavailable,
    recipient: "private@example.test", error: new Error("private provider response"),
    failures: ["private@example.test"]
  };
  const record = buildApiTelemetry(input);
  assert.equal(record.route, "/api/exam-sessions/:id/email-instructions");
  assert.equal(record.status, 207);
  assert.equal(record.code, "SERVICE_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(record), /private|recipient|provider|failures/);
});
