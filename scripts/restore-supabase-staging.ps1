[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDirectory,

  [Parameter(Mandatory = $true)]
  [switch]$ConfirmStagingRestore
)

$ErrorActionPreference = "Stop"
$productionProjectRef = "mtoyhpyxqhfwhcrysqon"
$postgresImage = "public.ecr.aws/supabase/postgres:17.6.1.165"

if (-not $ConfirmStagingRestore) {
  throw "Pass -ConfirmStagingRestore to acknowledge that the empty staging database will be modified."
}

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_STAGING_DB_URL)) {
  throw "SUPABASE_STAGING_DB_URL is not set in this PowerShell session."
}

$resolvedBackup = (Resolve-Path -LiteralPath $BackupDirectory).Path
$requiredFiles = @("roles.sql", "schema.sql", "data.sql", "manifest.json")
foreach ($name in $requiredFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $resolvedBackup $name))) {
    throw "Required backup file is missing: $name"
  }
}

$manifest = Get-Content -LiteralPath (Join-Path $resolvedBackup "manifest.json") -Raw | ConvertFrom-Json
foreach ($entry in $manifest.files) {
  $path = Join-Path $resolvedBackup $entry.File
  $actualHash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
  if ($actualHash -ne $entry.SHA256) {
    throw "Backup checksum mismatch: $($entry.File)"
  }
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

if ($databaseUri.Scheme -notin @("postgres", "postgresql")) {
  throw "SUPABASE_STAGING_DB_URL must start with postgres:// or postgresql://."
}

if ($databaseUri.Host -like "db.*.supabase.co") {
  throw "Use the staging Session pooler connection string on port 5432, not Direct connection."
}

$databaseUser = $databaseUri.UserInfo.Split(":", 2)[0]
if ($databaseUser -notmatch '^postgres\.([a-z0-9]+)$') {
  throw "Could not identify a Supabase staging project reference from the connection username."
}

$targetProjectRef = $Matches[1]
if ($targetProjectRef -eq $productionProjectRef) {
  throw "Restore refused: the target connection belongs to the production Supabase project."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required for the guarded staging restore."
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Desktop is installed but is not running."
}

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

$existingApplicationTableCount = [int](($preflightResult | Select-Object -Last 1).Trim())
if ($existingApplicationTableCount -ne 0) {
  throw "Restore refused: staging already contains $existingApplicationTableCount ExamPulse application table(s)."
}

$mount = "type=bind,source=$resolvedBackup,target=/backup,readonly"
$restoreWorkspace = Join-Path ([IO.Path]::GetTempPath()) "exampulse-restore-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $restoreWorkspace -Force | Out-Null
$sanitizedRolesPath = Join-Path $restoreWorkspace "roles.sql"
$sanitizedRoleLines = Get-Content -LiteralPath (Join-Path $resolvedBackup "roles.sql") |
  Where-Object { $_ -notmatch '^\s*ALTER ROLE "supabase_admin"\s' }
[IO.File]::WriteAllLines(
  $sanitizedRolesPath,
  [string[]]$sanitizedRoleLines,
  [Text.UTF8Encoding]::new($false)
)
$sanitizedDataPath = Join-Path $restoreWorkspace "data.sql"
$dataReader = [IO.StreamReader]::new((Join-Path $resolvedBackup "data.sql"), [Text.Encoding]::UTF8)
$dataWriter = [IO.StreamWriter]::new($sanitizedDataPath, $false, [Text.UTF8Encoding]::new($false))
try {
  $skipReservedTable = $false
  while (($line = $dataReader.ReadLine()) -ne $null) {
    if (-not $skipReservedTable -and $line -match '^COPY "storage"\."(buckets_vectors|vector_indexes)" ') {
      $skipReservedTable = $true
      continue
    }

    if ($skipReservedTable) {
      if ($line -eq "\.") {
        $skipReservedTable = $false
      }
      continue
    }

    $dataWriter.WriteLine($line)
  }
}
finally {
  $dataReader.Dispose()
  $dataWriter.Dispose()
}
$restoreMount = "type=bind,source=$restoreWorkspace,target=/restore,readonly"

Write-Host "Restoring verified backup into staging project $targetProjectRef"

try {
  & docker run --rm --mount $mount --mount $restoreMount $postgresImage psql `
    "--dbname=$databaseUrl" `
    --single-transaction `
    --variable ON_ERROR_STOP=1 `
    --file /restore/roles.sql `
    --file /backup/schema.sql `
    --command "SET session_replication_role = replica" `
    --file /restore/data.sql
  if ($LASTEXITCODE -ne 0) { throw "Staging restore failed and the transaction was rolled back." }
}
finally {
  Remove-Item -LiteralPath $restoreWorkspace -Recurse -Force -ErrorAction SilentlyContinue
}

$dataPath = Join-Path $resolvedBackup "data.sql"
$expectedCounts = @{}
$currentTable = $null
foreach ($line in [IO.File]::ReadLines($dataPath)) {
  if ($line -match '^COPY "(auth|public)"\."([^"]+)" ') {
    $currentTable = "$($Matches[1]).$($Matches[2])"
    if ($currentTable -eq "auth.users" -or $Matches[1] -eq "public") {
      $expectedCounts[$currentTable] = 0
    }
    continue
  }

  if ($null -ne $currentTable) {
    if ($line -eq "\.") {
      $currentTable = $null
    }
    elseif ($expectedCounts.ContainsKey($currentTable)) {
      $expectedCounts[$currentTable]++
    }
  }
}

$countQueries = @("select 'auth.users', count(*) from auth.users")
$countQueries += $applicationTables | ForEach-Object { "select 'public.$_', count(*) from public.$_" }
$verificationSql = ($countQueries -join " union all ") + ";"
$verificationRows = & docker run --rm $postgresImage psql `
  "--dbname=$databaseUrl" `
  --tuples-only `
  --no-align `
  --field-separator "=" `
  --set ON_ERROR_STOP=1 `
  --command $verificationSql
if ($LASTEXITCODE -ne 0) { throw "Restore completed, but count verification failed." }

$mismatches = @()
foreach ($row in $verificationRows) {
  if ($row -notmatch '^([^=]+)=([0-9]+)$') { continue }
  $table = $Matches[1]
  $actual = [int]$Matches[2]
  $expected = [int]$expectedCounts[$table]
  if ($actual -ne $expected) {
    $mismatches += "$table expected $expected, restored $actual"
  }
  Write-Host "${table}: $actual row(s)"
}

if ($mismatches.Count -gt 0) {
  throw "Restore count mismatch: $($mismatches -join '; ')"
}

Write-Host "Staging restore completed and record counts match the backup."
Write-Host "Do not connect a public staging deployment until production data has been replaced with synthetic test data."
