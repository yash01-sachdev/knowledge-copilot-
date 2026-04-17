from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Protocol

import httpx

from .config import Settings
from .schemas import Citation, RecurringTheme


@dataclass(frozen=True, slots=True)
class GeneratedAnswerBundle:
    answer: str
    why_selected: str
    suggested_actions: list[str]


@dataclass(frozen=True, slots=True)
class AnswerGenerationRequest:
    question: str
    query_style: str
    citations: list[Citation]
    recurring_themes: list[RecurringTheme]
    fallback_answer: str
    fallback_why_selected: str
    fallback_actions: list[str]


@dataclass(frozen=True, slots=True)
class RerankItem:
    chunk_id: str
    title: str
    note_date: str
    content: str
    current_score: float


@dataclass(frozen=True, slots=True)
class RerankResult:
    chunk_id: str
    score: float


@dataclass(frozen=True, slots=True)
class RerankRequest:
    question: str
    items: list[RerankItem]


class EmbeddingProvider(Protocol):
    provider_name: str
    model_name: str

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        ...


class AnswerProvider(Protocol):
    provider_name: str
    model_name: str

    def generate(self, request: AnswerGenerationRequest) -> GeneratedAnswerBundle:
        ...


class RerankerProvider(Protocol):
    provider_name: str
    model_name: str

    def rerank(self, request: RerankRequest) -> list[RerankResult]:
        ...


class LocalAnswerProvider:
    provider_name = "local"
    model_name = "heuristic"

    def generate(self, request: AnswerGenerationRequest) -> GeneratedAnswerBundle:
        return GeneratedAnswerBundle(
            answer=request.fallback_answer,
            why_selected=request.fallback_why_selected,
            suggested_actions=request.fallback_actions,
        )


class LocalRerankerProvider:
    provider_name = "local"
    model_name = "heuristic"

    def rerank(self, request: RerankRequest) -> list[RerankResult]:
        return [
            RerankResult(chunk_id=item.chunk_id, score=item.current_score)
            for item in request.items
        ]


class OpenAIEmbeddingProvider:
    provider_name = "openai"

    def __init__(
        self,
        *,
        api_key: str,
        model_name: str,
        base_url: str,
        timeout_seconds: float,
        http_client: httpx.Client | None = None,
    ) -> None:
        self.model_name = model_name
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._client = http_client or httpx.Client(timeout=timeout_seconds)

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        response = self._client.post(
            f"{self._base_url}/embeddings",
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model_name,
                "input": texts,
            },
        )
        response.raise_for_status()
        payload = response.json()
        ordered = sorted(payload.get("data", []), key=lambda item: item.get("index", 0))
        embeddings = [item.get("embedding") for item in ordered]
        if len(embeddings) != len(texts) or any(not isinstance(item, list) for item in embeddings):
            raise ValueError("OpenAI embeddings response did not include the expected vectors.")
        return embeddings


class OllamaEmbeddingProvider:
    provider_name = "ollama"

    def __init__(
        self,
        *,
        model_name: str,
        base_url: str,
        timeout_seconds: float,
        http_client: httpx.Client | None = None,
    ) -> None:
        self.model_name = model_name
        self._base_url = base_url.rstrip("/")
        self._client = http_client or httpx.Client(timeout=timeout_seconds)

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        response = self._client.post(
            f"{self._base_url}/api/embed",
            json={"model": self.model_name, "input": texts},
        )
        if response.status_code < 400:
            payload = response.json()
            embeddings = payload.get("embeddings")
            if isinstance(embeddings, list) and len(embeddings) == len(texts):
                return embeddings

        legacy_embeddings: list[list[float]] = []
        for text in texts:
            legacy_response = self._client.post(
                f"{self._base_url}/api/embeddings",
                json={"model": self.model_name, "prompt": text},
            )
            legacy_response.raise_for_status()
            embedding = legacy_response.json().get("embedding")
            if not isinstance(embedding, list):
                raise ValueError("Ollama embeddings response did not include an embedding vector.")
            legacy_embeddings.append(embedding)
        return legacy_embeddings


class OpenAIAnswerProvider:
    provider_name = "openai"

    def __init__(
        self,
        *,
        api_key: str,
        model_name: str,
        base_url: str,
        timeout_seconds: float,
        http_client: httpx.Client | None = None,
    ) -> None:
        self.model_name = model_name
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._client = http_client or httpx.Client(timeout=timeout_seconds)

    def generate(self, request: AnswerGenerationRequest) -> GeneratedAnswerBundle:
        payload = {
            "model": self.model_name,
            "input": [
                {
                    "role": "system",
                    "content": [{"type": "input_text", "text": _answer_system_prompt()}],
                },
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": _answer_user_prompt(request)}],
                },
            ],
            "max_output_tokens": 900,
        }
        response = self._client.post(
            f"{self._base_url}/responses",
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        response.raise_for_status()
        text = _extract_openai_output_text(response.json())
        return _parse_generated_answer(text, request)


class OpenAIRerankerProvider:
    provider_name = "openai"

    def __init__(
        self,
        *,
        api_key: str,
        model_name: str,
        base_url: str,
        timeout_seconds: float,
        http_client: httpx.Client | None = None,
    ) -> None:
        self.model_name = model_name
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._client = http_client or httpx.Client(timeout=timeout_seconds)

    def rerank(self, request: RerankRequest) -> list[RerankResult]:
        response = self._client.post(
            f"{self._base_url}/responses",
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model_name,
                "input": [
                    {
                        "role": "system",
                        "content": [{"type": "input_text", "text": _reranker_system_prompt()}],
                    },
                    {
                        "role": "user",
                        "content": [{"type": "input_text", "text": _reranker_user_prompt(request)}],
                    },
                ],
                "max_output_tokens": 900,
            },
        )
        response.raise_for_status()
        return _parse_rerank_results(_extract_openai_output_text(response.json()), request)


class OllamaAnswerProvider:
    provider_name = "ollama"

    def __init__(
        self,
        *,
        model_name: str,
        base_url: str,
        timeout_seconds: float,
        http_client: httpx.Client | None = None,
    ) -> None:
        self.model_name = model_name
        self._base_url = base_url.rstrip("/")
        self._client = http_client or httpx.Client(timeout=timeout_seconds)

    def generate(self, request: AnswerGenerationRequest) -> GeneratedAnswerBundle:
        response = self._client.post(
            f"{self._base_url}/api/chat",
            json={
                "model": self.model_name,
                "stream": False,
                "format": "json",
                "messages": [
                    {"role": "system", "content": _answer_system_prompt()},
                    {"role": "user", "content": _answer_user_prompt(request)},
                ],
                "options": {"temperature": 0.2},
            },
        )
        response.raise_for_status()
        payload = response.json()
        content = payload.get("message", {}).get("content", "")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("Ollama answer response did not include any assistant content.")
        return _parse_generated_answer(content, request)


class OllamaRerankerProvider:
    provider_name = "ollama"

    def __init__(
        self,
        *,
        model_name: str,
        base_url: str,
        timeout_seconds: float,
        http_client: httpx.Client | None = None,
    ) -> None:
        self.model_name = model_name
        self._base_url = base_url.rstrip("/")
        self._client = http_client or httpx.Client(timeout=timeout_seconds)

    def rerank(self, request: RerankRequest) -> list[RerankResult]:
        response = self._client.post(
            f"{self._base_url}/api/chat",
            json={
                "model": self.model_name,
                "stream": False,
                "format": "json",
                "messages": [
                    {"role": "system", "content": _reranker_system_prompt()},
                    {"role": "user", "content": _reranker_user_prompt(request)},
                ],
                "options": {"temperature": 0},
            },
        )
        response.raise_for_status()
        payload = response.json()
        content = payload.get("message", {}).get("content", "")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("Ollama reranker response did not include any assistant content.")
        return _parse_rerank_results(content, request)


def build_embedding_provider(settings: Settings) -> EmbeddingProvider | None:
    provider = settings.embedding_provider.strip().lower()
    if provider in {"", "local", "none"}:
        return None
    if provider == "openai":
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY is required when KNOWLEDGE_COPILOT_EMBEDDING_PROVIDER=openai.")
        return OpenAIEmbeddingProvider(
            api_key=settings.openai_api_key,
            model_name=settings.embedding_model,
            base_url=settings.openai_base_url,
            timeout_seconds=settings.provider_timeout_seconds,
        )
    if provider == "ollama":
        return OllamaEmbeddingProvider(
            model_name=settings.embedding_model or "nomic-embed-text",
            base_url=settings.ollama_base_url,
            timeout_seconds=settings.provider_timeout_seconds,
        )
    raise ValueError(f"Unsupported embedding provider: {settings.embedding_provider}")


def build_answer_provider(settings: Settings) -> AnswerProvider:
    provider = settings.answer_provider.strip().lower()
    if provider in {"", "local", "none"}:
        return LocalAnswerProvider()
    if provider == "openai":
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY is required when KNOWLEDGE_COPILOT_ANSWER_PROVIDER=openai.")
        return OpenAIAnswerProvider(
            api_key=settings.openai_api_key,
            model_name=settings.answer_model,
            base_url=settings.openai_base_url,
            timeout_seconds=settings.provider_timeout_seconds,
        )
    if provider == "ollama":
        return OllamaAnswerProvider(
            model_name=settings.answer_model or "qwen3:8b",
            base_url=settings.ollama_base_url,
            timeout_seconds=settings.provider_timeout_seconds,
        )
    raise ValueError(f"Unsupported answer provider: {settings.answer_provider}")


def build_reranker_provider(settings: Settings) -> RerankerProvider | None:
    provider = settings.reranker_provider.strip().lower()
    if provider in {"", "local", "none"}:
        return None
    if provider == "openai":
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY is required when KNOWLEDGE_COPILOT_RERANKER_PROVIDER=openai.")
        return OpenAIRerankerProvider(
            api_key=settings.openai_api_key,
            model_name=settings.reranker_model,
            base_url=settings.openai_base_url,
            timeout_seconds=settings.provider_timeout_seconds,
        )
    if provider == "ollama":
        return OllamaRerankerProvider(
            model_name=settings.reranker_model or "qwen3:8b",
            base_url=settings.ollama_base_url,
            timeout_seconds=settings.provider_timeout_seconds,
        )
    raise ValueError(f"Unsupported reranker provider: {settings.reranker_provider}")


def _answer_system_prompt() -> str:
    return (
        "You are generating grounded answers for a personal knowledge copilot. "
        "Use only the supplied note evidence. Do not invent facts or citations. "
        "Return strict JSON with keys answer, why_selected, and suggested_actions. "
        "suggested_actions must be an array of 1 to 3 short strings."
    )


def _reranker_system_prompt() -> str:
    return (
        "You are a retrieval reranker for a personal knowledge copilot. "
        "Score each candidate note chunk for how directly it answers the user's question. "
        "Return strict JSON with one key named results. "
        "results must be an array of objects with chunk_id and score. "
        "Use scores from 0.0 to 1.0. Prefer direct, grounded relevance over broad thematic overlap."
    )


def _answer_user_prompt(request: AnswerGenerationRequest) -> str:
    citation_lines = []
    for citation in request.citations:
        citation_lines.append(
            f"- {citation.title} ({citation.note_date.isoformat()} | {citation.reason}) :: {citation.excerpt}"
        )

    theme_lines = [f"- {theme.theme}: {theme.summary}" for theme in request.recurring_themes[:4]]
    return (
        f"Question: {request.question}\n"
        f"Query style: {request.query_style}\n\n"
        "Citations:\n"
        f"{chr(10).join(citation_lines) if citation_lines else '- none'}\n\n"
        "Recurring themes:\n"
        f"{chr(10).join(theme_lines) if theme_lines else '- none'}\n\n"
        "Fallback grounded draft:\n"
        f"answer: {request.fallback_answer}\n"
        f"why_selected: {request.fallback_why_selected}\n"
        f"suggested_actions: {json.dumps(request.fallback_actions)}\n\n"
        "Rewrite the fallback into a concise, direct answer that stays grounded in the citations."
    )


def _reranker_user_prompt(request: RerankRequest) -> str:
    item_lines = []
    for item in request.items:
        item_lines.append(
            f"- chunk_id: {item.chunk_id}\n"
            f"  title: {item.title}\n"
            f"  note_date: {item.note_date}\n"
            f"  current_score: {item.current_score:.3f}\n"
            f"  content: {item.content}"
        )
    return (
        f"Question: {request.question}\n\n"
        "Candidates:\n"
        f"{chr(10).join(item_lines)}\n\n"
        "Return JSON only."
    )


def _extract_openai_output_text(payload: dict[str, object]) -> str:
    direct_text = payload.get("output_text")
    if isinstance(direct_text, str) and direct_text.strip():
        return direct_text

    output = payload.get("output")
    if not isinstance(output, list):
        raise ValueError("OpenAI response payload did not contain output text.")

    parts: list[str] = []
    for item in output:
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []):
            if not isinstance(content, dict):
                continue
            text_value = content.get("text")
            if isinstance(text_value, str) and text_value.strip():
                parts.append(text_value)
    text = "\n".join(parts).strip()
    if not text:
        raise ValueError("OpenAI response payload did not contain readable text.")
    return text


def _parse_generated_answer(text: str, request: AnswerGenerationRequest) -> GeneratedAnswerBundle:
    try:
        payload = _extract_json_payload(text)
    except (ValueError, json.JSONDecodeError):
        return GeneratedAnswerBundle(
            answer=request.fallback_answer,
            why_selected=request.fallback_why_selected,
            suggested_actions=request.fallback_actions,
        )

    answer = payload.get("answer")
    why_selected = payload.get("why_selected")
    suggested_actions = payload.get("suggested_actions")

    if not isinstance(answer, str) or not answer.strip():
        answer = request.fallback_answer
    if not isinstance(why_selected, str) or not why_selected.strip():
        why_selected = request.fallback_why_selected
    if not isinstance(suggested_actions, list):
        suggested_actions = request.fallback_actions

    cleaned_actions = [
        str(item).strip()
        for item in suggested_actions
        if str(item).strip()
    ]
    if not cleaned_actions:
        cleaned_actions = request.fallback_actions

    return GeneratedAnswerBundle(
        answer=answer.strip(),
        why_selected=why_selected.strip(),
        suggested_actions=cleaned_actions[:3],
    )


def _parse_rerank_results(text: str, request: RerankRequest) -> list[RerankResult]:
    payload = _extract_json_payload(text)
    raw_results = payload.get("results")
    if not isinstance(raw_results, list):
        raise ValueError("Provider reranker response did not include results.")

    scores_by_id = {item.chunk_id: item.current_score for item in request.items}
    for raw_item in raw_results:
        if not isinstance(raw_item, dict):
            continue
        chunk_id = raw_item.get("chunk_id")
        score = raw_item.get("score")
        if not isinstance(chunk_id, str):
            continue
        try:
            numeric_score = float(score)
        except (TypeError, ValueError):
            continue
        scores_by_id[chunk_id] = max(0.0, min(1.0, numeric_score))

    return [
        RerankResult(chunk_id=item.chunk_id, score=scores_by_id[item.chunk_id])
        for item in request.items
    ]


def _extract_json_payload(text: str) -> dict[str, object]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if not match:
        raise ValueError("No JSON object found in provider response.")
    payload = json.loads(match.group(0))
    if not isinstance(payload, dict):
        raise ValueError("Provider response JSON was not an object.")
    return payload
