# sb migration cmd, run: powershell -ExecutionPolicy Bypass -File .\scripts\run-supabase-migrations.ps1
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envPath = Join-Path $repoRoot '.env'

if (-not (Test-Path $envPath)) {
  throw "Missing .env file at $envPath"
}

foreach ($line in Get-Content $envPath) {
  if ($line -match '^\s*#' -or [string]::IsNullOrWhiteSpace($line)) {
    continue
  }

  $parts = $line.Split('=', 2)
  if ($parts.Count -eq 2) {
    $key = $parts[0].Trim()
    $value = $parts[1].Trim()
    [Environment]::SetEnvironmentVariable($key, $value, 'Process')
  }
}

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  throw 'Missing SUPABASE_ACCESS_TOKEN in .env'
}

if (-not $env:SUPABASE_PROJECT_REF) {
  throw 'Missing SUPABASE_PROJECT_REF in .env'
}

Set-Location $repoRoot
Write-Host 'Authenticating Supabase CLI...'
& npx.cmd supabase login --token $env:SUPABASE_ACCESS_TOKEN
Write-Host 'Linking to project...'
& npx.cmd supabase link --project-ref $env:SUPABASE_PROJECT_REF
Write-Host 'Running DB migrations...'
& npx.cmd supabase db push
Write-Host 'Deploying signup/auth edge functions...'
& npx.cmd supabase functions deploy create-account --project-ref $env:SUPABASE_PROJECT_REF
& npx.cmd supabase functions deploy send-verification-code --project-ref $env:SUPABASE_PROJECT_REF
& npx.cmd supabase functions deploy manage-auth-events --project-ref $env:SUPABASE_PROJECT_REF
Write-Host 'Migration and function deployment completed.'
