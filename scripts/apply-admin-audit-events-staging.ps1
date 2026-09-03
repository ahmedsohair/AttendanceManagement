[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [switch]$ConfirmStagingMigration
)

$ErrorActionPreference = "Stop"
$expectedStagingProjectRef = "bjoguceapwquyczbhlyp"
$productionProjectRef = "mtoyhpyxqhfwhcrysqon"
$postgresImage = "public.ecr.aws/supabase/postgres:17.6.1.165"

if (-not $ConfirmStagingMigration) { throw "Pass -ConfirmStagingMigration to acknowledge that the staging database will be modified." }
if ([string]::IsNullOrWhiteSpace($env:SUPABASE_STAGING_DB_URL)) { throw "SUPABASE_STAGING_DB_URL is not set in this PowerShell session." }

$databaseUrl = $env:SUPABASE_STAGING_DB_URL.Trim()
if ($databaseUrl.Contains("[YOUR-PASSWORD]")) {
  $securePassword = Read-Host "Staging database password" -AsSecureString
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $databaseUrl = $databaseUrl.Replace("[YOUR-PASSWORD]", [Uri]::EscapeDataString($plainPassword))
  }
  finally {
    $plainPassword = $null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
}

$databaseUri = $null
if (-not [Uri]::TryCreate($databaseUrl, [UriKind]::Absolute, [ref]$databaseUri)) { throw "SUPABASE_STAGING_DB_URL is not a valid absolute PostgreSQL connection string." }
$databaseUser = $databaseUri.UserInfo.Split(":", 2)[0]
if ($databaseUser -notmatch '^postgres\.([a-z0-9]+)$') { throw "Could not identify a Supabase project reference from the connection username." }
$targetProjectRef = $Matches[1]
if ($targetProjectRef -eq $productionProjectRef) { throw "Migration refused: the target connection belongs to production." }
if ($targetProjectRef -ne $expectedStagingProjectRef) { throw "Migration refused: expected staging project $expectedStagingProjectRef but received $targetProjectRef." }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw "Docker is required for the staging migration." }
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker Desktop is installed but is not running." }

$migrationPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\supabase\migrations\20260903_admin_audit_events.sql")).Path
$testPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\supabase\tests\admin_audit_events_staging.sql")).Path
$migrationMount = "type=bind,source=$(Split-Path -Parent $migrationPath),target=/migrations,readonly"
$testMount = "type=bind,source=$(Split-Path -Parent $testPath),target=/tests,readonly"

Write-Host "Applying immutable admin audit events migration to staging project $targetProjectRef"
& docker run --rm --mount $migrationMount $postgresImage psql "--dbname=$databaseUrl" --single-transaction --variable ON_ERROR_STOP=1 --file /migrations/20260903_admin_audit_events.sql
if ($LASTEXITCODE -ne 0) { throw "Staging admin audit migration failed and was rolled back." }

Write-Host "Running rollback-only admin audit event tests"
& docker run --rm --mount $testMount $postgresImage psql "--dbname=$databaseUrl" --variable ON_ERROR_STOP=1 --file /tests/admin_audit_events_staging.sql
if ($LASTEXITCODE -ne 0) { throw "Staging admin audit event tests failed." }

Write-Host "Admin audit migration and rollback-only tests passed."
