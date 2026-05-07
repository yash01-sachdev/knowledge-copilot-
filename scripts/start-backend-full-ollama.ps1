$repoRoot = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $repoRoot "apps\api"
$pythonPath = Join-Path $repoRoot ".venv\Scripts\python.exe"
$helperPath = Join-Path $PSScriptRoot "ollama-common.ps1"

. $helperPath
Use-FullOllamaMode
Ensure-OllamaRunning | Out-Null

Write-Host "Starting backend with Ollama quality mode available..." -ForegroundColor Cyan
Write-Host "Embedding model : $env:KNOWLEDGE_COPILOT_EMBEDDING_MODEL"
Write-Host "Reranker        : smart local"
Write-Host "Answer model    : $env:KNOWLEDGE_COPILOT_ANSWER_MODEL"
Write-Host "Ollama base URL : $env:OLLAMA_BASE_URL"
Write-Host "App modes       : Fast = local heuristic answer, Quality = Ollama answer"
Write-Host ""

Set-Location $apiDir
& $pythonPath -m uvicorn app.main:app --reload
