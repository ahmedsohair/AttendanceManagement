import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { extractApplicationData, parseManifest } from "./rehearse-production-application-backup.mjs";

const postgresImage = "public.ecr.aws/supabase/postgres@sha256:b15d862126dd2dac02da524696ccfde2dcce2ceaee0a58973b2727befe492706";
const authImage = "supabase/gotrue@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b";
const expectedTables = ["audit_log_entries", "custom_oauth_providers", "flow_state", "identities", "instances", "mfa_amr_claims", "mfa_challenges", "mfa_factors", "mfa_recovery_code_sets", "mfa_recovery_codes", "oauth_authorizations", "oauth_client_states", "oauth_clients", "oauth_consents", "one_time_tokens", "refresh_tokens", "saml_providers", "saml_relay_states", "scim_tokens", "scim_users", "sessions", "sso_domains", "sso_providers", "users", "webauthn_challenges", "webauthn_credentials"];
const identifier = (value) => `"${value.replaceAll('"', '""')}"`;
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function extractManagedAuthData(text) {
  const tables = new Map();
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("COPY ") && !current) {
      const header = line.match(/^COPY "([^"]+)"\."([^"]+)" \((.+)\) FROM stdin;$/);
      assert(header, "Unexpected COPY header syntax");
      const [, schema, name, columns] = header;
      const names = [...columns.matchAll(/"([^"]+)"/g)].map((item) => item[1]);
      assert(names.length && names.map(identifier).join(", ") === columns, "Unexpected COPY column syntax");
      assert.equal(new Set(names).size, names.length, "Duplicate COPY column");
      current = { schema, name, columns: names, rows: 0, lines: [line] };
      if (schema === "auth") {
        assert(expectedTables.includes(name), "Unexpected Auth table; review backup inventory before restoring");
        assert(!tables.has(name), "Duplicate Auth COPY block");
        tables.set(name, current);
      }
      continue;
    }
    if (!current) continue;
    assert(!line.startsWith("COPY "), "Nested COPY header");
    current.lines.push(line);
    if (line === "\\.") current = null;
    else current.rows++;
  }
  assert(!current, "Unterminated COPY block");
  assert.deepEqual([...tables.keys()].sort(), expectedTables, "Backup must contain all 26 reviewed Auth tables");
  return { tables, sql: [...tables.values()].map((table) => table.lines.join("\n")).join("\n") + "\n" };
}

export async function rehearseManagedAuth(backupDirectory) {
  const backup = resolve(backupDirectory);
  const manifest = parseManifest(readFileSync(join(backup, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.files.map((entry) => entry.File).sort(), ["data.sql", "roles.sql", "schema.sql"]);
  for (const entry of manifest.files) {
    const contents = readFileSync(join(backup, entry.File));
    assert.equal(contents.length, entry.Bytes, `Backup size mismatch: ${entry.File}`);
    assert.equal(sha256(contents), entry.SHA256.toLowerCase(), `Backup hash mismatch: ${entry.File}`);
  }
  const dump = readFileSync(join(backup, "data.sql"), "utf8");
  const data = extractManagedAuthData(dump);
  const profiles = extractApplicationData(dump).tables.get("users");
  const sourceIds = (table) => {
    const index = table.columns.indexOf("id");
    assert(index >= 0, "Source identity table has no ID column");
    return new Set(table.lines.slice(1, -1).map((line) => line.split("\t")[index]));
  };
  const authIds = sourceIds(data.tables.get("users")), profileIds = sourceIds(profiles);
  const run = randomUUID();
  const container = `exampulse-private-auth-${run}`;
  const migrator = `${container}-migrate`;
  const output = join(dirname(backup), `auth-rehearsal-${run}`);
  mkdirSync(output);
  const summary = {
    capturedAt: new Date().toISOString(), backupDirectory: backup, postgresImage, authImage,
    scope: "Managed Auth data round-trip against official migrated schema; no Auth server, production login/session replay or provider/signing-key recovery.",
    network: "none", publishedPorts: false, completed: false,
    sourceIdentityCoverage: {
      authUsersWithoutPublicProfile: [...authIds].filter((id) => !profileIds.has(id)).length,
      publicProfilesWithoutAuthUser: [...profileIds].filter((id) => !authIds.has(id)).length,
      scope: "Source-backup ID relationships only; public table preservation is verified in the separate application-data rehearsal. No orphan profile is repaired or deleted."
    },
    expectedCounts: Object.fromEntries([...data.tables].map(([name, table]) => [name, table.rows])),
    phases: []
  };
  const save = () => writeFileSync(join(output, "summary.json"), JSON.stringify(summary, null, 2));
  save();
  function docker(phase, args, input, timeout = 60000) {
    try {
      return execFileSync("docker", args, { input, encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true, stdio: "pipe" });
    } catch (error) {
      const log = `${phase.replace(/[^a-z0-9-]/gi, "-")}.log`;
      writeFileSync(join(output, log), String(error.stderr || "Command failed without stderr"));
      throw new Error(`${phase} failed; diagnostic retained privately in ${join(output, log)}`);
    }
  }
  const psql = (phase, sql) => docker(phase, ["exec", "-i", container, "psql", "-X", "-qAt", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], sql, 120000);
  const json = (phase, sql) => JSON.parse(psql(phase, sql).trim());
  const snapshots = (phase) => json(phase, `select json_build_object(${[...data.tables].flatMap(([name, table]) => [literal(name), `(select json_build_object('rows', count(*), 'digest', md5(coalesce(string_agg(md5(row_to_json(original)::text), '' order by md5(row_to_json(original)::text)), ''))) from (select ${table.columns.map(identifier).join(",")} from auth.${identifier(name)}) original)`]).join(",")});`);
  const created = [];
  try {
    for (const image of [postgresImage, authImage]) docker("image verification", ["image", "inspect", image, "--format", "{{.Id}}"]);
    const password = randomBytes(24).toString("hex");
    docker("private postgres startup", ["run", "--detach", "--pull=never", "--name", container, "--network", "none", "--label", `exampulse.private-auth=${run}`, "--tmpfs", "/var/lib/postgresql/data:rw,size=512m", "--shm-size", "256m", "-e", "POSTGRES_USER=supabase_admin", "-e", `POSTGRES_PASSWORD=${password}`, "-e", "PGDATA=/var/lib/postgresql/data", postgresImage, "postgres", "-D", "/etc/postgresql", "-c", "shared_buffers=128MB", "-c", "max_connections=30"]);
    created.push(container);
    let ready = false;
    for (let attempt = 0; attempt < 90; attempt++) {
      try {
        const name = docker("startup process", ["exec", container, "cat", "/proc/1/comm"]).trim();
        if (["postgres", ".postgres-wrapp"].includes(name) && psql("bootstrap", "select to_regprocedure('auth.uid()') is not null;").trim() === "t") { ready = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert(ready, "Private PostgreSQL did not initialize within the startup bound");
    const isolation = JSON.parse(docker("postgres isolation", ["inspect", container]))[0];
    assert.equal(isolation.HostConfig.NetworkMode, "none");
    assert(!isolation.HostConfig.PortBindings || !Object.keys(isolation.HostConfig.PortBindings).length);
    psql("local auth role", `alter role supabase_auth_admin password '${password}';`);
    docker("create auth migrator", ["create", "--pull=never", "--name", migrator, "--network", `container:${container}`, "--label", `exampulse.private-auth=${run}`, "-e", "GOTRUE_DB_DRIVER=postgres", "-e", "GOTRUE_DB_NAMESPACE=auth", "-e", `GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${password}@127.0.0.1:5432/postgres?sslmode=disable`, "-e", "GOTRUE_SITE_URL=http://127.0.0.1", "-e", "API_EXTERNAL_URL=http://127.0.0.1:9999", "-e", `GOTRUE_JWT_SECRET=${randomBytes(32).toString("hex")}`, authImage, "auth", "migrate"]);
    created.push(migrator);
    docker("official auth schema migrations", ["start", "--attach", migrator], undefined, 120000);
    assert.equal(JSON.parse(docker("migration exit status", ["inspect", migrator]))[0].State.ExitCode, 0, "Official Auth migration process failed");
    const columns = json("auth schema inventory", "select coalesce(json_object_agg(table_name, columns), '{}'::json) from (select table_name, json_agg(column_name order by ordinal_position) columns from information_schema.columns where table_schema='auth' group by table_name) q;");
    for (const [name, table] of data.tables) {
      assert(columns[name], `Managed Auth schema missing table: ${name}`);
      for (const column of table.columns) assert(columns[name].includes(column), `Managed Auth schema missing column: ${name}.${column}`);
    }
    const empty = snapshots("empty managed target");
    assert(Object.values(empty).every((value) => value.rows === 0), "Refusing Auth restore into a nonempty target");
    summary.phases.push("Official Auth migration-only schema created; all 26 backup tables and original columns verified"); save();
    psql("private auth restore", `begin; set local session_replication_role=replica;\n${data.sql}\ncommit;`);
    const restored = snapshots("restored original columns");
    for (const [name, table] of data.tables) assert.equal(restored[name].rows, table.rows, `Restored Auth count mismatch: ${name}`);
    // COPY the original columns back through PostgreSQL to verify its actual stored values.
    for (const [name, table] of data.tables) {
      const roundTrip = psql(`roundtrip-${name}`, `copy (select ${table.columns.map(identifier).join(",")} from auth.${identifier(name)}) to stdout;`);
      const actual = roundTrip.split(/\r?\n/); if (actual.at(-1) === "") actual.pop();
      const expected = table.lines.slice(1, -1);
      assert.deepEqual(actual.sort(), expected.sort(), `Auth original-column COPY round-trip mismatch: ${name}`);
    }
    summary.restored = restored;
    summary.phases.push("All original Auth rows/columns restored and exact COPY round-trips passed, including users, identities, sessions and refresh tokens"); save();
    const foreignKeys = psql("auth foreign key integrity", `do $$ declare r record; v_count bigint; begin
      for r in select c.oid, c.conrelid::regclass child, c.confrelid::regclass parent, c.confmatchtype,
        (select string_agg(format('x.%I is not null', a.attname), ' and ' order by k.i) from unnest(c.conkey) with ordinality k(num,i) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num) required,
        (select string_agg(format('p.%I=x.%I', b.attname,a.attname), ' and ' order by k.i) from unnest(c.conkey,c.confkey) with ordinality k(num,ref,i) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num join pg_attribute b on b.attrelid=c.confrelid and b.attnum=k.ref) matches
        from pg_constraint c join pg_namespace n on n.oid=c.connamespace where c.contype='f' and n.nspname='auth'
      loop
        if r.confmatchtype <> 's' then raise exception 'Unreviewed Auth foreign-key match mode'; end if;
        execute format('select count(*) from %s x where %s and not exists (select 1 from %s p where %s)', r.child,r.required,r.parent,r.matches) into v_count;
        if v_count <> 0 then raise exception 'Restored Auth foreign-key violations detected'; end if;
      end loop;
    end $$; select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where c.contype='f' and n.nspname='auth';`);
    summary.foreignKeysChecked = Number(foreignKeys.trim());
    assert(summary.foreignKeysChecked > 0);
    const sequences = json("managed sequence inventory", "select coalesce(json_agg(json_build_object('table',t.relname,'column',a.attname,'sequence',pg_get_serial_sequence(format('%I.%I',n.nspname,t.relname),a.attname))), '[]'::json) from pg_attribute a join pg_class t on t.oid=a.attrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='auth' and a.attnum>0 and not a.attisdropped and pg_get_serial_sequence(format('%I.%I',n.nspname,t.relname),a.attname) is not null;");
    for (const entry of sequences) {
      assert(data.tables.has(entry.table), "Unexpected managed sequence owner");
      psql("restore auth sequence position", `select setval(${literal(entry.sequence)}, coalesce(max(${identifier(entry.column)}),1), count(*)>0) from auth.${identifier(entry.table)};`);
    }
    summary.sequencesReconciled = sequences.length;
    docker("auth schema idempotency", ["start", "--attach", migrator], undefined, 120000);
    assert.equal(JSON.parse(docker("second migration status", ["inspect", migrator]))[0].State.ExitCode, 0);
    assert.deepEqual(snapshots("post-migration original fingerprints"), restored, "Auth migration replay changed restored original columns");
    summary.phases.push("All Auth foreign keys checked, generated sequences reconciled and official migration replay preserved all original-column fingerprints");
    for (const entry of manifest.files) assert.equal(sha256(readFileSync(join(backup, entry.File))), entry.SHA256.toLowerCase(), "Source backup changed during rehearsal");
    summary.completed = true; save();
  } catch (error) {
    // Assertion internals may contain private row values; never print or serialize them.
    summary.error = error.code === "ERR_ASSERTION" ? String(error.message).split("\n")[0] : error.message;
    save(); throw new Error(summary.error);
  } finally {
    for (const name of created.reverse()) {
      assert.equal(docker("cleanup ownership", ["inspect", name, "--format", '{{index .Config.Labels "exampulse.private-auth"}}']).trim(), run, "Refusing to remove an unrelated container");
      docker("private container removal", ["rm", "--force", name]);
    }
    summary.privateContainersRemoved = true; save();
    console.log(JSON.stringify({ completed: summary.completed, privateContainersRemoved: true, outputDirectory: output, phases: summary.phases, error: summary.error }, null, 2));
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const index = process.argv.indexOf("--backup-directory");
  if (!process.argv.includes("--confirm-private-rehearsal") || index < 0 || !process.argv[index + 1]) {
    console.error("Requires --confirm-private-rehearsal --backup-directory <verified local backup>. Never accepts a database URL."); process.exitCode = 1;
  } else {
    try { await rehearseManagedAuth(process.argv[index + 1]); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
