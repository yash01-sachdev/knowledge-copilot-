$env:KNOWLEDGE_COPILOT_EMBEDDING_PROVIDER = "ollama"
$env:KNOWLEDGE_COPILOT_EMBEDDING_MODEL = "nomic-embed-text"
$env:KNOWLEDGE_COPILOT_RERANKER_PROVIDER = "ollama"
$env:KNOWLEDGE_COPILOT_RERANKER_MODEL = "qwen3:8b"
$env:KNOWLEDGE_COPILOT_ANSWER_PROVIDER = "ollama"
$env:KNOWLEDGE_COPILOT_ANSWER_MODEL = "qwen3:8b"
$env:OLLAMA_BASE_URL = "http://127.0.0.1:11434"

Write-Host "Knowledge Copilot is configured for Ollama in this shell." -ForegroundColor Cyan
Write-Host "Embedding model : $env:KNOWLEDGE_COPILOT_EMBEDDING_MODEL"
Write-Host "Reranker model  : $env:KNOWLEDGE_COPILOT_RERANKER_MODEL"
Write-Host "Answer model    : $env:KNOWLEDGE_COPILOT_ANSWER_MODEL"
Write-Host "Ollama base URL : $env:OLLAMA_BASE_URL"
