import assert from "node:assert/strict";
import test from "node:test";
import { extractManagedAuthData } from "../rehearse-managed-auth-backup.mjs";

const names = ["audit_log_entries", "custom_oauth_providers", "flow_state", "identities", "instances", "mfa_amr_claims", "mfa_challenges", "mfa_factors", "mfa_recovery_code_sets", "mfa_recovery_codes", "oauth_authorizations", "oauth_client_states", "oauth_clients", "oauth_consents", "one_time_tokens", "refresh_tokens", "saml_providers", "saml_relay_states", "scim_tokens", "scim_users", "sessions", "sso_domains", "sso_providers", "users", "webauthn_challenges", "webauthn_credentials"];
const block = (schema, name, row = "synthetic") => `COPY "${schema}"."${name}" ("id") FROM stdin;\n${row}\n\\.\n`;
const auth = names.map((name) => block("auth", name)).join("");

test("extracts the exact managed Auth inventory without application or storage rows", () => {
  const result = extractManagedAuthData(block("public", "users", "APP-ONLY") + auth + block("storage", "objects", "STORAGE-ONLY"));
  assert.equal(result.tables.size, 26);
  assert([...result.tables.values()].every((table) => table.rows === 1));
  assert.doesNotMatch(result.sql, /APP-ONLY|STORAGE-ONLY|"public"|"storage"/);
});

test("preserves escaped COPY data and handles CRLF and empty tables", () => {
  const result = extractManagedAuthData(auth.replaceAll("synthetic", "field\\nvalue\\tend").replaceAll("\n", "\r\n"));
  assert([...result.tables.values()].every((table) => table.rows === 1));
  assert.equal(extractManagedAuthData(auth.replaceAll("synthetic\n", "")).tables.get("users").rows, 0);
});

test("rejects missing, extra and duplicate Auth tables", () => {
  assert.throws(() => extractManagedAuthData(block("auth", "users")), /all 26/);
  assert.throws(() => extractManagedAuthData(auth + block("auth", "unreviewed")), /Unexpected Auth table/);
  assert.throws(() => extractManagedAuthData(auth + block("auth", "users")), /Duplicate Auth/);
});

test("rejects broken boundaries or malformed COPY identifiers", () => {
  assert.throws(() => extractManagedAuthData(auth.slice(0, -3)), /Unterminated/);
  assert.throws(() => extractManagedAuthData(auth + 'COPY "auth"."users" ("id") FROM stdin;\nunfinished'), /Duplicate Auth|Unterminated/);
  assert.throws(() => extractManagedAuthData(auth.replace("synthetic\n", block("public", "bad"))), /Nested/);
  assert.throws(() => extractManagedAuthData(auth.replace('("id")', '(id)')), /Unexpected COPY column/);
  assert.throws(() => extractManagedAuthData(auth.replace('("id")', '("id", "id")')), /Duplicate COPY column/);
  assert.throws(() => extractManagedAuthData('COPY auth.users (id) FROM stdin;\n'), /Unexpected COPY header/);
});
