import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { dispatchOperationsAlerts, validOperationsSecret } from "../src/lib/ops-alerts.ts";

// Compile the real route with isolated dependencies: no .env, database, or provider access.
test("real operations route enforces flags/auth, fails unavailable, and sends only to configured recipient", async () => {
  const secret = "test-only-".repeat(5);
  const env: Record<string, string> = { OPS_MONITORING_ENABLED: "true", OPS_ALERTS_ENABLED: "true", OPS_CHECK_SECRET: secret,
    OPS_ALERT_EMAIL: "operator@example.test", RESEND_API_KEY: "test-only", EMAIL_FROM: "test@example.test" };
  let snapshotFails = false, providerFails = false, providerCalls = 0;
  const states: string[] = [];
  const dependencies: Record<string, unknown> = {
    "node:crypto": { randomUUID: () => "test-claim" },
    "@/lib/ops-alerts": { dispatchOperationsAlerts, validOperationsSecret },
    "@/lib/ops-monitoring": { getOperationsSnapshot: async () => { if (snapshotFails) throw new Error("private"); return { alerts: ["scanner_errors"], capturedAt: "2026-09-04T00:00:00Z" }; } },
    "@/lib/supabase": { getSupabaseAdmin: () => ({
      rpc: () => ({ abortSignal: async () => ({ data: "test-claim", error: null }) }),
      from: () => ({ update: ({ state }: { state: string }) => { states.push(state); return { eq: () => ({ eq: () => ({ abortSignal: async () => ({ error: null }) }) }) }; } })
    }) }
  };
  const source = readFileSync(new URL("../app/api/operations/check/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: { POST?: (r: Request) => Promise<Response> } = {};
  vm.runInNewContext(compiled, { exports, require: (name: string) => { if (!(name in dependencies)) throw new Error(`Unexpected import ${name}`); return dependencies[name]; },
    process: { env }, Response, AbortSignal,
    fetch: async (_url: string, options: { body: string }) => {
      providerCalls++;
      assert.deepEqual(JSON.parse(options.body).to, ["operator@example.test"]);
      if (providerFails) throw new Error("provider private error");
      return Response.json({ id: "provider-test-id" });
    }
  });
  const request = (authorized = true) => new Request("https://example.test/api/operations/check", { method: "POST", headers: authorized ? { authorization: `Bearer ${secret}` } : {} });
  env.OPS_ALERTS_ENABLED = "false";
  assert.equal((await exports.POST!(request())).status, 404);
  env.OPS_ALERTS_ENABLED = "true";
  assert.equal((await exports.POST!(request(false))).status, 401);
  assert.equal(providerCalls, 0);
  snapshotFails = true;
  assert.equal((await exports.POST!(request())).status, 503);
  snapshotFails = false;
  assert.equal((await exports.POST!(request())).status, 200);
  providerFails = true;
  const failed = await exports.POST!(request());
  assert.equal(failed.status, 502);
  assert.doesNotMatch(await failed.text(), /private|example.test|test-only/);
  assert.deepEqual(states, ["accepted", "unknown"]);
  assert.equal(providerCalls, 2);
});

type AlertRow = { key: string; claim_id: string; claimed_at: string; state: string };

function reminderHarness() {
  const secret = "test-only-".repeat(5);
  const now = Date.parse("2026-10-24T04:00:00Z");
  const rows = new Map<string, AlertRow>();
  const sends: string[] = [];
  let sequence = 0, rpcCalls = 0, updateFails = false, providerFails = false;
  let alerts = ["telemetry_missing"];
  let snapshotRows: AlertRow[] | undefined;
  const dependencies: Record<string, unknown> = {
    "node:crypto": { randomUUID: () => `claim-${++sequence}` },
    "@/lib/ops-alerts": { dispatchOperationsAlerts, validOperationsSecret },
    "@/lib/ops-monitoring": { getOperationsSnapshot: async () => ({
      alerts, capturedAt: new Date(now).toISOString(),
      delivery: snapshotRows || [...rows.values()].map((row) => ({ ...row }))
    }) },
    "@/lib/supabase": { getSupabaseAdmin: () => ({
      rpc: (_name: string, { p_key }: { p_key: string }) => ({ abortSignal: async () => {
        rpcCalls++;
        const previous = rows.get(p_key);
        if (previous && Date.parse(previous.claimed_at) >= now - 15 * 60000) return { data: null, error: null };
        const claim_id = `claim-${++sequence}`;
        rows.set(p_key, { key: p_key, claim_id, claimed_at: new Date(now).toISOString(), state: "sending" });
        return { data: claim_id, error: null };
      } }),
      from: () => ({ update: (values: Partial<AlertRow>) => {
        const equals = new Map<string, unknown>();
        let cutoff: string | undefined;
        const query = {
          eq: (column: string, value: unknown) => { equals.set(column, value); return query; },
          lte: (_column: string, value: string) => { cutoff = value; return query; },
          select: () => query,
          abortSignal: async () => {
            if (updateFails) return { data: null, error: new Error("private database detail") };
            const row = rows.get(equals.get("key") as string);
            if (!row || row.claim_id !== equals.get("claim_id") || (cutoff && row.claimed_at > cutoff)) return { data: null, error: null };
            Object.assign(row, values);
            return { data: [{ claim_id: row.claim_id }], error: null };
          }
        };
        return query;
      } })
    }) }
  };
  const source = readFileSync(new URL("../app/api/operations/check/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: { POST?: (request: Request) => Promise<Response> } = {};
  vm.runInNewContext(compiled, {
    exports, require: (name: string) => { if (!(name in dependencies)) throw new Error(`Unexpected import ${name}`); return dependencies[name]; },
    process: { env: { OPS_MONITORING_ENABLED: "true", OPS_ALERTS_ENABLED: "true", OPS_CHECK_SECRET: secret,
      OPS_ALERT_EMAIL: "operator@example.test", RESEND_API_KEY: "test-only", EMAIL_FROM: "test@example.test" } },
    Response, AbortSignal, Date: class extends Date { static now() { return now; } },
    fetch: async (_url: string, options: { body: string }) => {
      sends.push(JSON.parse(options.body).subject);
      if (providerFails) throw new Error("private provider detail");
      return Response.json({ id: "test-provider-id" });
    }
  });
  return {
    now, rows, sends,
    check: () => exports.POST!(new Request("https://example.test/api/operations/check", { method: "POST", headers: { authorization: `Bearer ${secret}` } })),
    rpcCalls: () => rpcCalls,
    failUpdate: () => { updateFails = true; },
    failProvider: () => { providerFails = true; },
    setAlerts: (keys: string[]) => { alerts = keys; },
    setSnapshotRows: (values: AlertRow[]) => { snapshotRows = values; },
    seed: (key: string, ageMs: number, state = "accepted") => {
      const row = { key, claim_id: "previous-claim", claimed_at: new Date(now - ageMs).toISOString(), state };
      rows.set(key, row);
      return { ...row };
    }
  };
}

test("first telemetry warning uses the existing atomic RPC and concurrent checks send once", async () => {
  const h = reminderHarness();
  h.setSnapshotRows([]);
  const responses = await Promise.all([h.check(), h.check()]);
  assert.equal(h.sends.length, 1);
  const results = await Promise.all(responses.map((response) => response.json()));
  assert.equal(results.reduce((n, value) => n + value.accepted, 0), 1);
  assert.equal(results.reduce((n, value) => n + value.suppressed, 0), 1);
});

test("telemetry reminders have a persistent 24-hour limit, including ambiguous sends", async () => {
  for (const state of ["accepted", "unknown", "sending"]) {
    const h = reminderHarness();
    const previous = h.seed("telemetry_missing", 16 * 60000, state);
    assert.deepEqual(await (await h.check()).json(), { status: "checked", accepted: 0, unknown: 0, suppressed: 1 });
    assert.equal(h.sends.length, 0);
    assert.equal(h.rpcCalls(), 0);
    assert.deepEqual(h.rows.get("telemetry_missing"), previous);
  }
  for (const age of [24 * 60 * 60000 - 1, 24 * 60 * 60000]) {
    const h = reminderHarness();
    h.seed("telemetry_missing", age);
    const result = await (await h.check()).json();
    assert.equal(result.accepted, Number(age === 24 * 60 * 60000));
  }
});

test("concurrent telemetry reminders compare-and-swap the existing claim exactly once", async () => {
  const h = reminderHarness();
  h.setSnapshotRows([h.seed("telemetry_missing", 25 * 60 * 60000)]);
  await Promise.all([h.check(), h.check()]);
  assert.equal(h.sends.length, 1);
  assert.equal(h.rows.get("telemetry_missing")?.state, "accepted");
  assert.equal(h.rpcCalls(), 0);
});

test("a stale snapshot cannot overwrite a newer telemetry claim", async () => {
  const h = reminderHarness();
  h.setSnapshotRows([h.seed("telemetry_missing", 25 * 60 * 60000)]);
  const newer = { key: "telemetry_missing", claim_id: "newer-claim", claimed_at: new Date(h.now - 25 * 60 * 60000).toISOString(), state: "unknown" };
  h.rows.set(newer.key, { ...newer });
  assert.equal((await h.check()).status, 200);
  assert.equal(h.sends.length, 0);
  assert.deepEqual(h.rows.get(newer.key), newer);
});

test("failed reminder claims fail closed; failed sends stay unconfirmed without immediate retry", async () => {
  const unavailable = reminderHarness();
  unavailable.seed("telemetry_missing", 25 * 60 * 60000);
  unavailable.failUpdate();
  assert.equal((await unavailable.check()).status, 503);
  assert.equal(unavailable.sends.length, 0);
  const h = reminderHarness();
  h.seed("telemetry_missing", 25 * 60 * 60000);
  h.failProvider();
  assert.equal((await h.check()).status, 502);
  assert.equal(h.rows.get("telemetry_missing")?.state, "unknown");
  assert.equal((await h.check()).status, 200);
  assert.equal(h.sends.length, 1);
});

test("other operational warnings retain their existing 15-minute claim policy", async () => {
  const h = reminderHarness();
  h.setAlerts(["telemetry_missing", "mark_failures", "api_failures", "database_slow", "email_bounces", "scanner_errors"]);
  for (const key of ["telemetry_missing", "mark_failures", "api_failures", "database_slow", "email_bounces", "scanner_errors"]) h.seed(key, 16 * 60000);
  const result = await (await h.check()).json();
  assert.equal(result.accepted, 5);
  assert.equal(result.suppressed, 1);
  assert.equal(h.rpcCalls(), 5);
});
