[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [switch]$ConfirmStagingTest
)

$ErrorActionPreference = "Stop"
$expectedStagingProjectRef = "bjoguceapwquyczbhlyp"
$productionProjectRef = "mtoyhpyxqhfwhcrysqon"
$postgresImage = "public.ecr.aws/supabase/postgres:17.6.1.165"

if (-not $ConfirmStagingTest) {
  throw "Pass -ConfirmStagingTest to acknowledge the rollback-only staging database test."
}
if ([string]::IsNullOrWhiteSpace($env:SUPABASE_STAGING_DB_URL)) {
  throw "SUPABASE_STAGING_DB_URL is not set in this PowerShell session."
}

$databaseUrl = $env:SUPABASE_STAGING_DB_URL.Trim()
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
  throw "Test refused: the target connection belongs to production."
}
if ($targetProjectRef -ne $expectedStagingProjectRef) {
  throw "Test refused: expected staging project $expectedStagingProjectRef but received $targetProjectRef."
}
if ($databaseUri.Host -like "db.*.supabase.co") {
  throw "Use the staging Session pooler connection string on port 5432, not Direct connection."
}

$testPath = (Resolve-Path -LiteralPath (
  Join-Path $PSScriptRoot "..\supabase\tests\atomic_attendance_staging.sql"
)).Path
$testDirectory = Split-Path -Parent $testPath
$testMount = "type=bind,source=$testDirectory,target=/tests,readonly"

Write-Host "Running rollback-only atomic attendance tests on staging project $targetProjectRef"
& docker run --rm --mount $testMount $postgresImage psql `
  "--dbname=$databaseUrl" `
  --variable ON_ERROR_STOP=1 `
  --file /tests/atomic_attendance_staging.sql
if ($LASTEXITCODE -ne 0) {
  throw "Atomic attendance staging tests failed."
}

Write-Host "Atomic attendance staging tests passed; all test writes were rolled back."
