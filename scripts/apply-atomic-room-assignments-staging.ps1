[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [switch]$ConfirmStagingMigration
)

$ErrorActionPreference = "Stop"
$expectedStagingProjectRef = "bjoguceapwquyczbhlyp"
$productionProjectRef = "mtoyhpyxqhfwhcrysqon"
$postgresImage = "public.ecr.aws/supabase/postgres:17.6.1.165"

if (-not $ConfirmStagingMigration) {
  throw "Pass -ConfirmStagingMigration to acknowledge that the staging database will be modified."
}
if ([string]::IsNullOrWhiteSpace($env:SUPABASE_STAGING_DB_URL)) {
  throw "SUPABASE_STAGING_DB_URL is not set in this PowerShell session."
}

$databaseUrl = $env:SUPABASE_STAGING_DB_URL.Trim()
if ($databaseUrl.Contains("[YOUR-PASSWORD]")) {
  $securePassword = Read-Host "Staging database password" -AsSecureString
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $databaseUrl = $databaseUrl.Replace(
      "[YOUR-PASSWORD]",
      [Uri]::EscapeDataString($plainPassword)
    )
  }
  finally {
    $plainPassword = $null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
}

$databaseUri = $null
if (-not [Uri]::TryCreate($databaseUrl, [UriKind]::Absolute, [ref]$databaseUri)) {
  throw "SUPABASE_STAGING_DB_URL is not a valid absolute PostgreSQL connection string."
}
$databaseUser = $databaseUri.UserInfo.Split(":", 2)[0]
if ($databaseUser -notmatch '^postgres\.([a-z0-9]+)$') {
  throw "Could not identify a Supabase project reference from the connection username."
}
$targetProjectRef = $Matches[1]
if ($targetProjectRef -eq $productionProjectRef) {
  throw "Migration refused: the target connection belongs to production."
}
if ($targetProjectRef -ne $expectedStagingProjectRef) {
  throw "Migration refused: expected staging project $expectedStagingProjectRef but received $targetProjectRef."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required for the staging migration."
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Desktop is installed but is not running."
}

$migrationPath = (Resolve-Path -LiteralPath (
  Join-Path $PSScriptRoot "..\supabase\migrations\20260901_atomic_room_assignments.sql"
)).Path
$migrationDirectory = Split-Path -Parent $migrationPath
$migrationMount = "type=bind,source=$migrationDirectory,target=/migrations,readonly"

Write-Host "Applying atomic room-assignment migration to staging project $targetProjectRef"
& docker run --rm --mount $migrationMount $postgresImage psql `
  "--dbname=$databaseUrl" `
  --single-transaction `
  --variable ON_ERROR_STOP=1 `
  --file /migrations/20260901_atomic_room_assignments.sql
if ($LASTEXITCODE -ne 0) {
  throw "Staging atomic room-assignment migration failed and was rolled back."
}

$verifySql = @"
select
  exists (
    select 1 from pg_proc
    where oid = 'public.replace_room_assignments_atomic(uuid,jsonb,jsonb)'::regprocedure
  )
  and has_function_privilege(
    'service_role',
    'public.replace_room_assignments_atomic(uuid,jsonb,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.replace_room_assignments_atomic(uuid,jsonb,jsonb)',
    'EXECUTE'
  );
"@

$verifyResult = & docker run --rm $postgresImage psql `
  "--dbname=$databaseUrl" `
  --tuples-only `
  --no-align `
  --set ON_ERROR_STOP=1 `
  --command $verifySql
if ($LASTEXITCODE -ne 0 -or ($verifyResult | Select-Object -Last 1).Trim() -ne "t") {
  throw "Could not verify the staging atomic room-assignment function."
}

Write-Host "Staging atomic room-assignment migration completed and verified."
