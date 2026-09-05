import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { readStaffingPages, readPopulatedRoomIds } from "../src/lib/exam-staffing-read.ts";
import { examReadiness } from "../src/lib/exam-readiness.ts";
import { mockBackend, repositoryHarness, staffingTables } from "./fixtures/staffing-backend.mjs";

const plain = (value) => JSON.parse(JSON.stringify(value));

test("detail and setup hydrate the same scoped multi-room/multi-staff baseline", async () => {
  const h = mockBackend(staffingTables(), { cap: 1 });
  const repo = repositoryHarness(h);
  const detail = await repo.readExamSessionStoreFast("exam-a");
  const setup = await repo.readExamSetupStoreFast("exam-a");
  assert.deepEqual(plain(detail.users), plain(setup.users));
  assert.deepEqual(plain(detail.rooms), plain(setup.rooms));
  assert.deepEqual(plain(detail.users.map((user) => user.assignedRoomIds)), [["r1", "r2"], ["r1"]]);
  assert.deepEqual(plain(setup.studentAllocations), []);
  assert.deepEqual(plain(setup.populatedRoomIds), ["r1", "r2"]);
  assert.deepEqual(plain(detail.populatedRoomIds), ["r1", "r2"]);
  for (const call of h.calls.filter((call) => call.table === "room_assignments")) {
    assert.deepEqual(call.orders, ["room_id", "user_id"]);
    assert.ok(call.filters[0][1].every((id) => ["r1", "r2"].includes(id)));
    assert.ok(call.to - call.from < 500);
  }
});

test("both loaders paginate more than 1000 users, rooms and assignments with bounded IN chunks", async () => {
  const tables = staffingTables();
  tables.users = Array.from({ length: 1101 }, (_, index) => ({ id: `u${String(index).padStart(4, "0")}`, role: "invigilator", full_name: `User ${index}`, email: `${index}@example.test` }));
  tables.rooms = Array.from({ length: 1001 }, (_, index) => ({ id: `r${String(index).padStart(4, "0")}`, exam_session_id: "exam-a", code: `R${index}` }));
  // One room alone exceeds the provider's cap; other rooms force bounded IN chunks.
  tables.room_assignments = tables.users.map((user) => ({ room_id: "r0000", user_id: user.id }));
  tables.room_assignments.push({ room_id: "r1000", user_id: "u0000" });
  for (const method of ["readExamSessionStoreFast", "readExamSetupStoreFast"]) {
    const h = mockBackend(tables, { cap: 250 });
    const store = await repositoryHarness(h)[method]("exam-a");
    assert.equal(store.users.length, 1101);
    assert.equal(store.rooms.length, 1001);
    assert.equal(store.users.reduce((total, user) => total + user.assignedRoomIds.length, 0), 1102);
    assert.deepEqual(plain(store.users[0].assignedRoomIds), ["r0000", "r1000"]);
    const assignments = h.calls.filter((call) => call.table === "room_assignments");
    assert.ok(assignments.some((call) => call.from === 1000));
    assert.ok(assignments.every((call) => call.filters[0][1].length <= 100));
  }
});

for (const table of ["users", "rooms", "room_assignments"]) {
  test(`later ${table} page failure rejects both loaders instead of a partial baseline`, async () => {
    for (const method of ["readExamSessionStoreFast", "readExamSetupStoreFast"]) {
      const h = mockBackend(staffingTables(), { cap: 1, fail: (call) => call.table === table && call.from > 0 });
      await assert.rejects(repositoryHarness(h)[method]("exam-a"), /Unable to load exam staffing/);
    }
  });
}

test("empty exam skips assignment and allocation queries; setup without exam stays unloaded", async () => {
  const h = mockBackend({ ...staffingTables(), rooms: [] });
  const repo = repositoryHarness(h);
  const empty = await repo.readExamSetupStoreFast("exam-a");
  assert.deepEqual(plain(empty.rooms), []);
  assert.deepEqual(plain(empty.populatedRoomIds), []);
  const noExam = await repo.readExamSetupStoreFast();
  assert.equal(noExam.populatedRoomIds, undefined);
  assert.ok(!h.calls.some((call) => ["room_assignments", "student_allocations"].includes(call.table)));
});

test("active and closed staffing reads do not add publication prerequisite queries", async () => {
  for (const status of ["active", "closed"]) {
    const tables = staffingTables();
    tables.exam_sessions[0].status = status;
    const h = mockBackend(tables);
    const repo = repositoryHarness(h);
    const setup = await repo.readExamSetupStoreFast("exam-a");
    const detail = await repo.readExamSessionStoreFast("exam-a");
    assert.equal(setup.populatedRoomIds, undefined);
    assert.equal(detail.populatedRoomIds, undefined);
    assert.ok(!h.calls.some((call) => call.table === "student_allocations" && call.columns === "id"));
  }
});

test("per-room readiness avoids partial report rows, is scoped, and uses at most four concurrent reads", async () => {
  const tables = staffingTables();
  tables.student_allocations = Array.from({ length: 1100 }, (_, index) => ({ id: `a${index}`, room_id: "r1", exam_session_id: "exam-a" }));
  tables.student_allocations.push({ id: "last", room_id: "r2", exam_session_id: "exam-a" });
  tables.student_allocations.push({ id: "other", room_id: "r3", exam_session_id: "exam-b" });
  const h = mockBackend(tables, { delay: 1 });
  const result = await readPopulatedRoomIds(h.client, "exam-a", ["r1", "r2", "r3", "r4", "r5", "r6"]);
  assert.deepEqual(result, ["r1", "r2"]);
  assert.equal(h.peak, 4);
  assert.ok(h.calls.every((call) => call.to === 0 && call.filters.length === 2 && call.signal));
  const failing = mockBackend(tables, { fail: (call) => call.filters.some(([key, value]) => key === "room_id" && value === "r2") });
  await assert.rejects(readPopulatedRoomIds(failing.client, "exam-a", ["r1", "r2"]), /Unable to check/);
});

test("paging detects changed counts, duplicate keys, unknown counts, no progress and hard bounds", async () => {
  await assert.rejects(readStaffingPages(async (from) => ({ data: [from], count: from ? 3 : 2, error: null })), /changed/);
  await assert.rejects(readStaffingPages(async () => ({ data: ["same"], count: 2, error: null }), { key: (row) => row }), /changed/);
  await assert.rejects(readStaffingPages(async () => ({ data: [], count: null, error: null })), /incomplete/);
  await assert.rejects(readStaffingPages(async () => ({ data: [], count: 1, error: null })), /incomplete/);
  await assert.rejects(readStaffingPages(async () => ({ data: [], count: 50_001, error: null })), /row limit/);
  await assert.rejects(readStaffingPages(async () => ({ data: [1], count: 201, error: null })), /page limit/);
  await assert.rejects(readStaffingPages(async () => { throw new Error("should not query"); }, { signal: AbortSignal.abort() }), /abort/i);
  const deadline = AbortSignal.timeout(1);
  await assert.rejects(readStaffingPages(async () => { await new Promise((done) => setTimeout(done, 5)); return { data: [], count: 0, error: null }; }, { signal: deadline }), /timeout|aborted/i);
});

test("readiness distinguishes empty, unknown, empty room within populated exam, missing staff and ready", () => {
  assert.match(examReadiness([], {}, []).message, /No rooms/);
  assert.equal(examReadiness([], {}, []).ready, false);
  assert.match(examReadiness(["r1"], { r1: ["u1"] }).message, /not been checked/);
  assert.equal(examReadiness(["r1"], { r1: ["u1"] }, []).ready, false);
  assert.equal(examReadiness(["r1", "r2"], { r1: ["u1"], r2: ["u1"] }, ["r1"]).ready, false);
  assert.match(examReadiness(["r1"], {}, ["r1"]).message, /need staff/);
  assert.equal(examReadiness(["r1", "r2"], { r1: ["u1", "u2"], r2: ["u1"] }, ["r1", "r2"]).ready, true);
});

test("missing assigned user is a failed read, not silently unassigned", async () => {
  const tables = staffingTables();
  tables.users = tables.users.filter((user) => user.id !== "u2");
  await assert.rejects(repositoryHarness(mockBackend(tables)).readExamSessionStoreFast("exam-a"), /Assigned staff could not be loaded/);
});

test("fallback setup has explicit per-room allocation readiness without filling the omitted roster", async () => {
  const store = { users: [{ id: "u1", role: "invigilator", assignedRoomIds: ["r1", "other"] }],
    rooms: [{ id: "r1", examSessionId: "exam-a" }, { id: "other", examSessionId: "exam-b" }],
    examSessions: [{ id: "exam-a" }], studentAllocations: [{ roomId: "r1", examSessionId: "exam-a" }],
    attendanceEvents: [], incidents: [] };
  const repo = repositoryHarness({}, store);
  const setup = await repo.readExamSetupStoreFast("exam-a");
  const detail = await repo.readExamSessionStoreFast("exam-a");
  assert.deepEqual(plain(setup.populatedRoomIds), ["r1"]);
  assert.deepEqual(plain(detail.populatedRoomIds), ["r1"]);
  assert.deepEqual(plain(setup.studentAllocations), []);
  assert.deepEqual(plain(setup.users[0].assignedRoomIds), ["r1"]);
  assert.deepEqual(plain(detail.users[0].assignedRoomIds), ["r1"]);
});

for (const page of ["[id]", "new"]) {
  test(`${page} page shows failed loading and a real reload link, never a healthy empty wizard`, async () => {
    const fail = async () => { throw new Error("Private backend diagnostics"); };
    const dependencies = {
      "react/jsx-runtime": jsxRuntime,
      "next/link": {},
      "@algo-attendance/shared": { uuidSchema: { safeParse: () => ({ success: true, data: "exam-a" }) } },
      "@/components/action-icons": {}, "@/components/confirm-submit-button": {},
      "@/components/exam-assignment-wizard": { ExamAssignmentWizard: () => { throw new Error("Must not render editor after failure"); } },
      "@/components/new-exam-import-form": {}, "@/lib/audit-time": {},
      "@/lib/auth": { requireAdminPageUser: async () => ({ role: "admin" }) },
      "@/lib/repository": { readExamSessionStoreFast: fail, readExamSetupStoreFast: fail }
    };
    const source = readFileSync(new URL(`../app/sessions/${page}/page.tsx`, import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    const exports = {};
    vm.runInNewContext(compiled, { exports, require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
      return dependencies[name];
    } });
    const markup = renderToStaticMarkup(await exports.default({ params: Promise.resolve({ id: "exam-a" }), searchParams: Promise.resolve({ sessionId: "exam-a" }) }));
    assert.match(markup, /role="alert"/);
    assert.match(markup, /No assignment snapshot is available/);
    assert.match(markup, /Reload.*to retry/);
    assert.doesNotMatch(markup, /Private|All rooms assigned|Unassigned|Publish Exam/);
  });
}
