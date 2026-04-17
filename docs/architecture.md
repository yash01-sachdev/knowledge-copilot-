# Knowledge Copilot Architecture

## Product shape

The app now has three primary surfaces:

1. `Write`: a dedicated notes workspace with sidebar navigation and editor pane
2. `Ask`: a focused answer surface for grounded retrieval and citations
3. `Memory`: a separate overview page for themes, persistent links, and timeline exploration

## Stack

- Frontend: Next.js
- Backend: FastAPI
- Storage for local MVP: SQLite + FTS5
- Semantic retrieval fallback: in-process TF-IDF + latent semantic indexing
- Optional provider-backed embeddings: OpenAI or Ollama
- Optional provider-backed reranker: OpenAI or Ollama
- Optional provider-backed answer generation: OpenAI or Ollama

## Why local-first for MVP

The agreed target architecture was Postgres + pgvector, but the current machine does not have Docker or Postgres installed. To keep the MVP testable end to end, the app uses a storage abstraction and a local search engine. The ingestion, retrieval, reranking, and response flow stay the same, so moving to Postgres + pgvector in v2 is a storage swap rather than a product rewrite.

## Retrieval pipeline

1. Notes are normalized and chunked with overlap.
2. Each chunk is stored in SQLite.
3. If an embedding provider is configured, missing chunk embeddings are generated and persisted with provider/model metadata.
4. SQLite FTS5 handles lexical retrieval.
5. Semantic search uses stored provider embeddings when available, otherwise it falls back to TF-IDF + TruncatedSVD.
6. Query results from both channels are merged and locally reranked.
7. If a reranker provider is configured, the top candidate set is rescored through OpenAI or Ollama and blended back into the local scores.
8. The answer composer builds a grounded response from the best evidence, and can optionally hand the final answer rewrite to OpenAI or Ollama through a provider interface.

## Model layer

There are now three answer / retrieval modes:

1. `local`: TF-IDF semantic retrieval plus heuristic grounded answer composition
2. `openai`: provider-backed embeddings, optional provider reranking, and grounded answer rewrite through the Responses API
3. `ollama`: provider-backed embeddings, optional provider reranking, and grounded answer rewrite through the local Ollama API

The retrieval and citation flow stays the same across all three modes. Only the semantic vector source and final answer generation layer change.

## Evaluation layer

The backend now includes a labeled evaluation harness:

- dataset: `apps/api/evals/demo-eval-set.json`
- runner: `apps/api/scripts/run_eval.py`
- report output: `data/evals/latest-report.json`

The current report tracks:

- retrieval hit rate
- top citation hit rate
- average citation precision
- no-answer accuracy
- average retrieval latency
- average rerank latency
- average generation latency
- total latency including p95

## Notes and sync flow

- Manual note creation and editing
- File-based import from the frontend
- Folder sync for cloud-synced markdown / text notes
- Note metadata tracking with `updated_at` and `source_path`

## V2 memory layer

There are now two memory layers:

1. Query-scoped memory projections in the answer response
2. A persistent global memory graph built from all notes

### Query-scoped memory projections

- `recurring_themes`: summaries of repeated themes across the retrieved evidence
- `note_links`: lightweight links between notes surfaced inside a single query
- `timeline`: dated evidence moments derived from the ranked retrieval set

### Persistent global memory graph

- note-level phrase extraction uses weighted 1 to 3 word phrases
- note similarity uses TF-IDF plus TruncatedSVD as a lightweight embedding-style representation
- persistent links are stored in SQLite and exposed through `/api/memory/overview`
- the memory page renders:
  - recurring themes across the whole note base
  - a dated timeline of notes
  - graph nodes and persistent note links
