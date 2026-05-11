---
title: Knowledge Copilot API
emoji: 🧠
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# Knowledge Copilot API

This Space runs the Knowledge Copilot backend with:

- FastAPI on port `7860`
- Ollama for local embeddings
- ChromaDB for vector retrieval
- SQLite + FTS5 for notes and keyword search

The Space is meant for a public demo. It seeds demo notes on startup so the frontend has grounded content to query immediately.
