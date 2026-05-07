$repoRoot = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repoRoot "apps\web"

$env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000"

Write-Host "Starting frontend..." -ForegroundColor Cyan
Write-Host "API URL: $env:NEXT_PUBLIC_API_BASE_URL"
Write-Host ""

Set-Location $webDir
npm run dev
