[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [switch]$ConfirmStagingTest
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmStagingTest) { throw "Pass -ConfirmStagingTest to acknowledge that only the staging deployment will be tested." }

$env:STAGING_APP_URL = "https://exampulse-stagings.vercel.app"
$env:STAGING_SUPABASE_URL = "https://bjoguceapwquyczbhlyp.supabase.co"

if ([string]::IsNullOrWhiteSpace($env:STAGING_SUPABASE_PUBLISHABLE_KEY)) {
  $env:STAGING_SUPABASE_PUBLISHABLE_KEY = Read-Host "Staging Supabase publishable key" -MaskInput
}
if ([string]::IsNullOrWhiteSpace($env:STAGING_ADMIN_PASSWORD)) {
  $env:STAGING_ADMIN_PASSWORD = Read-Host "Staging administrator password" -MaskInput
}

Write-Host "Running non-destructive HTTP API contract tests against staging"
node (Join-Path $PSScriptRoot "test-staging-api-contracts.mjs")
if ($LASTEXITCODE -ne 0) { throw "Staging HTTP API contract tests failed." }
