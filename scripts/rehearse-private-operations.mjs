import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
const requireApp = createRequire(new URL("../apps/admin/package.json", import.meta.url));
const ExcelJS = requireApp("exceljs");
const { chromium, expect } = createRequire(import.meta.url)("@playwright/test");
export function assertPrivateFixtureUrls(...values) {
    for (const value of values) {
        const url = new URL(value);
        assert(url.protocol === "http:" && url.hostname === "127.0.0.1" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash, "Operational drills require plain private loopback fixture origins");
    }
}
async function readQueue(page) {
    return page.evaluate(async () => {
        if (!(await indexedDB.databases()).some(db => db.name === "exampulse-scanner"))
            return [];
        const db = await new Promise((resolve, reject) => {
            const r = indexedDB.open("exampulse-scanner");
            r.onsuccess = () => resolve(r.result);
            r.onerror = () => reject(r.error);
        });
        try {
            if (!db.objectStoreNames.contains("attendance-outbox"))
                return [];
            return await new Promise((resolve, reject) => {
                const r = db.transaction("attendance-outbox").objectStore("attendance-outbox").getAll();
                r.onsuccess = () => resolve(r.result);
                r.onerror = () => reject(r.error);
            });
        }
        finally {
            db.close();
        }
    });
}
export async function runPrivateOperationalDrills({ base, backend, admin, inv, invPassword, invToken, serviceKey, anonKey, psql, query, request, output, saveProgress }) {
    assertPrivateFixtureUrls(base, backend);
    const result = { scope: "Synthetic local Chromium/Auth/REST drills; no hosted provider, phone or institutional sign-off", checks: [] };
    const passed = (name) => { result.checks.push(name); saveProgress(name); };
    const exam = randomUUID(), a = randomUUID(), b = randomUUID();
    const ids = ["9910001", "9910002", "9910003", "9910004"];
    psql("private operations fixture", `insert into public.exam_sessions(id,name,exam_date,start_time,created_by,import_room_count,import_student_count,import_checksum) values ('${exam}','PRIVATE OPERATIONS','2026-10-19','09:00','${admin.id}',2,4,'synthetic-operations');
    insert into public.rooms(id,exam_session_id,code,display_name) values ('${a}','${exam}','OPS-A','OPS-A'),('${b}','${exam}','OPS-B','OPS-B');
    insert into public.room_assignments(room_id,user_id) values ('${a}','${inv.id}'),('${b}','${inv.id}');
    insert into public.student_allocations(exam_session_id,student_id,student_name,room_id,zone) values ${ids.map((id, i) => `('${exam}','${id}','Synthetic Ops ${i + 1}','${i < 3 ? a : b}','A')`).join(",")};`);
    await request(`/api/exam-sessions/${exam}/publish`, { body: {}, status: 303 });
    const count = (student) => Number(psql("private student attendance count", `select count(*) from public.attendance_events where exam_session_id='${exam}' and student_id='${student}';`).trim());
    const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
    const context = await browser.newContext({ permissions: ["camera"] });
    let mode = "lost", lostRequest, originalEvent, attempts = [];
    try {
        const alternate = base.replace("127.0.0.1", "localhost");
        const allowed = new Set([new URL(base).origin, new URL(backend).origin, new URL(alternate).origin]);
        await context.route("**/*", route => allowed.has(new URL(route.request().url()).origin) ? route.continue() : route.abort());
        const page = await context.newPage();
        await page.route("**/api/attendance/mark", async (route) => {
            const body = route.request().postDataJSON();
            attempts.push(body);
            if (mode === "lost" && !originalEvent) {
                lostRequest = body;
                const response = await route.fetch();
                assert.equal(response.status(), 200);
                originalEvent = (await response.json()).event.id;
                await route.abort("failed");
            }
            else if (mode === "normal")
                await route.continue();
            else
                await route.abort("failed");
        });
        await page.goto(base + "/scan");
        await page.getByPlaceholder("AMS-XXXX-XXXX").fill(invPassword);
        await page.getByRole("button", { name: "Sign In", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Choose Room" })).toBeVisible({ timeout: 30000 });
        const choose = async () => {
            if (await page.getByRole("heading", { name: "Choose Room" }).isVisible())
                await page.getByRole("button", { name: /OPS-A/ }).click();
            await expect(page.getByPlaceholder("Manual student number")).toBeVisible();
        };
        const review = async (student) => {
            await page.getByPlaceholder("Manual student number").fill(student);
            await page.getByRole("button", { name: "Lookup", exact: true }).click();
            await expect(page.getByRole("heading", { name: "Ready to mark" })).toBeVisible({ timeout: 30000 });
        };
        await choose();
        await review(ids[0]);
        await page.getByRole("button", { name: "Mark Present", exact: true }).click();
        await expect.poll(async () => (await readQueue(page)).length, { timeout: 30000 }).toBe(1);
        await expect.poll(() => originalEvent, { timeout: 30000 }).toBeTruthy();
        assert.equal(count(ids[0]), 1);
        mode = "blocked";
        await page.reload();
        await expect(page.getByRole("heading", { name: "Choose Room" })).toBeVisible({ timeout: 30000 });
        const persisted = (await readQueue(page))[0];
        assert.equal(persisted.request.requestId, lostRequest.requestId);
        mode = "normal";
        await expect.poll(async () => (await readQueue(page)).length, { timeout: 35000 }).toBe(0);
        assert.equal(count(ids[0]), 1);
        assert(attempts.filter(x => x.studentId === ids[0]).every(x => x.requestId === lostRequest.requestId));
        const event = psql("committed response-loss identity", `select id from public.attendance_events where exam_session_id='${exam}' and student_id='${ids[0]}';`).trim();
        assert.equal(event, originalEvent);
        passed("Real Chromium: committed response lost, IndexedDB survived reload, original request replay drained queue with exactly one attendance event");
        await choose();
        await review(ids[1]);
        mode = "blocked";
        await context.setOffline(true);
        await page.getByRole("button", { name: "Mark Present", exact: true }).click();
        await expect.poll(async () => (await readQueue(page)).length).toBe(1);
        assert.equal(count(ids[1]), 0);
        await context.setOffline(false);
        const other = await context.newPage();
        await other.goto(alternate + "/scan");
        await expect(other.getByPlaceholder("AMS-XXXX-XXXX")).toBeVisible({ timeout: 30000 });
        assert.equal((await readQueue(other)).length, 0);
        assert.equal((await readQueue(page)).length, 1);
        await other.close();
        passed("Real Chromium: offline mark remains local; alternate origin has neither login nor queue and original-origin pending evidence is preserved");
        await request("/api/attendance/mark", { token: invToken, body: { examSessionId: exam, roomId: a, studentId: ids[2], userId: inv.id, requestId: randomUUID(), source: "manual", action: "mark_present", deviceId: "private-paper-reconciliation", comment: "Synthetic paper fallback replay while exam active; original observation retained separately, not backdated" } });
        await request(`/api/exam-sessions/${exam}/close`, { body: {}, status: 303 });
        mode = "normal";
        await expect.poll(async () => (await readQueue(page))[0]?.status, { timeout: 35000 }).toBe("conflict");
        assert.equal(count(ids[1]), 0);
        await page.locator("summary").filter({ hasText: "Attendance sync queue" }).click();
        const row = page.locator(".scanner-outbox-item").filter({ hasText: ids[1] });
        await expect(row.getByText("Conflict needs review", { exact: true })).toBeVisible();
        const before = attempts.filter(x => x.studentId === ids[1]).length;
        await row.getByRole("button", { name: "Retry", exact: true }).click();
        await expect.poll(() => attempts.filter(x => x.studentId === ids[1]).length, { timeout: 20000 }).toBeGreaterThan(before);
        await expect.poll(async () => (await readQueue(page))[0]?.status).toBe("conflict");
        page.once("dialog", dialog => dialog.dismiss());
        await row.getByRole("button", { name: "Acknowledge" }).click();
        assert.equal((await readQueue(page)).length, 1);
        await page.screenshot({ path: join(output, "closed-queue-conflict.png") });
        page.once("dialog", dialog => dialog.accept());
        await row.getByRole("button", { name: "Acknowledge" }).click();
        await expect.poll(async () => (await readQueue(page)).length).toBe(0);
        assert.equal(count(ids[1]), 0);
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(Buffer.from(await (await request(`/api/reports/${exam}/export`)).arrayBuffer()));
        const records = [];
        const sheet = book.getWorksheet("Register");
        const headers = sheet.getRow(1).values.slice(1);
        sheet.eachRow((row, index) => { if (index > 1)
            records.push(Object.fromEntries(headers.map((h, i) => [h, row.getCell(i + 1).value]))); });
        assert.deepEqual(records.map(x => String(x.student_id)).sort(), [...ids].sort());
        assert.equal(records.filter(x => x.attendance_status === "Absent").length, 2);
        assert.equal(book.getWorksheet("Attendance").rowCount - 1, 2);
        passed("Real Chromium: closed-exam pending mark becomes reviewable conflict; Retry preserves it, cancelled Acknowledge preserves evidence, accepted Acknowledge removes only local item");
        passed("Synthetic mixed committed/queued/paper register reconciled by student-ID sets and totals; no timestamp edits or forced post-closure marking; institutional approval remains pending");
    }
    finally {
        await context.close();
        await browser.close();
    }
    // With no provider credentials, this must record failure, not accepted delivery.
    await request("/api/invigilators/email-code", { body: { userId: inv.id, email: inv.email, fullName: "Synthetic Invigilator", accessCode: invPassword }, headers: { "idempotency-key": randomUUID() }, status: 500 });
    const mail = query("unconfigured mail failure", "select json_build_object('failed',(select count(*) from public.email_deliveries where status='failed'),'accepted',(select count(*) from public.email_deliveries where status in ('accepted','delivered')));");
    assert.equal(mail.failed, 1);
    assert.equal(mail.accepted, 0);
    const emailed = psql("no false emailed timestamp", `select access_code_emailed_at is null from public.users where id='${inv.id}';`).trim();
    assert.equal(emailed, "t");
    const stillWorks = await (await request("/api/mobile/access-login", { token: null, body: { accessCode: invPassword } })).json();
    assert.equal(stillWorks.email, inv.email);
    passed("Email credentials unavailable: job records failed, no accepted delivery/emailed timestamp, existing access code still resolves; no real email attempt");
    async function workbook(students) {
        const book = new ExcelJS.Workbook();
        const sheet = book.addWorksheet("Allocations");
        sheet.addRow(["student_id", "student_name", "room", "zone", "course_code", "program"]);
        for (const student of students)
            sheet.addRow([student, "Synthetic roster", "FIX-01", "A", "TEST1001", "Synthetic"]);
        return book.xlsx.writeBuffer();
    }
    const importRoster = async (name, students, status = 200) => {
        const form = new FormData();
        form.set("name", name);
        form.set("examDate", "2026-10-19");
        form.set("startTime", "09:00");
        form.append("files", new Blob([await workbook(students)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "synthetic-correction.xlsx");
        return (await request("/api/exam-sessions/import", { form, status })).json();
    };
    const beforeImports = Number(psql("before invalid import", "select count(*) from public.exam_sessions;").trim());
    await importRoster("PRIVATE INVALID ROSTER", ["9920001", "9920001"], 422);
    assert.equal(Number(psql("after invalid import", "select count(*) from public.exam_sessions;").trim()), beforeImports);
    const name = "PRIVATE ROSTER CORRECTION";
    const wrong = await importRoster(name, ["9920099", "9920002"]);
    const form = new FormData();
    form.set("confirmationName", name);
    await request(`/api/exam-sessions/${wrong.sessionId}/delete`, { form, status: 303 });
    const correct = await importRoster(name, ["9920001", "9920002"]);
    const roster = query("corrected roster exact IDs", `select json_build_object('ids',(select json_agg(student_id order by student_id) from public.student_allocations where exam_session_id='${correct.sessionId}'),'oldDraftGone',not exists(select 1 from public.exam_sessions where id='${wrong.sessionId}'),'deletedAudited',exists(select 1 from public.admin_audit_events where entity_id='${wrong.sessionId}' and action='exam_deleted'));`);
    assert.deepEqual(roster.ids, ["9920001", "9920002"]);
    assert(roster.oldDraftGone && roster.deletedAudited);
    passed("Synthetic roster correction: duplicate input rejected atomically; incorrect unmarked draft typed-deleted with audit, corrected workbook imported with exact IDs");
    const authCall = async (path, { method = "POST", body, token = serviceKey } = {}) => fetch(backend + "/auth/v1" + path, { method, signal: AbortSignal.timeout(20000), headers: { authorization: `Bearer ${token}`, apikey: serviceKey, ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const signIn = async (password) => {
        const r = await authCall("/token?grant_type=password", { body: { email: inv.email, password }, token: anonKey });
        assert.equal(r.status, 200, "Synthetic containment sign-in failed");
        return r.json();
    };
    // Rehearse supported account actions without changing a hosted account or deleting audit history.
    const staged = await (await request(`/api/invigilators/${inv.id}/access-code`, { body: {} })).json();
    await request(`/api/invigilators/${inv.id}/access-code`, { method: "PUT", body: { accessCode: staged.accessCode } });
    await request("/api/mobile/access-login", { token: null, body: { accessCode: invPassword }, status: 401 });
    const oldPassword = await authCall("/token?grant_type=password", { body: { email: inv.email, password: invPassword }, token: anonKey });
    assert.equal(oldPassword.status, 400);
    const beforeBan = await signIn(staged.accessCode);
    const banned = await authCall(`/admin/users/${inv.id}`, { method: "PUT", body: { ban_duration: "1h" } });
    assert.equal(banned.status, 200);
    await request("/api/mobile/my-rooms", { token: beforeBan.access_token, status: 401 });
    const blocked = await authCall("/token?grant_type=password", { body: { email: inv.email, password: staged.accessCode }, token: anonKey });
    assert.equal(blocked.status, 400);
    const unban = await authCall(`/admin/users/${inv.id}`, { method: "PUT", body: { ban_duration: "none" } });
    assert.equal(unban.status, 200);
    const fresh = await signIn(staged.accessCode), second = await signIn(staged.accessCode);
    const revoked = await authCall("/logout?scope=global", { token: fresh.access_token });
    assert.equal(revoked.status, 204);
    await request("/api/mobile/my-rooms", { token: fresh.access_token, status: 401 });
    await request("/api/mobile/my-rooms", { token: second.access_token, status: 401 });
    const refresh = await authCall("/token?grant_type=refresh_token", { body: { refresh_token: second.refresh_token }, token: anonKey });
    assert.equal(refresh.status, 400);
    const recovered = await signIn(staged.accessCode);
    await request("/api/mobile/my-rooms", { token: recovered.access_token });
    result.containment = { banRejectedIssuedToken: true, globalSignoutRejectedBothSessions: true, refreshRejected: true, newCodeReauthenticationSucceeded: true, scope: "App endpoints perform Auth getUser; direct Data API JWT validation and hosted Auth-version behavior are not certified by this local test" };
    passed("Synthetic account containment: rotate code, reject old sign-in, ban blocks issued token/app access, global sign-out invalidates both sessions/refresh, new-code access recovers without deleting history");
    writeFileSync(join(output, "operational-drills.json"), JSON.stringify(result, null, 2));
    return result;
}
