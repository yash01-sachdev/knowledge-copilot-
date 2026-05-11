#!/bin/sh
set -eu

export KNOWLEDGE_COPILOT_DB_PATH="${KNOWLEDGE_COPILOT_DB_PATH:-/app/data/knowledge_copilot.db}"
export KNOWLEDGE_COPILOT_CHROMA_PATH="${KNOWLEDGE_COPILOT_CHROMA_PATH:-/app/data/chroma}"
export KNOWLEDGE_COPILOT_VECTOR_STORE="${KNOWLEDGE_COPILOT_VECTOR_STORE:-chroma}"
export KNOWLEDGE_COPILOT_EMBEDDING_PROVIDER="${KNOWLEDGE_COPILOT_EMBEDDING_PROVIDER:-ollama}"
export KNOWLEDGE_COPILOT_EMBEDDING_MODEL="${KNOWLEDGE_COPILOT_EMBEDDING_MODEL:-nomic-embed-text}"
export KNOWLEDGE_COPILOT_RERANKER_PROVIDER="${KNOWLEDGE_COPILOT_RERANKER_PROVIDER:-local}"
export KNOWLEDGE_COPILOT_ANSWER_PROVIDER="${KNOWLEDGE_COPILOT_ANSWER_PROVIDER:-local}"
export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"

mkdir -p "$(dirname "$KNOWLEDGE_COPILOT_DB_PATH")" "$KNOWLEDGE_COPILOT_CHROMA_PATH"

ollama serve >/tmp/ollama.log 2>&1 &

for _ in $(seq 1 90); do
  if curl -fsS "${OLLAMA_BASE_URL}/api/tags" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "${OLLAMA_BASE_URL}/api/tags" >/dev/null 2>&1; then
  echo "Ollama failed to start."
  cat /tmp/ollama.log || true
  exit 1
fi

if ! ollama list | awk 'NR > 1 {print $1}' | grep -qx "$KNOWLEDGE_COPILOT_EMBEDDING_MODEL"; then
  ollama pull "$KNOWLEDGE_COPILOT_EMBEDDING_MODEL"
fi

python - <<'PY'
from app.config import Settings
from app.repository import SQLiteRepository
from app.service import KnowledgeService

settings = Settings.from_env()
service = KnowledgeService(SQLiteRepository(settings.database_path), settings)
service.load_demo_notes()
PY

exec uvicorn app.main:app --host 0.0.0.0 --port 7860
