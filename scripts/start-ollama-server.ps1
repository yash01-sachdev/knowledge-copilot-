$helperPath = Join-Path $PSScriptRoot "ollama-common.ps1"
. $helperPath

$defaults = Get-OllamaDefaults

if (-not (Get-Command $defaults.Executable -ErrorAction SilentlyContinue)) {
  Write-Error "Could not find Ollama at $($defaults.Executable)"
  exit 1
}

try {
  New-Item -ItemType Directory -Force $defaults.ModelsDir | Out-Null
  $env:OLLAMA_MODELS = $defaults.ModelsDir
  $tags = Invoke-RestMethod -Uri "$($defaults.BaseUrl)/api/tags" -TimeoutSec 3
  Write-Host "Ollama is already running." -ForegroundColor Green
  Write-Host "Base URL     : $($defaults.BaseUrl)"
  Write-Host "Models folder: $env:OLLAMA_MODELS"

  if ($tags.models.Count -gt 0) {
    Write-Host "Available models:"
    foreach ($model in $tags.models) {
      Write-Host "- $($model.name)"
    }
  }

  Write-Host ""
  Write-Host "Next: run the backend and frontend scripts in separate terminals."
  exit 0
} catch {
  # If the health check fails, start the local Ollama server below.
}

Write-Host "Starting Ollama server..." -ForegroundColor Cyan
Write-Host "Models folder: $env:OLLAMA_MODELS"
Write-Host "Keep this terminal open while using the app."
Write-Host ""

& $defaults.Executable serve
