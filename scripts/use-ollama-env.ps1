$helperPath = Join-Path $PSScriptRoot "ollama-common.ps1"
. $helperPath

Use-FastOllamaMode

Write-Host "Knowledge Copilot is configured for fast Ollama mode in this shell." -ForegroundColor Cyan
Write-Host "Embedding model : $env:KNOWLEDGE_COPILOT_EMBEDDING_MODEL"
Write-Host "Reranker        : smart local"
Write-Host "Answer model    : local in Fast mode, $env:KNOWLEDGE_COPILOT_ANSWER_MODEL in Quality mode"
Write-Host "Ollama base URL : $env:OLLAMA_BASE_URL"
