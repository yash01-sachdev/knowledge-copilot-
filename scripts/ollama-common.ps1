function Get-OllamaDefaults {
    $ollamaExecutable = $env:OLLAMA_EXECUTABLE
    if (-not $ollamaExecutable) {
        $ollamaCommand = Get-Command "ollama" -ErrorAction SilentlyContinue
        if ($ollamaCommand) {
            $ollamaExecutable = $ollamaCommand.Source
        }
        else {
            $ollamaExecutable = "ollama"
        }
    }

    $modelsDir = $env:OLLAMA_MODELS
    if (-not $modelsDir) {
        $modelsDir = Join-Path $env:USERPROFILE ".ollama\models"
    }

    return @{
        Executable = $ollamaExecutable
        ModelsDir  = $modelsDir
        BaseUrl    = "http://127.0.0.1:11434"
    }
}

function Test-OllamaReady {
    param(
        [string]$BaseUrl,
        [int]$TimeoutSeconds = 3
    )

    try {
        Invoke-RestMethod -Uri "$BaseUrl/api/tags" -TimeoutSec $TimeoutSeconds | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Wait-OllamaReady {
    param(
        [string]$BaseUrl,
        [int]$Attempts = 25
    )

    for ($index = 0; $index -lt $Attempts; $index++) {
        if (Test-OllamaReady -BaseUrl $BaseUrl) {
            return $true
        }

        Start-Sleep -Seconds 1
    }

    return $false
}

function Ensure-OllamaRunning {
    $defaults = Get-OllamaDefaults

    if (-not (Get-Command $defaults.Executable -ErrorAction SilentlyContinue)) {
        throw "Could not find Ollama at $($defaults.Executable)"
    }

    New-Item -ItemType Directory -Force $defaults.ModelsDir | Out-Null
    $env:OLLAMA_MODELS = $defaults.ModelsDir

    if (Test-OllamaReady -BaseUrl $defaults.BaseUrl) {
        Write-Host "Ollama is already running." -ForegroundColor Green
        Write-Host "Base URL     : $($defaults.BaseUrl)"
        Write-Host "Models folder: $env:OLLAMA_MODELS"
        return $defaults
    }

    Write-Host "Starting Ollama in the background..." -ForegroundColor Cyan
    Write-Host "Base URL     : $($defaults.BaseUrl)"
    Write-Host "Models folder: $env:OLLAMA_MODELS"

    $process = Start-Process -FilePath $defaults.Executable -ArgumentList "serve" -PassThru -WindowStyle Hidden

    if (-not (Wait-OllamaReady -BaseUrl $defaults.BaseUrl)) {
        if ($process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force
        }

        throw "Ollama did not become ready on $($defaults.BaseUrl)."
    }

    Write-Host "Ollama is ready." -ForegroundColor Green
    return $defaults
}

function Use-FastOllamaMode {
    $defaults = Get-OllamaDefaults

    $env:KNOWLEDGE_COPILOT_EMBEDDING_PROVIDER = "ollama"
    $env:KNOWLEDGE_COPILOT_EMBEDDING_MODEL = "nomic-embed-text"
    $env:KNOWLEDGE_COPILOT_RERANKER_PROVIDER = "local"
    $env:KNOWLEDGE_COPILOT_RERANKER_MODEL = "smart-local"
    $env:KNOWLEDGE_COPILOT_ANSWER_PROVIDER = "ollama"
    $env:KNOWLEDGE_COPILOT_ANSWER_MODEL = "qwen2.5:3b"
    $env:OLLAMA_BASE_URL = $defaults.BaseUrl
    $env:KNOWLEDGE_COPILOT_PROVIDER_TIMEOUT_SECONDS = "180"
}

function Use-FullOllamaMode {
    $defaults = Get-OllamaDefaults

    $env:KNOWLEDGE_COPILOT_EMBEDDING_PROVIDER = "ollama"
    $env:KNOWLEDGE_COPILOT_EMBEDDING_MODEL = "nomic-embed-text"
    $env:KNOWLEDGE_COPILOT_RERANKER_PROVIDER = "local"
    $env:KNOWLEDGE_COPILOT_RERANKER_MODEL = "smart-local"
    $env:KNOWLEDGE_COPILOT_ANSWER_PROVIDER = "ollama"
    $env:KNOWLEDGE_COPILOT_ANSWER_MODEL = "qwen2.5:3b"
    $env:OLLAMA_BASE_URL = $defaults.BaseUrl
    $env:KNOWLEDGE_COPILOT_PROVIDER_TIMEOUT_SECONDS = "180"
}
