import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createHmac } from "node:crypto";

// Exercise the real persistence boundary without loading local production credentials.
function harness() {
  const callbacks: (() => Promise<void>)[] = [];
  const warnings: string[] = [];
  const calls: unknown[] = [];
  const env = { OPS_MONITORING_ENABLED: "true", OPS_HEALTH_SECRET: "synthetic-secret-".repeat(3) };
  let schedulerFails = false;
  let databaseFails = false;
  const dependencies: Record<string, unknown> = {
    "server-only": {}, "node:crypto": { createHmac },
    "next/server": { after: (callback: () => Promise<void>) => {
      if (schedulerFails) throw new Error("private scheduler detail");
      callbacks.push(callback);
    } },
    "./supabase": { getSupabaseAdmin: () => ({ rpc: (_name: string, args: unknown) => {
      calls.push(args);
      return { abortSignal: async () => ({ error: databaseFails ? new Error("private database detail") : null }) };
    } }) },
    "./scanner-telemetry": { validateScannerReport: (value: unknown) => value },
    "./ops-policy": { evaluateOperations: () => ({}) }
  };
  const source = readFileSync(new URL("../src/lib/ops-monitoring.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: { persistOperations?: (...args: unknown[]) => void } = {};
  vm.runInNewContext(compiled, { exports, require: (name: string) => {
    if (!(name in dependencies)) throw new Error(`Unexpected import ${name}`);
    return dependencies[name];
  }, process: { env }, AbortSignal, console: { warn: (message: string) => warnings.push(message) } });
  return { callbacks, calls, warnings, env, persist: exports.persistOperations!,
    failScheduler: () => { schedulerFails = true; }, failDatabase: () => { databaseFails = true; } };
}

test("monitoring disabled schedules no work; enabled ingestion waits until after response", async () => {
  const h = harness();
  h.env.OPS_MONITORING_ENABLED = "false";
  h.persist("api", { status: 200 });
  assert.equal(h.callbacks.length, 0);
  h.env.OPS_MONITORING_ENABLED = "true";
  assert.equal(h.persist("api", { status: 200 }), undefined);
  assert.equal(h.calls.length, 0);
  assert.equal(h.callbacks.length, 1);
  await h.callbacks[0]();
  assert.equal(h.calls.length, 1);
});

test("scheduler and database failures do not escape into attendance or leak private errors", async () => {
  const scheduler = harness();
  scheduler.failScheduler();
  assert.doesNotThrow(() => scheduler.persist("api", { status: 200 }));
  const database = harness();
  database.failDatabase();
  database.persist("api", { status: 200 });
  await assert.doesNotReject(database.callbacks[0]());
  assert.deepEqual(database.warnings, ['{"event":"ops.ingest_failed"}']);
});

test("heartbeat storage uses a keyed digest rather than raw account or device identifiers", async () => {
  const h = harness();
  h.persist("scanner", { version: 1, events: [] }, { userId: "synthetic-user", deviceId: "synthetic-device", pending: 2, conflicts: 1 });
  await h.callbacks[0]();
  const stored = h.calls[0] as { p_key: string; p_pending: number; p_conflicts: number };
  assert.match(stored.p_key, /^[a-f0-9]{64}$/);
  assert.equal(stored.p_pending, 2);
  assert.equal(stored.p_conflicts, 1);
  assert.doesNotMatch(JSON.stringify(stored), /synthetic-user|synthetic-device/);
});
