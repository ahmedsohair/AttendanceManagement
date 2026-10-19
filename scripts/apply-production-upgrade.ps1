[CmdletBinding()]
param(
  [string]$BackupDirectory = (Join-Path $HOME 'ExamPulseBackups\production-20261019-150032'),
  [switch]$ValidateSourceOnly,
  [switch]$PrepareOnly,
  [switch]$ConfirmProductionUpgrade,
  [string]$RootCertPath
)

$ErrorActionPreference = 'Stop'
$releaseRoot = Split-Path -Parent $PSScriptRoot
$productionRef = 'mtoyhpyxqhfwhcrysqon'
$postgresImage = 'public.ecr.aws/supabase/postgres@sha256:b15d862126dd2dac02da524696ccfde2dcce2ceaee0a58973b2727befe492706'
$dockerEndpoint = 'npipe:////./pipe/dockerDesktopLinuxEngine'

function Get-CanonicalHash([string]$Text) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($sha.ComputeHash(
      [Text.Encoding]::UTF8.GetBytes($Text.Replace("`r`n", "`n"))
    ))).Replace('-', '').ToLowerInvariant()
  } finally { $sha.Dispose() }
}

function Get-ProductionUri([string]$Connection) {
  $uri = $null
  $probe = $Connection.Replace('[YOUR-PASSWORD]', 'placeholder')
  if (-not [Uri]::TryCreate($probe, [UriKind]::Absolute, [ref]$uri) -or
      $uri.Scheme -notin @('postgres','postgresql') -or
      $uri.Host -notmatch '^aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com$' -or
      $uri.Port -ne 5432 -or $uri.AbsolutePath -ne '/postgres' -or
      $uri.UserInfo.Split(':',2)[0] -cne "postgres.$productionRef" -or
      $uri.Fragment -or $uri.Query) {
    throw 'Production target refused. Use the exact production Session pooler URI on port 5432 without query/fragment options.'
  }
  return $uri
}

function Get-RollbackBody([string]$Text) {
  $match = [regex]::Match($Text.Trim(), '(?is)\Abegin;\s*(?<body>.*)\brollback;\s*\z')
  if (-not $match.Success) { throw 'Unexpected rollback-only regression format.' }
  return $match.Groups['body'].Value
}

function New-ProductionUpgradeSql {
  $manifest = Get-Content -LiteralPath (Join-Path $releaseRoot 'docs\PRODUCTION_MIGRATION_MANIFEST.json') -Raw | ConvertFrom-Json
  if ($manifest.productionProject -cne $productionRef -or $manifest.migrations.Count -ne 20) {
    throw 'Unexpected production migration inventory.'
  }
  $migrationRoot = Join-Path $releaseRoot 'supabase\migrations'
  $expected = @($manifest.migrations | ForEach-Object { $_.file })
  $actual = @(Get-ChildItem -LiteralPath $migrationRoot -Filter '*.sql' -File | Sort-Object Name | ForEach-Object { $_.Name })
  if (($expected -join '|') -cne ($actual -join '|')) { throw 'Migration order or inventory changed.' }
  $payload = @()
  foreach ($entry in $manifest.migrations) {
    if ($entry.file -notmatch '^\d{8}_[a-z0-9_]+\.sql$') { throw 'Unsafe migration filename.' }
    $sql = [IO.File]::ReadAllText((Join-Path $migrationRoot $entry.file)).Replace("`r`n", "`n")
    if ((Get-CanonicalHash $sql) -cne $entry.sha256) { throw "Migration checksum mismatch: $($entry.file)" }
    $payload += "-- Reviewed migration: $($entry.file)`n$sql"
  }
  $testRoot = Join-Path $releaseRoot 'supabase\tests'
  $preserve = [IO.File]::ReadAllText((Join-Path $testRoot 'production_upgrade_preservation_20261019.sql'))
  $catalog = [IO.File]::ReadAllText((Join-Path $testRoot 'production_upgrade_catalog.sql'))
  $integrity = [IO.File]::ReadAllText((Join-Path $testRoot 'validate_relational_integrity.sql')).Trim()
  $match = [regex]::Match($integrity, '(?is)\Abegin transaction read only;\s*(?<body>.*);\s*rollback;\s*\z')
  if (-not $match.Success) { throw 'Unexpected read-only integrity query format.' }
  $integrityGuard = 'do $integrity$ declare result jsonb; begin select payload into result from (' +
    $match.Groups['body'].Value + ') as checked(payload); if result is null or (result->>''total'')::bigint is distinct from 0 then raise exception ''Production relational-integrity guard failed.''; end if; end; $integrity$;'
  $audit = Get-RollbackBody ([IO.File]::ReadAllText((Join-Path $testRoot 'admin_audit_events_staging.sql')))
  return (@(
    '-- ExamPulse one-off production upgrade, verified 19 October 2026.',
    '-- Execute only through the guarded wrapper using psql --single-transaction.',
    "set local lock_timeout='5s'; set local statement_timeout='30s';",
    "set local idle_in_transaction_session_timeout='60s'; set local timezone='UTC';",
    'lock table public.users, public.exam_sessions, public.rooms, public.room_assignments, public.student_allocations, public.attendance_events, public.incidents in share row exclusive mode;',
    $preserve, $integrityGuard,
    ($payload -join "`n"),
    'savepoint exampulse_regression;', $audit,
    'rollback to savepoint exampulse_regression;',
    $preserve, $integrityGuard, $catalog,
    "select jsonb_build_object('precommitChecksPassed',true,'migrationCount',20,'originalRowsPreserved',true);"
  ) -join "`n").Replace("`r`n", "`n")
}

if (@($ValidateSourceOnly,$PrepareOnly,$ConfirmProductionUpgrade | Where-Object { $_ }).Count -ne 1) {
  throw 'Choose exactly one: -ValidateSourceOnly, -PrepareOnly, or -ConfirmProductionUpgrade.'
}
$upgradeSql = New-ProductionUpgradeSql
if ($ValidateSourceOnly) {
  Write-Host 'Production upgrade source verified: 20 canonical migrations and transactional acceptance guards. No database connection made.'
  return
}

$backup = (Resolve-Path -LiteralPath $BackupDirectory).Path
$backupManifest = Get-Content -LiteralPath (Join-Path $backup 'manifest.json') -Raw | ConvertFrom-Json
$expectedBackup = @{
  'roles.sql' = '4350a72b5ec109888e740c17f3eb4da2fcd95ab73af26499538ed0bf615db543'
  'schema.sql' = 'c22cf5b2eff148578005b0e9524f0203e548780cf85cf06ac478e3cf1989d968'
  'data.sql' = '8b6eb1962d0ca2031bb4137d5a13b9b5ec09932fd1a2a9bca8db596ef99a9c7c'
}
if ((@($backupManifest.files.File | Sort-Object) -join '|') -cne 'data.sql|roles.sql|schema.sql') {
  throw 'Unexpected backup inventory.'
}
foreach ($entry in $backupManifest.files) {
  $path = Join-Path $backup $entry.File
  if ((Get-Item -LiteralPath $path).Length -ne $entry.Bytes -or
      (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expectedBackup[$entry.File] -or
      $entry.SHA256.ToLowerInvariant() -cne $expectedBackup[$entry.File]) {
    throw 'Backup differs from the verified cutover baseline. Stop and review; do not substitute a different backup.'
  }
}
$bundleDirectory = Join-Path (Split-Path -Parent $backup) ('production-upgrade-' + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $bundleDirectory | Out-Null
$sqlPath = Join-Path $bundleDirectory 'production-upgrade.sql'
[IO.File]::WriteAllText($sqlPath, $upgradeSql, (New-Object Text.UTF8Encoding($false)))
Write-Host "Prepared verified SQL bundle: $sqlPath"
Write-Host "Canonical SQL SHA256: $(Get-CanonicalHash $upgradeSql)"
if ($PrepareOnly) { return }

$connection = [Environment]::GetEnvironmentVariable('SUPABASE_PRODUCTION_DB_URL')
if ([string]::IsNullOrWhiteSpace($connection)) { throw 'SUPABASE_PRODUCTION_DB_URL is not set in this PowerShell session.' }
$connection = $connection.Trim()
$null = Get-ProductionUri $connection
if ([Environment]::GetEnvironmentVariable('DOCKER_HOST') -or [Environment]::GetEnvironmentVariable('DOCKER_CONTEXT')) {
  throw 'Docker environment overrides are not permitted. Use local Docker Desktop without DOCKER_HOST or DOCKER_CONTEXT overrides.'
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker Desktop is required.' }
docker --host $dockerEndpoint info *> $null
if ($LASTEXITCODE -ne 0) { throw 'The local Docker Desktop Linux engine is not running. No remote Docker daemon is permitted.' }
if ($connection.Contains('[YOUR-PASSWORD]')) {
  $password = Read-Host 'Production database password' -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
  try { $connection = $connection.Replace('[YOUR-PASSWORD]',[Uri]::EscapeDataString([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $password = $null }
}
$uri = Get-ProductionUri $connection
$credentials = $uri.UserInfo.Split(':',2)
if ($credentials.Count -ne 2 -or [string]::IsNullOrEmpty($credentials[1])) { throw 'Database password is missing.' }
$settings = @{
  PGHOST=$uri.Host; PGPORT='5432'; PGUSER=$credentials[0]; PGDATABASE='postgres'
  PGPASSWORD=[Uri]::UnescapeDataString($credentials[1]); PGSSLMODE='verify-full'
  PGSSLROOTCERT='system'; PGAPPNAME='exampulse-reviewed-production-upgrade'; PGCONNECT_TIMEOUT='15'
}
$mounts = @('--mount',"type=bind,source=$bundleDirectory,target=/bundle,readonly")
if ($RootCertPath) {
  $cert = (Get-Item -LiteralPath $RootCertPath).FullName
  $settings.PGSSLROOTCERT = '/certs/root.crt'
  $mounts += @('--mount',"type=bind,source=$cert,target=/certs/root.crt,readonly")
}
$previous = @{}
try {
  $arguments = @('--host',$dockerEndpoint,'run','--rm') + $mounts
  foreach ($key in $settings.Keys) {
    $previous[$key] = [Environment]::GetEnvironmentVariable($key)
    [Environment]::SetEnvironmentVariable($key,$settings[$key])
    $arguments += @('--env',$key)
  }
  $arguments += @($postgresImage,'psql','-X','--single-transaction','--variable','ON_ERROR_STOP=1','--file','/bundle/production-upgrade.sql')
  Write-Host "Applying 20 reviewed migrations to PRODUCTION project $productionRef in one transaction. Keep application writes stopped."
  & docker @arguments
  if ($LASTEXITCODE -ne 0) {
    throw 'Production upgrade failed or the commit outcome is unknown. Do not blindly rerun or restore; inspect the target state. Failures before commit roll back the transaction.'
  }
  Write-Host 'Production upgrade committed. Preservation, relational integrity, RLS/catalog, monitoring privileges and rollback-only audit checks passed. Do not invite staff until the matching application deployment is verified.'
} finally {
  foreach ($key in $previous.Keys) { [Environment]::SetEnvironmentVariable($key,$previous[$key]) }
  $settings.PGPASSWORD = $null; $connection = $null; $uri = $null; $credentials = $null
}
