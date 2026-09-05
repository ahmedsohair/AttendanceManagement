import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as staffing from "../../src/lib/exam-staffing-read.ts";

export function mockBackend(tables, { cap = 500, fail = () => false, transform = (result) => result, delay = 0 } = {}) {
  const calls = [];
  let active = 0, peak = 0;
  const client = { from(table) {
    const call = { table, filters: [], orders: [], from: 0, to: cap - 1 };
    const query = {
      select(columns, options) { call.columns = columns; call.count = options?.count; return query; },
      eq(key, value) { call.filters.push([key, value]); return query; },
      in(key, values) { call.filters.push([key, values]); return query; },
      order(key) { call.orders.push(key); return query; },
      range(from, to) { call.from = from; call.to = to; return query; },
      limit(size) { call.to = size - 1; return query; },
      abortSignal(signal) { call.signal = signal; return query; },
      maybeSingle() { call.single = true; return query; },
      async then(resolve, reject) {
        try {
          calls.push(call);
          active++; peak = Math.max(peak, active);
          if (delay) await new Promise((done) => setTimeout(done, delay));
          active--;
          if (fail(call)) return resolve({ data: null, count: null, error: { message: "Mock backend unavailable" } });
          let rows = (tables[table] || []).filter((row) => call.filters.every(([key, value]) =>
            Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
          rows = [...rows].sort((a, b) => {
            for (const key of call.orders) {
              const comparison = String(a[key]).localeCompare(String(b[key]));
              if (comparison) return comparison;
            }
            return 0;
          });
          const data = rows.slice(call.from, Math.min(call.to + 1, call.from + cap));
          resolve(transform({ data: call.single ? data[0] || null : data, count: call.count ? rows.length : null, error: null }, call));
        } catch (error) { reject(error); }
      }
    };
    return query;
  } };
  return { client, calls, get peak() { return peak; } };
}

// Exercise the actual repository loaders, with every external dependency sealed.
// No environment files, live client construction, auth, or writeStore can run.
export function repositoryHarness(backend, fallback) {
  const dependencies = {
    "node:crypto": {}, "@algo-attendance/shared": {}, "./access-code": {},
    "./supabase": { isSupabaseConfigured: () => !fallback, getSupabaseAdmin: () => backend.client },
    "./store": { readStore: async () => fallback, writeStore: () => { throw new Error("No writes allowed"); } },
    "./exam-staffing-read": staffing
  };
  const source = readFileSync(new URL("../../src/lib/repository.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require(name) {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports;
}

export function staffingTables() {
  return {
    exam_sessions: [{ id: "exam-a", name: "Mock exam", exam_date: "2026-09-05", start_time: "09:00", status: "draft", published: false }],
    rooms: [{ id: "r1", exam_session_id: "exam-a", code: "R1", display_name: "Room One" },
      { id: "r2", exam_session_id: "exam-a", code: "R2", display_name: "Room Two" },
      { id: "other", exam_session_id: "exam-b", code: "Other" }],
    users: [{ id: "u1", email: "one@example.test", full_name: "One", role: "invigilator" },
      { id: "u2", email: "two@example.test", full_name: "Two", role: "invigilator" }],
    room_assignments: [{ room_id: "r1", user_id: "u1" }, { room_id: "r1", user_id: "u2" },
      { room_id: "r2", user_id: "u1" }, { room_id: "other", user_id: "u1" }],
    student_allocations: [{ id: "a1", exam_session_id: "exam-a", room_id: "r1" }, { id: "a2", exam_session_id: "exam-a", room_id: "r2" }]
  };
}
