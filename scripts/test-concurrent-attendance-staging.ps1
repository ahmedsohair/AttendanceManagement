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
  throw "Pass -ConfirmStagingTest to acknowledge that the isolated test will run only on staging."
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
    $databaseUrl = $databaseUrl.Replace("[YOUR-PASSWORD]", [Uri]::EscapeDataString($plainPassword))
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
if ($targetProjectRef -eq $productionProjectRef -or $targetProjectRef -ne $expectedStagingProjectRef) {
  throw "Concurrency test refused: expected staging project $expectedStagingProjectRef, received $targetProjectRef."
}
if ($databaseUri.Host -like "db.*.supabase.co") {
  throw "Use the staging Session pooler connection string on port 5432, not Direct connection."
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required for the staging concurrency test."
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker Desktop is installed but is not running." }

$testsPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\supabase\tests")).Path
$testsMount = "type=bind,source=$testsPath,target=/tests,readonly"

function Invoke-TestFile([string]$fileName) {
  & docker run --rm --mount $testsMount $postgresImage psql `
    "--dbname=$databaseUrl" --set ON_ERROR_STOP=1 "--file=/tests/$fileName"
  if ($LASTEXITCODE -ne 0) { throw "Staging concurrency test step $fileName failed." }
}

$jobs = @()
try {
  Write-Host "Preparing isolated concurrent attendance fixture on staging project $targetProjectRef"
  Invoke-TestFile "concurrent_attendance_preflight.sql"

  $startAt = [DateTime]::UtcNow.AddSeconds(8).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
  $userExpression = "(select id from public.users where email = 'invigilator01@example.com')"
  $commonArguments = "'10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','9000991',$userExpression,'manual'"
  $sqlA = "select pg_sleep(greatest(0, extract(epoch from (timestamptz '$startAt' - clock_timestamp())))); select public.mark_attendance_atomic('7a200000-0000-4000-8000-000000000001',$commonArguments,'phase-7.2-device-a','mark_present',false,'Phase 7.2 concurrency test A');"
  $sqlB = "select pg_sleep(greatest(0, extract(epoch from (timestamptz '$startAt' - clock_timestamp())))); select public.mark_attendance_atomic('7a200000-0000-4000-8000-000000000002',$commonArguments,'phase-7.2-device-b','mark_present',false,'Phase 7.2 concurrency test B');"

  Write-Host "Launching two device marks for the same student at $startAt"
  foreach ($sql in @($sqlA, $sqlB)) {
    $jobs += Start-Job -ScriptBlock {
      param($DatabaseUrl, $PostgresImage, $Sql)
      & docker run --rm $PostgresImage psql "--dbname=$DatabaseUrl" --set ON_ERROR_STOP=1 --tuples-only --no-align "--command=$Sql"
      if ($LASTEXITCODE -ne 0) { throw "Concurrent database session failed." }
    } -ArgumentList $databaseUrl, $postgresImage, $sql
  }
  $jobs | Wait-Job | Out-Null
  $jobOutput = $jobs | Receive-Job
  if ($jobs.State -contains "Failed") { throw "At least one concurrent attendance session failed." }
  $jobOutput | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | ForEach-Object { Write-Host $_ }

  Invoke-TestFile "concurrent_attendance_assert.sql"
  Write-Host "Concurrent attendance staging test passed."
}
finally {
  $jobs | Remove-Job -Force -ErrorAction SilentlyContinue
  Write-Host "Removing concurrency test rows from staging"
  Invoke-TestFile "concurrent_attendance_cleanup.sql"
}
