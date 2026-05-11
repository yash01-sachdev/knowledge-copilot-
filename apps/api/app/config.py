from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class Settings:
    app_name: str
    data_dir: Path
    database_path: Path
    cors_origins: tuple[str, ...]
    vector_store_provider: str = "chroma"
    chroma_path: Path = Path("./data/chroma")
    chroma_collection_name: str = "knowledge_copilot_chunks"
    semantic_limit: int = 12
    keyword_limit: int = 12
    answer_limit: int = 6
    embedding_provider: str = "local"
    embedding_model: str = "text-embedding-3-small"
    answer_provider: str = "local"
    answer_model: str = "gpt-4.1-mini"
    reranker_provider: str = "local"
    reranker_model: str = "gpt-4.1-mini"
    openai_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    ollama_base_url: str = "http://127.0.0.1:11434"
    provider_timeout_seconds: float = 20.0
    embedding_batch_size: int = 24
    reranker_limit: int = 8
    eval_output_path: Path | None = None

    @classmethod
    def from_env(cls) -> "Settings":
        repo_root = Path(__file__).resolve().parents[3]
        data_dir = Path(os.getenv("KNOWLEDGE_COPILOT_DATA_DIR", repo_root / "data"))
        database_path = Path(
            os.getenv("KNOWLEDGE_COPILOT_DB_PATH", data_dir / "knowledge_copilot.db")
        )
        raw_origins = os.getenv(
            "KNOWLEDGE_COPILOT_CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000",
        )
        cors_origins = tuple(origin.strip() for origin in raw_origins.split(",") if origin.strip())
        eval_output_path = Path(
            os.getenv(
                "KNOWLEDGE_COPILOT_EVAL_OUTPUT_PATH",
                data_dir / "evals" / "latest-report.json",
            )
        )
        return cls(
            app_name="Knowledge Copilot API",
            data_dir=data_dir,
            database_path=database_path,
            cors_origins=cors_origins,
            vector_store_provider=os.getenv("KNOWLEDGE_COPILOT_VECTOR_STORE", "chroma").strip().lower(),
            chroma_path=Path(os.getenv("KNOWLEDGE_COPILOT_CHROMA_PATH", data_dir / "chroma")),
            chroma_collection_name=os.getenv(
                "KNOWLEDGE_COPILOT_CHROMA_COLLECTION",
                "knowledge_copilot_chunks",
            ).strip(),
            embedding_provider=os.getenv("KNOWLEDGE_COPILOT_EMBEDDING_PROVIDER", "local").strip().lower(),
            embedding_model=os.getenv("KNOWLEDGE_COPILOT_EMBEDDING_MODEL", "text-embedding-3-small").strip(),
            answer_provider=os.getenv("KNOWLEDGE_COPILOT_ANSWER_PROVIDER", "local").strip().lower(),
            answer_model=os.getenv("KNOWLEDGE_COPILOT_ANSWER_MODEL", "gpt-4.1-mini").strip(),
            reranker_provider=os.getenv("KNOWLEDGE_COPILOT_RERANKER_PROVIDER", "local").strip().lower(),
            reranker_model=os.getenv("KNOWLEDGE_COPILOT_RERANKER_MODEL", "gpt-4.1-mini").strip(),
            openai_api_key=os.getenv("OPENAI_API_KEY"),
            openai_base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").strip().rstrip("/"),
            ollama_base_url=os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").strip().rstrip("/"),
            provider_timeout_seconds=float(os.getenv("KNOWLEDGE_COPILOT_PROVIDER_TIMEOUT_SECONDS", "20")),
            embedding_batch_size=int(os.getenv("KNOWLEDGE_COPILOT_EMBEDDING_BATCH_SIZE", "24")),
            reranker_limit=int(os.getenv("KNOWLEDGE_COPILOT_RERANKER_LIMIT", "8")),
            eval_output_path=eval_output_path,
        )
