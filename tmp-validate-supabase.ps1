$envPath = Join-Path $PSScriptRoot '.env'
$lines = Get-Content $envPath
$token = ''
foreach ($line in $lines) {
  if ($line -match '^\s*SUPABASE_ACCESS_TOKEN=(.*)\s*$') {
    $token = $matches[1].Trim()
    break
  }
}

if (-not $token) {
  Write-Host 'HAS_TOKEN=NO'
  exit 2
}

Write-Host 'HAS_TOKEN=YES'

$cli = Join-Path $env:APPDATA 'npm\supabase.cmd'
if (-not (Test-Path $cli)) {
  Write-Host 'CLI_MISSING'
  exit 3
}

& $cli login --token $token
Write-Host "LOGIN_EXIT=$LASTEXITCODE"

& $cli projects list
Write-Host "LIST_EXIT=$LASTEXITCODE"

exit $LASTEXITCODE
