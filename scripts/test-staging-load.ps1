[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [switch]$ConfirmStagingTest
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmStagingTest) { throw "Pass -ConfirmStagingTest to acknowledge that only the staging deployment will be load tested." }

$env:STAGING_APP_URL = "https://exampulse-stagings.vercel.app"
$env:STAGING_SUPABASE_URL = "https://bjoguceapwquyczbhlyp.supabase.co"

if ([string]::IsNullOrWhiteSpace($env:STAGING_SUPABASE_PUBLISHABLE_KEY)) {
  $env:STAGING_SUPABASE_PUBLISHABLE_KEY = Read-Host "Staging Supabase publishable key" -MaskInput
}

Write-Host "Running read-only staging load and soak tests"
node (Join-Path $PSScriptRoot "test-staging-load.mjs")
if ($LASTEXITCODE -ne 0) { throw "Staging load and soak tests failed." }
