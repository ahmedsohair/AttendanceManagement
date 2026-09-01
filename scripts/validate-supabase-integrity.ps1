[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Staging", "Production")]
  [string]$Target,

  [Parameter(Mandatory = $true)]
  [switch]$ConfirmReadOnlyValidation
)

$ErrorActionPreference = "Stop"
$projectRefs = @{
  Staging = "bjoguceapwquyczbhlyp"
  Production = "mtoyhpyxqhfwhcrysqon"
}
$environmentNames = @{
  Staging = "SUPABASE_STAGING_DB_URL"
  Production = "SUPABASE_PRODUCTION_DB_URL"
}
$postgresImage = "public.ecr.aws/supabase/postgres:17.6.1.165"

if (-not $ConfirmReadOnlyValidation) {
  throw "Pass -ConfirmReadOnlyValidation to acknowledge the selected target."
}

$environmentName = $environmentNames[$Target]
$databaseUrl = [Environment]::GetEnvironmentVariable($environmentName)
if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
  throw "$environmentName is not set in this PowerShell session."
}
$databaseUrl = $databaseUrl.Trim()

if ($databaseUrl.Contains("[YOUR-PASSWORD]")) {
  $securePassword = Read-Host "$Target database password" -AsSecureString
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
  throw "$environmentName is not a valid absolute PostgreSQL connection string."
}
$databaseUser = $databaseUri.UserInfo.Split(":", 2)[0]
if ($databaseUser -notmatch '^postgres\.([a-z0-9]+)$') {
  throw "Could not identify a Supabase project reference from the connection username."
}
$targetProjectRef = $Matches[1]
$expectedProjectRef = $projectRefs[$Target]
if ($targetProjectRef -ne $expectedProjectRef) {
  throw "Validation refused: expected $Target project $expectedProjectRef but received $targetProjectRef."
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required for the integrity validation."
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Desktop is installed but is not running."
}

$testPath = (Resolve-Path -LiteralPath (
  Join-Path $PSScriptRoot "..\supabase\tests\validate_relational_integrity.sql"
)).Path
$testDirectory = Split-Path -Parent $testPath
$testMount = "type=bind,source=$testDirectory,target=/tests,readonly"

Write-Host "Running read-only relational-integrity validation on $Target project $targetProjectRef"
$output = & docker run --rm --mount $testMount $postgresImage psql `
  "--dbname=$databaseUrl" `
  --tuples-only `
  --no-align `
  --variable ON_ERROR_STOP=1 `
  --file /tests/validate_relational_integrity.sql
if ($LASTEXITCODE -ne 0) {
  throw "$Target relational-integrity validation failed to run."
}

$jsonLine = $output | Where-Object { $_ -match '^\{' } | Select-Object -Last 1
if (-not $jsonLine) {
  throw "The integrity validation did not return a result."
}
$result = $jsonLine | ConvertFrom-Json
$result | Format-List
if ([int64]$result.total -ne 0) {
  throw "$Target contains $($result.total) relational-integrity violation(s)."
}

Write-Host "$Target relational-integrity validation passed with zero violations."
