[CmdletBinding()]
param(
  [string]$OutputRoot = (Join-Path $HOME "ExamPulseBackups")
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_DB_URL)) {
  throw "SUPABASE_DB_URL is not set in this PowerShell session."
}

$databaseUrl = $env:SUPABASE_DB_URL.Trim()

if ($databaseUrl.Contains("[YOUR-PASSWORD]")) {
  $securePassword = Read-Host "Production database password" -AsSecureString
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
  throw @"
SUPABASE_DB_URL is not a valid absolute PostgreSQL connection string.
Copy the unmodified Session pooler URI from Supabase Connect, including the [YOUR-PASSWORD] placeholder.
The script will request and encode the password securely.
"@
}

if ($databaseUri.Scheme -notin @("postgres", "postgresql")) {
  throw "SUPABASE_DB_URL must start with postgres:// or postgresql://."
}

if ($databaseUri.Host -like "db.*.supabase.co") {
  throw @"
The direct Supabase database hostname is not compatible with this Windows Docker network.
In the production Supabase dashboard, open Connect and copy the Session pooler connection string instead.
Use Session pooler on port 5432, not Direct connection and not Transaction pooler.
"@
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required by the Supabase CLI database dump command."
}

docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker Desktop is installed but is not running."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDirectory = Join-Path $OutputRoot "production-$timestamp"
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null

$rolesFile = Join-Path $backupDirectory "roles.sql"
$schemaFile = Join-Path $backupDirectory "schema.sql"
$dataFile = Join-Path $backupDirectory "data.sql"

Write-Host "Creating Supabase logical backup in $backupDirectory"

& npx.cmd --yes supabase@latest db dump `
  --db-url $databaseUrl `
  --file $rolesFile `
  --role-only
if ($LASTEXITCODE -ne 0) { throw "Role backup failed." }

& npx.cmd --yes supabase@latest db dump `
  --db-url $databaseUrl `
  --file $schemaFile
if ($LASTEXITCODE -ne 0) { throw "Schema backup failed." }

& npx.cmd --yes supabase@latest db dump `
  --db-url $databaseUrl `
  --file $dataFile `
  --data-only `
  --use-copy `
  --exclude "storage.buckets_vectors" `
  --exclude "storage.vector_indexes"
if ($LASTEXITCODE -ne 0) { throw "Data backup failed." }

$files = @($rolesFile, $schemaFile, $dataFile) | ForEach-Object {
  $file = Get-Item -LiteralPath $_
  if ($file.Length -eq 0) {
    throw "Backup file is empty: $($file.FullName)"
  }

  [pscustomobject]@{
    File = $file.Name
    Bytes = $file.Length
    SHA256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
  }
}

$manifestFile = Join-Path $backupDirectory "manifest.json"
$manifest = [ordered]@{
  createdAt = (Get-Date).ToUniversalTime().ToString("o")
  source = "ExamPulse production Supabase"
  files = $files
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestFile -Encoding utf8

Write-Host "Backup completed and checksummed."
$files | Format-Table -AutoSize
Write-Host "Manifest: $manifestFile"
Write-Host "Store this directory securely outside the Git repository."
