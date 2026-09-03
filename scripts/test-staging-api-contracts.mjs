import { createClient } from "@supabase/supabase-js";

const expectedAppUrl = "https://exampulse-stagings.vercel.app";
const expectedSupabaseUrl = "https://bjoguceapwquyczbhlyp.supabase.co";
const productionAppUrls = new Set(["https://exampulse.xyz", "https://attendance-management-admin.vercel.app"]);
const activeExamId = "10000000-0000-4000-8000-000000000001";
const draftExamId = "10000000-0000-4000-8000-000000000002";
const roomOneId = "20000000-0000-4000-8000-000000000001";
const roomTwoId = "20000000-0000-4000-8000-000000000002";
const missingId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function normalizeOrigin(value, name) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`${name} must contain only an HTTPS origin.`);
  }
  return parsed.origin.toLowerCase();
}

async function signIn(supabaseUrl, publishableKey, email, password) {
  const client = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) {
    throw new Error(`Unable to sign in ${email}: ${error?.message || "missing access token"}`);
  }
  return data.session.access_token;
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${response.url} returned non-JSON content with status ${response.status}.`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function expectStructuredError(appUrl, path, expectedStatus, expectedCode, init = {}) {
  const response = await fetch(`${appUrl}${path}`, { redirect: "manual", ...init });
  const payload = await readResponse(response);
  assert(response.status === expectedStatus, `${path}: expected ${expectedStatus}, received ${response.status}.`);
  assert(payload.code === expectedCode, `${path}: expected ${expectedCode}, received ${payload.code || "no code"}.`);
  assert(typeof payload.message === "string" && payload.message.length > 0, `${path}: missing safe message.`);
  assert(requestIdPattern.test(payload.requestId || ""), `${path}: missing valid request ID.`);
  assert(response.headers.get("x-request-id") === payload.requestId, `${path}: request ID header/body mismatch.`);
}

async function expectJsonSuccess(appUrl, path, token, validate) {
  const response = await fetch(`${appUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const payload = await readResponse(response);
  assert(response.ok, `${path}: expected success, received ${response.status}.`);
  assert(requestIdPattern.test(response.headers.get("x-request-id") || ""), `${path}: missing response request ID.`);
  validate(payload);
}

const jsonHeaders = { "Content-Type": "application/json" };
const protectedRoutes = [
  ["POST", "/api/attendance/lookup", {
    headers: jsonHeaders,
    body: JSON.stringify({ examSessionId: activeExamId, roomId: roomOneId, studentId: "9000001" })
  }],
  ["POST", "/api/attendance/mark", {
    headers: jsonHeaders,
    body: JSON.stringify({
      examSessionId: activeExamId,
      roomId: roomOneId,
      studentId: "9000001",
      userId: missingId,
      deviceId: "staging-api-contract-test",
      requestId: missingId,
      source: "manual",
      action: "mark_present"
    })
  }],
  ["GET", "/api/auth/me"],
  ["GET", `/api/email-jobs/${missingId}`],
  ["POST", `/api/email-jobs/${missingId}/process`],
  ["POST", `/api/email-jobs/${missingId}/retry`],
  ["POST", `/api/exam-sessions/${draftExamId}/assignments`],
  ["POST", `/api/exam-sessions/${activeExamId}/close`],
  ["POST", `/api/exam-sessions/${draftExamId}/delete`],
  ["POST", `/api/exam-sessions/${activeExamId}/email-instructions`],
  ["POST", `/api/exam-sessions/${draftExamId}/publish`],
  ["POST", "/api/exam-sessions/import"],
  ["POST", "/api/invigilators"],
  ["POST", `/api/invigilators/${missingId}/access-code`],
  ["PUT", `/api/invigilators/${missingId}/access-code`],
  ["POST", "/api/invigilators/email-code"],
  ["GET", "/api/mobile/my-rooms"],
  ["GET", `/api/reports/${activeExamId}/export`],
  ["GET", `/api/rooms/${roomOneId}/live`]
];

const adminOnlyRoutes = protectedRoutes.filter(([, path]) =>
  path.startsWith("/api/email-jobs/") ||
  path.startsWith("/api/exam-sessions/") ||
  path === "/api/exam-sessions/import" ||
  path.startsWith("/api/invigilators") ||
  path.startsWith("/api/reports/")
);

async function main() {
  const appUrl = normalizeOrigin(requireEnvironment("STAGING_APP_URL"), "STAGING_APP_URL");
  const supabaseUrl = normalizeOrigin(requireEnvironment("STAGING_SUPABASE_URL"), "STAGING_SUPABASE_URL");
  const publishableKey = requireEnvironment("STAGING_SUPABASE_PUBLISHABLE_KEY");
  const adminPassword = requireEnvironment("STAGING_ADMIN_PASSWORD");
  const invigilatorCode = process.env.STAGING_INVIGILATOR_ACCESS_CODE?.trim() || "AMS-T001-0001";

  if (productionAppUrls.has(appUrl) || appUrl !== expectedAppUrl) {
    throw new Error(`API tests refused: expected ${expectedAppUrl}, received ${appUrl}.`);
  }
  if (supabaseUrl !== expectedSupabaseUrl) {
    throw new Error(`API tests refused: expected ${expectedSupabaseUrl}, received ${supabaseUrl}.`);
  }

  const [adminToken, invigilatorToken] = await Promise.all([
    signIn(supabaseUrl, publishableKey, "admin.staging@example.com", adminPassword),
    signIn(supabaseUrl, publishableKey, "invigilator01@example.com", invigilatorCode)
  ]);

  for (const [method, path, requestInit = {}] of protectedRoutes) {
    await expectStructuredError(appUrl, path, 401, "UNAUTHENTICATED", { method, ...requestInit });
  }

  for (const [method, path, requestInit = {}] of adminOnlyRoutes) {
    await expectStructuredError(appUrl, path, 403, "FORBIDDEN", {
      method,
      ...requestInit,
      headers: { ...requestInit.headers, Authorization: `Bearer ${invigilatorToken}` }
    });
  }

  await expectJsonSuccess(appUrl, "/api/auth/me", adminToken, (payload) => {
    assert(payload.user?.role === "admin", "Admin profile returned the wrong role.");
  });
  await expectJsonSuccess(appUrl, "/api/mobile/my-rooms", invigilatorToken, (payload) => {
    assert(Array.isArray(payload.rooms) && payload.rooms.some((room) => room.id === roomOneId), "Assigned room is missing.");
  });

  const authHeaders = {
    Authorization: `Bearer ${invigilatorToken}`,
    "Content-Type": "application/json"
  };
  await expectJsonSuccess(appUrl, `/api/rooms/${roomOneId}/live`, invigilatorToken, (payload) => {
    assert(payload.summary?.allocatedCount === 100, "Live room summary has an unexpected allocation count.");
  });
  await expectStructuredError(appUrl, `/api/rooms/${roomTwoId}/live`, 403, "FORBIDDEN", {
    headers: { Authorization: `Bearer ${invigilatorToken}` }
  });
  await expectStructuredError(appUrl, `/api/rooms/${missingId}/live`, 404, "NOT_FOUND", {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  await expectStructuredError(appUrl, "/api/attendance/lookup", 409, "CONFLICT", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ examSessionId: draftExamId, roomId: roomOneId, studentId: "9000001" })
  });
  await expectStructuredError(appUrl, "/api/attendance/lookup", 422, "VALIDATION_ERROR", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ examSessionId: activeExamId, roomId: roomOneId })
  });
  await expectStructuredError(appUrl, "/api/attendance/lookup", 400, "MALFORMED_REQUEST", {
    method: "POST",
    headers: authHeaders,
    body: "{not-json"
  });
  await expectStructuredError(appUrl, "/api/mobile/access-login", 401, "UNAUTHENTICATED", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessCode: "AMS-ZZZZ-ZZZZ" })
  });
  await expectStructuredError(appUrl, "/api/auth/admin-login", 422, "VALIDATION_ERROR", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "invalid", password: "short" })
  });
  await expectStructuredError(appUrl, "/api/auth/dev-login", 404, "NOT_FOUND", { method: "POST" });

  console.log(`Staging API contracts passed: ${protectedRoutes.length} authentication checks, ${adminOnlyRoutes.length} role checks, and 10 functional/error checks.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
