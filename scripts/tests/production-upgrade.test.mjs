import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readUpgradeBundle } from "../rehearse-production-application-backup.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const wrapper = fileURLToPath(new URL("../apply-production-upgrade.ps1", import.meta.url));
const powershell = (body) => execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand",
  Buffer.from(body, "utf16le").toString("base64")], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 60000, stdio: "pipe" });
const load = `. '${wrapper.replaceAll("'", "''")}' -ValidateSourceOnly; $ErrorActionPreference='Stop'; function docker { throw 'Test must never connect to Docker or a database' };`;

test("upgrade wrapper pins production, TLS validation, backups and a single transaction", () => {
  const source = readFileSync(wrapper, "utf8");
  assert.match(source, /mtoyhpyxqhfwhcrysqon/);
  assert.match(source, /PGSSLMODE='verify-full'/);
  assert.match(source, /PGSSLROOTCERT='system'/);
  assert.match(source, /'--single-transaction'/);
  assert.match(source, /'ON_ERROR_STOP=1'/);
  assert.match(source, /npipe:\/\/\/\/\.\/pipe\/dockerDesktopLinuxEngine/);
  assert.match(source, /@\('--host',\$dockerEndpoint,'run','--rm'\)/);
  assert.match(source, /GetEnvironmentVariable\('DOCKER_CONTEXT'\)/);
  assert.doesNotMatch(source, /Get-RollbackBody[^\r\n]*operational_monitoring_staging/);
  assert.match(source, /Backup differs from the verified cutover baseline/);
  assert.match(source, /Migration checksum mismatch/);
  assert.doesNotMatch(source, /--env[^\r\n]*PGPASSWORD=/);
});

test("private rehearsal refuses database URLs as upgrade files", () => {
  assert.throws(() => readUpgradeBundle("postgresql://example.invalid/postgres"), /local file/);
});

test("Windows guards validate source and accept only the production Session pooler target", { skip: process.platform !== "win32" }, () => {
  const result = powershell(load + `
    $valid='postgresql://postgres.mtoyhpyxqhfwhcrysqon:[YOUR-PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres';
    $uri=Get-ProductionUri $valid;
    if ($uri.Host -ne 'aws-1-ap-southeast-1.pooler.supabase.com') { throw 'Valid production URI rejected' };
    $invalid=@(
      $valid.Replace('mtoyhpyxqhfwhcrysqon','bjoguceapwquyczbhlyp'),
      $valid.Replace(':5432',':6543'),
      $valid.Replace('postgresql:','https:'),
      $valid.Replace('.pooler.supabase.com','.attacker.invalid'),
      $valid.Replace('/postgres','/other'),
      ($valid+'?sslmode=disable'), ($valid+'#fragment'),
      $valid.Replace('postgres.mtoyhpyxqhfwhcrysqon','other')
    );
    foreach ($value in $invalid) {
      $rejected=$false; try { $null=Get-ProductionUri $value } catch { $rejected=$true };
      if (-not $rejected) { throw 'Unsafe target accepted' };
    };
    $sql=New-ProductionUpgradeSql;
    if (($sql | Select-String -AllMatches 'Reviewed migration:').Matches.Count -ne 20) { throw 'Unexpected migration count' };
    if ($sql -match '(?im)^begin;|^commit;|^rollback;') { throw 'Nested transaction boundary escaped stripping' };
    if ($sql -notmatch 'rollback to savepoint exampulse_regression;') { throw 'Missing test rollback' };
    Write-Output 'TARGET_GUARDS_PASSED';
  `);
  assert.match(result, /TARGET_GUARDS_PASSED/);
});

test("Windows guard rejects absent or conflicting execution modes before any connection", { skip: process.platform !== "win32" }, () => {
  const result = powershell(load + `
    $modes=@(@{}, @{ValidateSourceOnly=$true;PrepareOnly=$true},
      @{ValidateSourceOnly=$true;ConfirmProductionUpgrade=$true},
      @{PrepareOnly=$true;ConfirmProductionUpgrade=$true},
      @{ValidateSourceOnly=$true;PrepareOnly=$true;ConfirmProductionUpgrade=$true});
    foreach ($mode in $modes) {
      $rejected=$false;
      try { & '${wrapper.replaceAll("'", "''")}' @mode } catch {
        if ($_.Exception.Message -notmatch 'Choose exactly one') { throw };
        $rejected=$true;
      };
      if (-not $rejected) { throw 'Invalid execution mode accepted' };
    };
    Write-Output 'MODE_GUARDS_PASSED';
  `);
  assert.match(result, /MODE_GUARDS_PASSED/);
});
