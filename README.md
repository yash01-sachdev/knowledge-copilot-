# Knowledge Copilot

Knowledge Copilot is a local-first personal knowledge assistant built around a cleaner product flow:

- `/write`: a note-app style editor with a sidebar, manual editing, file import, and folder sync
- `/ask`: a focused grounded-answer page for asking questions over your note base
- `/memory`: a dedicated view for recurring themes, persistent note links, and the note timeline

## Stack

- `apps/api`: FastAPI backend
- `apps/web`: Next.js frontend
- Local note storage: SQLite + FTS5
- Local vector retrieval: ChromaDB
- Local semantic fallback: TF-IDF + latent semantic indexing
- Ollama-backed local embeddings for stronger semantic retrieval
- Local reranking and grounded answer composition without hosted LLM APIs

## What it does

- Create and update notes manually
- Import `.txt`, `.md`, and `.markdown` files from the UI
- Sync an entire folder of notes, which is the practical path for phone-authored markdown/text notes
- Query across notes with hybrid retrieval
- Use Chroma-backed vector retrieval with Ollama embeddings without changing the product flow
- Fall back to lightweight local retrieval when no embedding provider is configured
- Show dated citations and why they were selected
- Surface better phrase-based recurring themes
- Persist note-to-note links as a reusable memory graph
- Render a dedicated timeline and memory page outside the answer view
- Return action prompts when the evidence supports them
- Capture useful / needs work feedback
- Load a demo dataset for quick testing

## Run locally

### Fast Ollama setup

Use this mode first. It uses Ollama for real note embeddings, while keeping reranking and final answer writing local so the app stays responsive.

Open three PowerShell terminals:

```powershell
.\scripts\start-ollama-server.ps1
```

```powershell
.\scripts\start-backend-ollama.ps1
```

```powershell
.\scripts\start-frontend.ps1
```

Then open `http://localhost:3000`.

If you want to prove the local LLM answer path, use this backend script instead of `start-backend-ollama.ps1`:

```powershell
.\scripts\start-backend-full-ollama.ps1
```

That mode uses `qwen2.5:3b` for answer generation, but it can take around a minute per answer on slower CPU-only machines.

### One-command provider check

To verify the recommended local provider mode:

```powershell
.\scripts\run-fast-provider-smoke.ps1
```

That confirms:

- Ollama embeddings are reachable
- the local grounded answer path still works
- the recommended day-to-day mode is wired correctly

### Backend

```powershell
cd apps\api
..\..\.venv\Scripts\python -m uvicorn app.main:app --reload
```

### Frontend

```powershell
cd apps\web
$env:NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000"
npm run dev
```

## Provider setup

By default the backend can stay fully local:

- `KNOWLEDGE_COPILOT_VECTOR_STORE=chroma`
- `KNOWLEDGE_COPILOT_CHROMA_PATH=./data/chroma`
- `KNOWLEDGE_COPILOT_EMBEDDING_PROVIDER=local`
- `KNOWLEDGE_COPILOT_ANSWER_PROVIDER=local`
- `KNOWLEDGE_COPILOT_RERANKER_PROVIDER=local`

### Ollama example

```powershell
$env:KNOWLEDGE_COPILOT_VECTOR_STORE = "chroma"
$env:KNOWLEDGE_COPILOT_CHROMA_PATH = "./data/chroma"
$env:KNOWLEDGE_COPILOT_EMBEDDING_PROVIDER = "ollama"
$env:KNOWLEDGE_COPILOT_EMBEDDING_MODEL = "nomic-embed-text"
$env:KNOWLEDGE_COPILOT_RERANKER_PROVIDER = "local"
$env:KNOWLEDGE_COPILOT_RERANKER_MODEL = "heuristic"
$env:KNOWLEDGE_COPILOT_ANSWER_PROVIDER = "local"
$env:KNOWLEDGE_COPILOT_ANSWER_MODEL = "heuristic"
$env:OLLAMA_BASE_URL = "http://127.0.0.1:11434"
```

That is the recommended fast local mode.

The answer page now shows a beginner-friendly `Run details` panel so you can see:

- which semantic search path ran, including `chroma:<provider>:<model>` when the vector index is active
- whether the reranker stayed local or used a provider
- which model wrote the final answer
- how long retrieval, reranking, and generation took

## Test commands

### Backend tests

```powershell
cd apps\api
..\..\.venv\Scripts\python -m pytest
```

### Frontend tests

```powershell
cd apps\web
npm test
```

### Frontend lint and build

```powershell
cd apps\web
npm run lint
npm run build
```

### Eval run

```powershell
.\.venv\Scripts\python apps\api\scripts\run_eval.py
```

That seeds the demo notes into a temporary database, runs the labeled eval set in `apps/api/evals/demo-eval-set.json`, prints the summary metrics, and writes the latest report to `data/evals/latest-report.json`.

### Provider smoke test

```powershell
.\.venv\Scripts\python apps\api\scripts\provider_smoke.py
```

Use that after starting Ollama. It performs a tiny embedding, reranker, and answer probe with the currently configured local providers.

## Current architecture note

The current version keeps SQLite for notes, metadata, and FTS keyword search, while ChromaDB handles semantic vector retrieval. Ollama generates the embeddings, and the existing reranking and grounded answer flow stay local. That keeps ingestion, retrieval, memory graph generation, and the product flow stable while making the GenAI retrieval layer much easier to explain and deploy.

## Deployment-ready files

The repo now includes:

- `apps/api/Dockerfile`
- `apps/web/Dockerfile`
- `docker-compose.yml`
- `apps/api/.env.example`
- `apps/web/.env.example`
- `docs/deployment.md`

That means the current v1 is ready for a production-style local run today, and can be moved to a hosted frontend + backend setup next.

## Later upgrades

For the next meaningful step after deployment, see:

- `docs/roadmap.md`
# knowledge-copilot-
