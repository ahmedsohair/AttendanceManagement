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
