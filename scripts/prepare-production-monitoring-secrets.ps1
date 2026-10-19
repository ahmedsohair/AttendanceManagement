$ErrorActionPreference = 'Stop'

# Generate a private import file; never print the credentials or reuse staging keys.
$directory = Join-Path $HOME 'ExamPulseSecrets'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$path = Join-Path $directory ('production-monitoring-' + [guid]::NewGuid().ToString() + '.env')
$stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew)
$stream.Dispose()
$acl = Get-Acl -LiteralPath $path
$acl.SetAccessRuleProtection($true, $false)
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl.SetAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'Allow')))
Set-Acl -LiteralPath $path -AclObject $acl
$random = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $lines = foreach ($name in @('OPS_HEALTH_SECRET', 'OPS_CHECK_SECRET')) {
    $bytes = New-Object byte[] 32
    $random.GetBytes($bytes)
    $name + '=' + ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
  }
  [IO.File]::WriteAllText($path, ($lines -join "`r`n") + "`r`n", (New-Object Text.UTF8Encoding($false)))
} finally {
  $random.Dispose()
  $bytes = $null
  $lines = $null
}
Write-Output "Private production-only secret import file: $path"
Write-Output 'Import only into attendance-management-admin / Production. Never commit or paste these values into chat.'
