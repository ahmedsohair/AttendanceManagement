[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [switch]$ConfirmStagingBootstrap
)

$ErrorActionPreference = "Stop"
$expectedStagingProjectRef = "bjoguceapwquyczbhlyp"
$productionProjectRef = "mtoyhpyxqhfwhcrysqon"
$postgresImage = "public.ecr.aws/supabase/postgres:17.6.1.165"

if (-not $ConfirmStagingBootstrap) {
  throw "Pass -ConfirmStagingBootstrap to acknowledge that the clean staging database will be modified."
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
    $encodedPassword = [Uri]::EscapeDataString($plainPassword)
    $databaseUrl = $databaseUrl.Replace("[YOUR-PASSWORD]", $encodedPassword)
  }
  finally {
    if ($null -ne $plainPassword) {
      $plainPassword = $null
    }
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
  throw "Bootstrap refused: the target connection belongs to production."
}
if ($targetProjectRef -ne $expectedStagingProjectRef) {
  throw "Bootstrap refused: expected staging project $expectedStagingProjectRef but received $targetProjectRef."
}
if ($databaseUri.Host -like "db.*.supabase.co") {
  throw "Use the staging Session pooler connection string on port 5432, not Direct connection."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required for the staging bootstrap."
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Desktop is installed but is not running."
}

$schemaPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\supabase\schema.sql")).Path
$schemaDirectory = Split-Path -Parent $schemaPath
$schemaMount = "type=bind,source=$schemaDirectory,target=/schema,readonly"

$applicationTables = @(
  "attendance_events",
  "exam_sessions",
  "incidents",
  "room_assignments",
  "rooms",
  "student_allocations",
  "users"
)
$tableList = ($applicationTables | ForEach-Object { "'$($_)'" }) -join ","
$preflightSql = "select count(*) from information_schema.tables where table_schema = 'public' and table_name in ($tableList);"
$preflightResult = & docker run --rm $postgresImage psql `
  "--dbname=$databaseUrl" `
  --tuples-only `
  --no-align `
  --set ON_ERROR_STOP=1 `
  --command $preflightSql
if ($LASTEXITCODE -ne 0) { throw "Could not inspect the staging database." }

$existingTableCount = [int](($preflightResult | Select-Object -Last 1).Trim())
if ($existingTableCount -ne 0) {
  throw "Bootstrap refused: staging already contains $existingTableCount ExamPulse application table(s)."
}

Write-Host "Applying ExamPulse schema to clean staging project $targetProjectRef"
& docker run --rm --mount $schemaMount $postgresImage psql `
  "--dbname=$databaseUrl" `
  --single-transaction `
  --variable ON_ERROR_STOP=1 `
  --file /schema/schema.sql
if ($LASTEXITCODE -ne 0) {
  throw "Staging schema bootstrap failed and the transaction was rolled back."
}

$verifyResult = & docker run --rm $postgresImage psql `
  "--dbname=$databaseUrl" `
  --tuples-only `
  --no-align `
  --set ON_ERROR_STOP=1 `
  --command $preflightSql
if ($LASTEXITCODE -ne 0) { throw "Could not verify the staging schema." }

$createdTableCount = [int](($verifyResult | Select-Object -Last 1).Trim())
if ($createdTableCount -ne $applicationTables.Count) {
  throw "Expected $($applicationTables.Count) application tables, found $createdTableCount."
}

Write-Host "Staging schema bootstrap completed: $createdTableCount application tables created with RLS enabled."
