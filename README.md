# Knowledge Copilot

Knowledge Copilot is a local-first personal knowledge assistant built around a cleaner product flow:

- `/write`: a note-app style editor with a sidebar, manual editing, file import, and folder sync
- `/ask`: a focused grounded-answer page for asking questions over your note base
- `/memory`: a dedicated view for recurring themes, persistent note links, and the note timeline

## Stack

- `apps/api`: FastAPI backend
- `apps/web`: Next.js frontend
- Local MVP storage: SQLite + FTS5
- Local semantic fallback: TF-IDF + latent semantic indexing
- Optional model layer: `OpenAI` or `Ollama` for chunk embeddings and grounded answer generation
- Optional provider-backed reranker: `OpenAI` or `Ollama`

## What it does

- Create and update notes manually
- Import `.txt`, `.md`, and `.markdown` files from the UI
- Sync an entire folder of notes, which is the practical path for phone-authored markdown/text notes
- Query across notes with hybrid retrieval
- Swap between local retrieval and provider-backed embeddings without changing the product flow
- Show dated citations and why they were selected
- Surface better phrase-based recurring themes
- Persist note-to-note links as a reusable memory graph
- Render a dedicated timeline and memory page outside the answer view
- Return action prompts when the evidence supports them
- Capture useful / needs work feedback
- Load a demo dataset for quick testing

## Run locally

### Backend

```powershell
cd E:\knowledge-copilot\apps\api
E:\knowledge-copilot\.venv\Scripts\python -m uvicorn app.main:app --reload
```

### Frontend

```powershell
cd E:\knowledge-copilot\apps\web
$env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000"
npm run dev
```

## Provider setup

By default the backend stays fully local:

- `KNOWLEDGE_COPILOT_EMBEDDING_PROVIDER=local`
- `KNOWLEDGE_COPILOT_ANSWER_PROVIDER=local`
- `KNOWLEDGE_COPILOT_RERANKER_PROVIDER=local`

### OpenAI example

```powershell
$env:OPENAI_API_KEY = "sk-..."
$env:KNOWLEDGE_COPILOT_EMBEDDING_PROVIDER = "openai"
$env:KNOWLEDGE_COPILOT_EMBEDDING_MODEL = "text-embedding-3-small"
$env:KNOWLEDGE_COPILOT_RERANKER_PROVIDER = "openai"
$env:KNOWLEDGE_COPILOT_RERANKER_MODEL = "gpt-4.1-mini"
$env:KNOWLEDGE_COPILOT_ANSWER_PROVIDER = "openai"
$env:KNOWLEDGE_COPILOT_ANSWER_MODEL = "gpt-4.1-mini"
```

### Ollama example

```powershell
$env:KNOWLEDGE_COPILOT_EMBEDDING_PROVIDER = "ollama"
$env:KNOWLEDGE_COPILOT_EMBEDDING_MODEL = "nomic-embed-text"
$env:KNOWLEDGE_COPILOT_RERANKER_PROVIDER = "ollama"
$env:KNOWLEDGE_COPILOT_RERANKER_MODEL = "qwen3:8b"
$env:KNOWLEDGE_COPILOT_ANSWER_PROVIDER = "ollama"
$env:KNOWLEDGE_COPILOT_ANSWER_MODEL = "qwen3:8b"
$env:OLLAMA_BASE_URL = "http://127.0.0.1:11434"
```

The answer page now shows a beginner-friendly `Run details` panel so you can see:

- which semantic search path ran
- whether the reranker stayed local or used a provider
- which model wrote the final answer
- how long retrieval, reranking, and generation took

## Test commands

### Backend tests

```powershell
cd E:\knowledge-copilot\apps\api
E:\knowledge-copilot\.venv\Scripts\python -m pytest
```

### Frontend tests

```powershell
cd E:\knowledge-copilot\apps\web
npm test
```

### Frontend lint and build

```powershell
cd E:\knowledge-copilot\apps\web
npm run lint
npm run build
```

### Eval run

```powershell
cd E:\knowledge-copilot
E:\knowledge-copilot\.venv\Scripts\python apps\api\scripts\run_eval.py
```

That seeds the demo notes into a temporary database, runs the labeled eval set in `apps/api/evals/demo-eval-set.json`, prints the summary metrics, and writes the latest report to `data/evals/latest-report.json`.

### Provider smoke test

```powershell
cd E:\knowledge-copilot
E:\knowledge-copilot\.venv\Scripts\python apps\api\scripts\provider_smoke.py
```

Use that after setting `OPENAI_API_KEY` or starting Ollama. It performs a tiny embedding, reranker, and answer probe with the currently configured providers.

## Current architecture note

The original target architecture was Postgres + pgvector. This machine does not have Docker or Postgres installed, so the current version keeps SQLite for storage while adding a clean provider layer for real embeddings and answer generation. That keeps the ingestion, retrieval, reranking, and grounding flow stable, while still giving the project a production-style model integration story.
