$repoRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $repoRoot ".venv\Scripts\python.exe"
$helperPath = Join-Path $PSScriptRoot "ollama-common.ps1"

. $helperPath
Use-FastOllamaMode
Ensure-OllamaRunning | Out-Null

Write-Host "Running provider smoke test in fast Ollama mode..." -ForegroundColor Cyan
Write-Host ""

Set-Location $repoRoot
& $pythonPath apps\api\scripts\provider_smoke.py
