import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const image = "public.ecr.aws/supabase/postgres@sha256:b15d862126dd2dac02da524696ccfde2dcce2ceaee0a58973b2727befe492706";
const applicationTables = ["attendance_events", "exam_sessions", "incidents", "room_assignments", "rooms", "student_allocations", "users"];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const identifier = (value) => `"${value.replaceAll('"', '""')}"`;

export const parseManifest = (text) => JSON.parse(text.replace(/^\uFEFF/, ""));

export function extractApplicationData(text) {
  const tables = new Map();
  const omitted = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const header = line.match(/^COPY "([^"]+)"\."([^"]+)" \((.+)\) FROM stdin;$/);
    if (header) {
      assert(!current, "Nested COPY block in backup");
      const [, schema, table, columns] = header;
      const names = [...columns.matchAll(/"([^"]+)"/g)].map((item) => item[1]);
      assert(names.length && names.map(identifier).join(", ") === columns, "Unexpected COPY column syntax");
      current = { schema, table, columns: names, rows: 0, lines: [line] };
      if (schema === "public") {
        assert(applicationTables.includes(table), "Unexpected public backup table");
        assert(!tables.has(table), "Duplicate public COPY block");
        tables.set(table, current);
      }
      continue;
    }
    if (!current) continue;
    current.lines.push(line);
    if (line === "\\.") {
      if (current.schema !== "public") omitted.push({ schema: current.schema, table: current.table, rows: current.rows });
      current = null;
    } else current.rows++;
  }
  assert(!current, "Unterminated COPY block in backup");
  assert.deepEqual([...tables.keys()].sort(), applicationTables, "Backup does not contain all seven application tables");
  return { tables, omitted, sql: [...tables.values()].map((table) => table.lines.join("\n")).join("\n") + "\n" };
}

export async function rehearse(backupDirectory) {
  const backup = resolve(backupDirectory);
  const manifest = parseManifest(readFileSync(join(backup, "manifest.json"), "utf8"));
  const expected = ["data.sql", "roles.sql", "schema.sql"];
  assert.deepEqual(manifest.files.map((entry) => entry.File).sort(), expected, "Unexpected backup manifest inventory");
  for (const entry of manifest.files) {
    const contents = readFileSync(join(backup, entry.File));
    assert.equal(contents.length, entry.Bytes, `Backup size mismatch: ${entry.File}`);
    assert.equal(sha256(contents), entry.SHA256.toLowerCase(), `Backup hash mismatch: ${entry.File}`);
  }
  const data = extractApplicationData(readFileSync(join(backup, "data.sql"), "utf8"));
  const release = JSON.parse(readFileSync(join(repository, "docs/PRODUCTION_MIGRATION_MANIFEST.json"), "utf8"));
  const migrationDirectory = join(repository, "supabase/migrations");
  assert.deepEqual(release.migrations.map((entry) => entry.file), readdirSync(migrationDirectory).filter((name) => name.endsWith(".sql")).sort());
  const migrations = release.migrations.map((entry) => {
    const sql = readFileSync(join(migrationDirectory, entry.file), "utf8").replaceAll("\r\n", "\n");
    assert.equal(sha256(sql), entry.sha256, `Release migration hash mismatch: ${entry.file}`);
    return sql;
  });
  const run = randomUUID();
  const container = `exampulse-private-rehearsal-${run}`;
  const output = join(dirname(backup), `application-rehearsal-${run}`);
  mkdirSync(output);
  const summary = {
    capturedAt: new Date().toISOString(), backupDirectory: backup, image,
    scope: "Seven public application tables; managed Auth/Storage data is NOT restored or certified.",
    sourceIdentity: "Owner-selected production backup; source project reference is not encoded in this backup manifest.",
    network: "none", publishedPorts: false, migrations: release.migrations,
    expectedCounts: Object.fromEntries([...data.tables].map(([name, table]) => [name, table.rows])),
    managedTablesNotRestored: data.omitted, phases: [], completed: false
  };
  const save = () => writeFileSync(join(output, "summary.json"), JSON.stringify(summary, null, 2));
  save();
  let logIndex = 0;
  let created = false;
  function docker(phase, args, input, timeout = 60000) {
    try {
      return execFileSync("docker", args, { input, encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      const log = `${++logIndex}-${phase.replace(/[^a-z0-9-]/gi, "-")}.log`;
      writeFileSync(join(output, log), String(error.stderr || "Command failed without stderr"));
      throw new Error(`${phase} failed; private diagnostic: ${join(output, log)}`);
    }
  }
  const psql = (phase, sql) => docker(phase, ["exec", "-i", container, "psql", "-X", "-q", "-A", "-t", "-U", "supabase_admin", "-d", "postgres", "--set", "ON_ERROR_STOP=1"], sql, 120000);
  const jsonQuery = (phase, sql) => {
    const lines = psql(phase, sql).split(/\r?\n/).filter((line) => line.startsWith("{"));
    assert.equal(lines.length, 1, `${phase}: expected one JSON result`);
    return JSON.parse(lines[0]);
  };
  const integrity = (phase) => {
    const value = jsonQuery(phase, readFileSync(join(repository, "supabase/tests/validate_relational_integrity.sql"), "utf8"));
    assert.equal(value.total, 0, `${phase}: integrity violations`);
    return value;
  };
  const fingerprints = (phase) => jsonQuery(phase, `select json_build_object(${[...data.tables].flatMap(([name, table]) => [
    `'${name}'`, `(select json_build_object('rows', count(*), 'digest', md5(coalesce(string_agg(md5(row_to_json(original)::text), '' order by md5(row_to_json(original)::text)), ''))) from (select ${table.columns.map(identifier).join(",")} from public.${identifier(name)}) original)`
  ]).join(",")});`);
  try {
    docker("image verification", ["image", "inspect", image, "--format", "{{.Id}}"]);
    docker("private container startup", ["run", "--detach", "--pull=never", "--name", container,
      "--network", "none", "--label", `exampulse.private-rehearsal=${run}`,
      "--tmpfs", "/var/lib/postgresql/data:rw,size=512m", "--shm-size", "256m",
      "--env", "POSTGRES_USER=supabase_admin", "--env", `POSTGRES_PASSWORD=${randomBytes(24).toString("hex")}`,
      "--env", "PGDATA=/var/lib/postgresql/data", image,
      "postgres", "-D", "/etc/postgresql", "-c", "shared_buffers=128MB", "-c", "max_connections=30"]);
    created = true;
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      const status = docker("startup state", ["inspect", container, "--format", "{{.State.Running}}"]);
      if (status.trim() !== "true") {
        writeFileSync(join(output, "startup.log"), docker("startup logs", ["logs", container]));
        throw new Error(`Private PostgreSQL startup failed; see ${join(output, "startup.log")}`);
      }
      try {
        const processName = execFileSync("docker", ["exec", container, "cat", "/proc/1/comm"], { encoding: "utf8", stdio: "pipe", timeout: 3000, windowsHide: true });
        if (!["postgres", ".postgres-wrapp"].includes(processName.trim())) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        execFileSync("docker", ["exec", container, "psql", "-X", "-A", "-t", "-U", "supabase_admin", "-d", "postgres", "-c", "select 1"], { stdio: "pipe", timeout: 3000, windowsHide: true });
        const initialized = psql("bootstrap probe", "select to_regprocedure('auth.uid()') is not null and exists(select 1 from pg_roles where rolname = 'service_role');");
        if (initialized.trim() === "t") { ready = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert(ready, "Private PostgreSQL did not initialize within the startup bound");
    const isolation = JSON.parse(docker("isolation inspection", ["inspect", container]))[0];
    assert.equal(isolation.HostConfig.NetworkMode, "none");
    assert(!isolation.HostConfig.PortBindings || Object.keys(isolation.HostConfig.PortBindings).length === 0);
    const coreCount = psql("empty target preflight", "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('users','exam_sessions','rooms','room_assignments','student_allocations','attendance_events','incidents');");
    assert.equal(coreCount.trim(), "0", "Private restore target is not empty");
    psql("roles and application schema restore", `begin;\n${readFileSync(join(backup, "roles.sql"), "utf8")}\n${readFileSync(join(backup, "schema.sql"), "utf8")}\ncommit;`);
    psql("application data restore", `begin; set local session_replication_role=replica;\n${data.sql}\ncommit;`);
    const before = fingerprints("restored table fingerprints");
    for (const [name, expectedRows] of Object.entries(summary.expectedCounts)) assert.equal(before[name].rows, expectedRows, `Restore count mismatch: ${name}`);
    summary.integrityBefore = integrity("restored integrity");
    summary.restored = before; summary.phases.push("Seven application tables restored with exact backup counts and zero relational-integrity violations"); save();
    for (const pass of ["upgrade", "idempotency"]) {
      psql(`${pass} migration bundle`, `begin; set local lock_timeout='5s'; set local statement_timeout='30s';\n${migrations.join("\n")}\ncommit;`);
      const after = fingerprints(`${pass} original-column fingerprints`);
      assert.deepEqual(after, before, `${pass}: original production rows changed`);
      psql(`${pass} audit and business conflict regression`, readFileSync(join(repository, "supabase/tests/admin_audit_events_staging.sql"), "utf8"));
      assert.deepEqual(fingerprints(`${pass} post-test fingerprints`), before, `${pass}: regression fixtures escaped rollback`);
      summary.phases.push(`${pass}: all ${migrations.length} migrations, original-column fingerprints and rollback-only audit/conflict regression passed`); save();
    }
    psql("operations regression", readFileSync(join(repository, "supabase/tests/operational_monitoring_staging.sql"), "utf8"));
    summary.integrityAfter = integrity("upgraded integrity");
    summary.catalog = jsonQuery("upgraded catalog", readFileSync(join(repository, "supabase/tests/production_readiness_snapshot.sql"), "utf8"));
    assert(summary.catalog.tables.every((table) => table.present && table.rlsEnabled));
    assert(summary.catalog.legacyCoreAccess.every((routine) => routine.present && routine.serviceRoleExecute === false));
    assert.deepEqual(fingerprints("final original-column fingerprints"), before);
    summary.completed = true; save();
  } catch (error) {
    summary.error = error.message; save(); throw error;
  } finally {
    if (created) {
      const label = docker("cleanup ownership verification", ["inspect", container, "--format", '{{index .Config.Labels "exampulse.private-rehearsal"}}']).trim();
      assert.equal(label, run, "Refusing to remove a container not owned by this rehearsal");
      docker("private container removal", ["rm", "--force", container]);
      summary.privateContainerRemoved = true; save();
    }
    console.log(JSON.stringify({ completed: summary.completed, privateContainerRemoved: summary.privateContainerRemoved || false, outputDirectory: output, scope: summary.scope, phases: summary.phases, error: summary.error }, null, 2));
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const index = process.argv.indexOf("--backup-directory");
  if (!process.argv.includes("--confirm-private-rehearsal") || index < 0 || !process.argv[index + 1]) {
    console.error("Requires --confirm-private-rehearsal --backup-directory <verified local backup directory>. Never accepts a database URL.");
    process.exitCode = 1;
  } else {
    try { await rehearse(process.argv[index + 1]); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
