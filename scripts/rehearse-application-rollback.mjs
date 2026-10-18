import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { execFileSync, execFile, spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync, openSync, closeSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ExcelJS = createRequire(join(repository, "apps/admin/package.json"))("exceljs");
const postgresImage = "public.ecr.aws/supabase/postgres@sha256:b15d862126dd2dac02da524696ccfde2dcce2ceaee0a58973b2727befe492706";
const authImage = "supabase/gotrue@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b";
const restImage = "postgrest/postgrest@sha256:c7cd7e265a85b05248abf53f4473fcec7e327c282d0bd0cf60f1551996d09fcf";
const nodeImage = "node@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392";
const fallback = "04da701";
const candidate = "72d8b4e";
const run = randomUUID();
const output = join(repository, "test-results", `rollback-rehearsal-${run}`);
const prefix = `exampulse-private-rollback-${run}`;
const pg = `${prefix}-db`, auth = `${prefix}-auth`, rest = `${prefix}-rest`, bridge = `${prefix}-bridge`;
const created = [];
const summary = { capturedAt: new Date().toISOString(), candidate, fallback, scope: "Synthetic-only local Next production-build restart/fallback against the full upgraded application schema; no live deployment or restored production data", postgresImage, authImage, restImage, nodeImage, phases: [], completed: false };
const git = (...args) => execFileSync("git", args, { cwd: repository, encoding: "utf8", stdio: "pipe", windowsHide: true });
mkdirSync(output, { recursive: true });
const save = () => writeFileSync(join(output, "summary.json"), JSON.stringify(summary, null, 2));
function docker(phase, args, input, timeout = 60000) {
    try {
        return execFileSync("docker", args, { input, encoding: "utf8", stdio: "pipe", windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 });
    }
    catch (error) {
        writeFileSync(join(output, `${phase.replace(/[^a-z0-9-]/gi, "-")}.log`), String(error.stderr || "Command failed without stderr"));
        throw new Error(`${phase} failed; diagnostic saved privately`);
    }
}
const psql = (phase, sql) => docker(phase, ["exec", "-i", pg, "psql", "-X", "-qAt", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], sql, 120000);
const query = (phase, sql) => JSON.parse(psql(phase, sql).trim());
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let gateway, child, runtimeLog;
async function stopApp() {
    if (child && child.exitCode === null) {
        const stopped = new Promise(resolve => child.once("exit", resolve));
        child.kill();
        await Promise.race([stopped, pause(5000)]);
        assert(child.exitCode !== null || child.signalCode !== null, "Local application did not stop");
    }
    child = null;
    if (runtimeLog !== undefined) {
        closeSync(runtimeLog);
        runtimeLog = undefined;
    }
}
try {
    assert(process.argv.includes("--confirm-private-rehearsal"), "Requires --confirm-private-rehearsal; uses only synthetic local data");
    summary.candidate = git("rev-parse", `${candidate}^{commit}`).trim();
    summary.fallback = git("rev-parse", `${fallback}^{commit}`).trim();
    summary.applicationSourceIdentical = !git("diff", "--name-only", fallback, candidate, "--", "apps/admin", "packages/shared", "package-lock.json").trim();
    assert(summary.applicationSourceIdentical, "Review changed application source before reusing this bounded fallback scenario");
    save();
    for (const image of [postgresImage, authImage, restImage, nodeImage])
        docker("image verification", ["image", "inspect", image, "--format", "{{.Id}}"]);
    const password = randomBytes(24).toString("hex"), jwtSecret = randomBytes(32).toString("hex");
    const jwt = (role) => {
        const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
        const payload = Buffer.from(JSON.stringify({ role, iss: "private-rehearsal", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 7200 })).toString("base64url");
        return `${header}.${payload}.${createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url")}`;
    };
    const serviceKey = jwt("service_role"), anonKey = jwt("anon");
    const start = (name, image, args = [], env = [], network = `container:${pg}`) => {
        docker("start private service", ["run", "-d", "--pull=never", "--name", name, "--network", network, "--label", `exampulse.private-rollback=${run}`, ...env.flatMap(value => ["-e", value]), image, ...args]);
        created.push(name);
    };
    docker("start private postgres", ["run", "-d", "--pull=never", "--name", pg, "--network", "none", "--label", `exampulse.private-rollback=${run}`, "--tmpfs", "/var/lib/postgresql/data:rw,size=512m", "--shm-size", "256m", "-e", "POSTGRES_USER=supabase_admin", "-e", `POSTGRES_PASSWORD=${password}`, "-e", "PGDATA=/var/lib/postgresql/data", postgresImage, "postgres", "-D", "/etc/postgresql", "-c", "shared_buffers=128MB", "-c", "max_connections=30"]);
    created.push(pg);
    let ready = false;
    for (let i = 0; i < 90; i++) {
        try {
            const name = docker("startup process", ["exec", pg, "cat", "/proc/1/comm"]).trim();
            if (["postgres", ".postgres-wrapp"].includes(name) && psql("bootstrap", "select to_regprocedure('auth.uid()') is not null;").trim() === "t") {
                ready = true;
                break;
            }
        }
        catch { }
        await pause(1000);
    }
    assert(ready, "Private database startup bound exceeded");
    psql("local service roles", `alter role supabase_auth_admin password '${password}'; alter role authenticator login password '${password}'; grant anon,authenticated,service_role to authenticator;`);
    start(auth, authImage, ["auth"], ["GOTRUE_DB_DRIVER=postgres", "GOTRUE_DB_NAMESPACE=auth", `GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${password}@127.0.0.1:5432/postgres?sslmode=disable`, "GOTRUE_API_HOST=127.0.0.1", "GOTRUE_API_PORT=9999", "GOTRUE_SITE_URL=http://127.0.0.1", "API_EXTERNAL_URL=http://127.0.0.1:9999", `GOTRUE_JWT_SECRET=${jwtSecret}`, "GOTRUE_JWT_ADMIN_ROLES=service_role", "GOTRUE_JWT_AUD=authenticated", "GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated", "GOTRUE_EXTERNAL_EMAIL_ENABLED=true", "GOTRUE_MAILER_AUTOCONFIRM=true", "GOTRUE_DISABLE_SIGNUP=true"]);
    start(bridge, nodeImage, ["node", "-e", "setInterval(()=>{},60000)"]);
    // The host proxy can reach only fixed loopback endpoints inside the network-disabled namespace.
    gateway = createServer(async (req, res) => {
        try {
            const isAuth = req.url.startsWith("/auth/v1/");
            const isRest = req.url.startsWith("/rest/v1/");
            if (!isAuth && !isRest) {
                res.writeHead(404);
                res.end();
                return;
            }
            const chunks = [];
            for await (const chunk of req)
                chunks.push(chunk);
            const path = req.url.slice(isAuth ? "/auth/v1".length : "/rest/v1".length);
            const headers = { ...req.headers, host: "127.0.0.1", "accept-encoding": "identity" };
            delete headers["content-length"];
            const input = JSON.stringify({ url: `http://127.0.0.1:${isAuth ? 9999 : 3001}${path}`, method: req.method, headers, body: Buffer.concat(chunks).toString("base64") });
            const code = "let s='';for await(const x of process.stdin)s+=x;const q=JSON.parse(s);const r=await fetch(q.url,{method:q.method,headers:q.headers,...(q.body?{body:Buffer.from(q.body,'base64')}:{})});console.log(JSON.stringify({status:r.status,headers:Object.fromEntries(r.headers),cookies:r.headers.getSetCookie(),body:Buffer.from(await r.arrayBuffer()).toString('base64')}));";
            const result = await new Promise((resolve, reject) => {
                const p = execFile("docker", ["exec", "-i", bridge, "node", "--input-type=module", "-e", code], { encoding: "utf8", windowsHide: true, timeout: 20000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => error ? reject(new Error("Private upstream request failed")) : resolve(JSON.parse(stdout)));
                p.stdin.end(input);
            });
            for (const key of ["content-length", "content-encoding", "transfer-encoding", "connection", "set-cookie"])
                delete result.headers[key];
            if (result.cookies.length)
                result.headers["set-cookie"] = result.cookies;
            res.writeHead(result.status, result.headers);
            res.end(Buffer.from(result.body, "base64"));
        }
        catch {
            res.writeHead(502);
            res.end("Private upstream unavailable");
        }
    });
    await new Promise(resolve => gateway.listen(0, "127.0.0.1", resolve));
    const backend = `http://127.0.0.1:${gateway.address().port}`;
    let authReady = false;
    for (let i = 0; i < 30; i++) {
        if ((await fetch(`${backend}/auth/v1/health`)).ok) {
            authReady = true;
            break;
        }
        await pause(1000);
    }
    assert(authReady, "Local Auth did not become healthy");
    const release = JSON.parse(readFileSync(join(repository, "docs/PRODUCTION_MIGRATION_MANIFEST.json"), "utf8"));
    const migrations = release.migrations.map(entry => {
        const text = readFileSync(join(repository, "supabase/migrations", entry.file), "utf8").replaceAll("\r\n", "\n");
        assert.equal(createHash("sha256").update(text).digest("hex"), entry.sha256, "Migration hash mismatch");
        return text;
    });
    psql("synthetic upgraded application schema", `begin;\n${readFileSync(join(repository, "supabase/schema.sql"), "utf8")}\n${migrations.join("\n")}\ncommit;`);
    start(rest, restImage, [], [`PGRST_DB_URI=postgres://authenticator:${password}@127.0.0.1:5432/postgres`, "PGRST_DB_SCHEMAS=public", "PGRST_DB_ANON_ROLE=anon", `PGRST_JWT_SECRET=${jwtSecret}`, "PGRST_SERVER_HOST=127.0.0.1", "PGRST_SERVER_PORT=3001"]);
    for (const name of created) {
        const state = JSON.parse(docker("private isolation inspection", ["inspect", name]))[0];
        const databaseId = JSON.parse(docker("private database identity", ["inspect", pg]))[0].Id;
        assert.equal(state.HostConfig.NetworkMode, name === pg ? "none" : `container:${databaseId}`, "Private network isolation mismatch");
        assert(!state.HostConfig.PortBindings || !Object.keys(state.HostConfig.PortBindings).length);
    }
    summary.phases.push("All 20 reviewed migrations applied to a fresh synthetic-only database; Auth/REST services have no external network or published ports");
    save();
    const authRequest = async (path, body, key = serviceKey) => {
        const r = await fetch(`${backend}/auth/v1${path}`, { method: "POST", headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" }, body: JSON.stringify(body) });
        assert.equal(r.status, 200, "Local Auth request failed");
        return r.json();
    };
    const adminPassword = randomBytes(24).toString("hex");
    const invPassword = `AMS-${randomBytes(2).toString("hex").toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
    const admin = await authRequest("/admin/users", { email: "rollback-admin@example.com", password: adminPassword, email_confirm: true });
    const inv = await authRequest("/admin/users", { email: "rollback-invigilator@example.com", password: invPassword, email_confirm: true });
    const adminToken = (await authRequest("/token?grant_type=password", { email: admin.email, password: adminPassword }, anonKey)).access_token;
    const invToken = (await authRequest("/token?grant_type=password", { email: inv.email, password: invPassword }, anonKey)).access_token;
    assert(adminToken && invToken, "Synthetic authentication failed");
    const session = randomUUID(), roomA = randomUUID(), roomB = randomUUID(), draft = randomUUID();
    psql("synthetic rollback fixture", `insert into public.users(id,email,full_name,role,access_code_hash) values ('${admin.id}','rollback-admin@example.com','Rollback Admin','admin',null),('${inv.id}','rollback-invigilator@example.com','Rollback Invigilator','invigilator','${createHash("sha256").update(invPassword).digest("hex")}');
    insert into public.exam_sessions(id,name,exam_date,start_time,created_by,import_room_count,import_student_count,import_checksum) values ('${session}','PRIVATE ROLLBACK CHECK','2026-10-19','09:00','${admin.id}',2,4,'synthetic-local'),('${draft}','PRIVATE DELETE CHECK','2026-10-19','09:00','${admin.id}',0,0,'synthetic-local');
    insert into public.rooms(id,exam_session_id,code,display_name) values ('${roomA}','${session}','RB-A','Rollback A'),('${roomB}','${session}','RB-B','Rollback B');
    insert into public.room_assignments(room_id,user_id) values ('${roomA}','${inv.id}'),('${roomB}','${inv.id}');
    insert into public.student_allocations(exam_session_id,student_id,student_name,room_id,zone) values ('${session}','9900101','Synthetic One','${roomA}','A'),('${session}','9900102','Synthetic Two','${roomA}','A'),('${session}','9900103','Synthetic Three','${roomB}','B'),('${session}','9900104','Synthetic Four','${roomB}','B');`);
    const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|HOMEDRIVE|HOMEPATH|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE)$/i.test(key)));
    const env = { ...cleanEnv, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", SUPABASE_URL: backend, NEXT_PUBLIC_SUPABASE_URL: backend, SUPABASE_SERVICE_ROLE_KEY: serviceKey, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: anonKey, RATE_LIMIT_SECRET: randomBytes(32).toString("hex"), OPS_TELEMETRY_ENABLED: "false", OPS_ALERTS_ENABLED: "false" };
    const nextBin = createRequire(join(repository, "apps/admin/package.json")).resolve("next/dist/bin/next");
    const sources = [];
    for (const [label, ref] of [["candidate", summary.candidate], ["fallback", summary.fallback]]) {
        const source = join(output, label);
        mkdirSync(source);
        const archive = join(output, `${label}.tar`);
        git("archive", "--format=tar", `--output=${archive}`, ref, "--", "apps/admin", "packages/shared", "package.json", "package-lock.json", "tsconfig.base.json");
        execFileSync("tar", ["-xf", archive, "-C", source], { stdio: "pipe", windowsHide: true });
        for (const dir of [source, join(source, "apps/admin")]) {
            for (const file of [".env", ".env.local", ".env.production", ".env.production.local"])
                assert(!existsSync(join(dir, file)), "Exported application contains an environment file");
        }
        symlinkSync(join(repository, "node_modules"), join(source, "node_modules"), "junction");
        symlinkSync(join(repository, "apps/admin/node_modules"), join(source, "apps/admin/node_modules"), "junction");
        const log = openSync(join(output, `${label}-build.log`), "w");
        try {
            await new Promise((resolve, reject) => {
                const p = spawn(process.execPath, [nextBin, "build"], { cwd: join(source, "apps/admin"), env, windowsHide: true, stdio: ["ignore", log, log] });
                const timer = setTimeout(() => { p.kill(); reject(new Error(`${label} build exceeded timeout`)); }, 240000);
                p.once("error", error => { clearTimeout(timer); reject(error); });
                p.once("exit", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`${label} build failed; inspect private build log`)); });
            });
        }
        finally {
            closeSync(log);
        }
        sources.push({ label, source, buildId: readFileSync(join(source, "apps/admin/.next/BUILD_ID"), "utf8").trim() });
    }
    summary.builds = sources.map(({ label, buildId }) => ({ label, buildId }));
    summary.phases.push("Candidate and pinned fallback independently production-built from Git exports without loading local environment files");
    save();
    const portProbe = createServer();
    await new Promise(resolve => portProbe.listen(0, "127.0.0.1", resolve));
    const appPort = portProbe.address().port;
    await new Promise(resolve => portProbe.close(resolve));
    const base = `http://127.0.0.1:${appPort}`;
    const startApp = async (source, label) => {
        runtimeLog = openSync(join(output, `${label}-runtime.log`), "w");
        child = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(appPort)], { cwd: join(source, "apps/admin"), env: { ...env, APP_BASE_URL: base, NEXT_PUBLIC_APP_BASE_URL: base }, windowsHide: true, stdio: ["ignore", runtimeLog, runtimeLog] });
        for (let i = 0; i < 60; i++) {
            assert(child.exitCode === null, `${label} server exited`);
            try {
                if ((await fetch(`${base}/login`)).ok)
                    return;
            }
            catch { }
            await pause(500);
        }
        throw new Error(`${label} server readiness bound exceeded`);
    };
    const request = async (path, { token = adminToken, body, form, status = 200, cookie } = {}) => {
        const r = await fetch(base + path, { redirect: "manual", method: body !== undefined || form ? "POST" : "GET", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(cookie ? { cookie } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) }, ...(form ? { body: form } : body !== undefined ? { body: JSON.stringify(body) } : {}) });
        if (r.status !== status) {
            writeFileSync(join(output, "last-http-error.json"), JSON.stringify({ path, status: r.status, body: await r.text() }));
            throw new Error(`Local ${path} expected ${status}, received ${r.status}; private diagnostic saved`);
        }
        return r;
    };
    const mark = (studentId, more = {}) => ({ examSessionId: session, roomId: roomA, studentId, userId: inv.id, requestId: randomUUID(), source: "manual", action: "mark_present", deviceId: "private-rollback", ...more });
    await startApp(sources[0].source, "candidate");
    const login = await request("/api/auth/admin-login", { token: null, body: { email: admin.email, password: adminPassword } });
    const cookies = login.headers.getSetCookie().map(x => x.split(";")[0]).join("; ");
    assert(cookies, "Admin login did not set session cookies");
    assert.equal((await (await request("/api/auth/me", { token: null, cookie: cookies })).json()).user.role, "admin");
    await request(`/api/exam-sessions/${session}/publish`, { body: {}, status: 303 });
    const originalRequest = mark("9900101");
    const first = await (await request("/api/attendance/mark", { token: invToken, body: originalRequest })).json();
    assert(first.event?.id);
    const baseline = query("committed attendance fingerprint", `select json_build_object('events',count(*),'digest',md5(string_agg(row_to_json(e)::text,'' order by id))) from public.attendance_events e;`);
    summary.phases.push("Candidate admin password/cookie login, publication and first invigilator attendance commit passed");
    save();
    await stopApp();
    await startApp(sources[1].source, "fallback");
    assert.deepEqual(query("post-restart attendance fingerprint", `select json_build_object('events',count(*),'digest',md5(string_agg(row_to_json(e)::text,'' order by id))) from public.attendance_events e;`), baseline);
    assert.equal((await (await request("/api/auth/me", { token: null, cookie: cookies })).json()).user.role, "admin");
    const replay = await (await request("/api/attendance/mark", { token: invToken, body: originalRequest })).json();
    assert.equal(replay.event?.id, first.event.id);
    const duplicate = await (await request("/api/attendance/mark", { token: invToken, body: mark("9900101") })).json();
    assert.equal(duplicate.result.status, "already_marked");
    await request("/api/attendance/mark", { token: invToken, body: { ...originalRequest, studentId: "9900102" }, status: 409 });
    const lookup = await (await request("/api/attendance/lookup", { token: invToken, body: { examSessionId: session, roomId: roomA, studentId: "9900102" } })).json();
    assert.equal(lookup.result.status, "ready_to_mark");
    const second = await (await request("/api/attendance/mark", { token: invToken, body: mark("9900102") })).json();
    assert(second.event?.id && second.event.id !== first.event.id);
    await request("/api/attendance/mark", { token: invToken, body: mark("9900103"), status: 422 });
    await request("/api/attendance/mark", { token: invToken, body: mark("9900103", { overrideWrongRoom: true }) });
    const report = await request(`/api/reports/${session}/export`);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await report.arrayBuffer()));
    assert.equal(book.getWorksheet("Attendance").rowCount - 1, 3);
    assert.equal(book.getWorksheet("Register").rowCount - 1, 4);
    await request(`/api/exam-sessions/${session}/close`, { body: {}, status: 303 });
    await request("/api/attendance/mark", { token: invToken, body: mark("9900104"), status: 409 });
    const form = new FormData();
    form.set("confirmationName", "PRIVATE DELETE CHECK");
    await request(`/api/exam-sessions/${draft}/delete`, { form, status: 303 });
    const evidence = query("fallback database assertions", `select json_build_object('attendance', (select count(*) from public.attendance_events where exam_session_id='${session}'),'closed', (select status='closed' from public.exam_sessions where id='${session}'),'draftDeleted',not exists(select 1 from public.exam_sessions where id='${draft}'),'deleteAudited',exists(select 1 from public.admin_audit_events where action='exam_deleted' and entity_id='${draft}'),'emailDeliveries',(select count(*) from public.email_deliveries));`);
    assert.equal(evidence.attendance, 3);
    assert(evidence.closed && evidence.draftDeleted && evidence.deleteAudited);
    assert.equal(evidence.emailDeliveries, 0);
    const integrity = query("final relational integrity", readFileSync(join(repository, "supabase/tests/validate_relational_integrity.sql"), "utf8"));
    assert.equal(integrity.total, 0);
    summary.evidence = evidence;
    summary.integrityTotal = integrity.total;
    summary.phases.push("Fallback preserved existing cookies and committed attendance; identical replay, duplicate, changed-request conflict, lookup, new mark, wrong-room validation/override, export, closure and audited draft deletion passed");
    summary.completed = true;
    save();
}
catch (error) {
    summary.error = String(error.message).split("\n")[0];
    save();
    process.exitCode = 1;
}
finally {
    await stopApp();
    if (gateway)
        await new Promise(resolve => gateway.close(resolve));
    for (const name of created.reverse()) {
        assert.equal(docker("cleanup ownership", ["inspect", name, "--format", '{{index .Config.Labels "exampulse.private-rollback"}}']).trim(), run, "Refusing unrelated container cleanup");
        docker("private service removal", ["rm", "--force", name]);
    }
    summary.privateContainersRemoved = true;
    save();
    console.log(JSON.stringify({ completed: summary.completed, outputDirectory: output, privateContainersRemoved: true, phases: summary.phases, error: summary.error }, null, 2));
}
