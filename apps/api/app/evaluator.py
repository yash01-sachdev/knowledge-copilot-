from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from statistics import mean

from .domain import QueryDiagnostics
from .schemas import QueryRequest, QueryResponse
from .service import KnowledgeService


@dataclass(frozen=True, slots=True)
class EvaluationCase:
    case_id: str
    category: str
    question: str
    expect_answer: bool
    expected_note_titles: list[str]
    minimum_relevant_citations: int = 1
    top_k: int = 5


@dataclass(frozen=True, slots=True)
class EvaluationCaseResult:
    case_id: str
    category: str
    question: str
    expect_answer: bool
    passed: bool
    retrieval_hit: bool
    top_citation_hit: bool
    citation_precision: float
    no_answer_correct: bool
    cited_titles: list[str]
    relevant_titles: list[str]
    insufficient_evidence: bool
    diagnostics: QueryDiagnostics


def load_evaluation_cases(dataset_path: Path) -> list[EvaluationCase]:
    payload = json.loads(dataset_path.read_text(encoding="utf-8"))
    return [
        EvaluationCase(
            case_id=item["case_id"],
            category=item["category"],
            question=item["question"],
            expect_answer=bool(item["expect_answer"]),
            expected_note_titles=list(item.get("expected_note_titles", [])),
            minimum_relevant_citations=int(item.get("minimum_relevant_citations", 1)),
            top_k=int(item.get("top_k", 5)),
        )
        for item in payload
    ]


def evaluate_cases(
    service: KnowledgeService,
    cases: list[EvaluationCase],
) -> dict[str, object]:
    results = [_evaluate_case(service, case) for case in cases]
    positive_results = [result for result in results if result.expect_answer]
    negative_results = [result for result in results if not result.expect_answer]

    summary = {
        "dataset_size": len(results),
        "positive_cases": len(positive_results),
        "negative_cases": len(negative_results),
        "retrieval_hit_rate": _safe_mean(result.retrieval_hit for result in positive_results),
        "top_citation_hit_rate": _safe_mean(result.top_citation_hit for result in positive_results),
        "citation_precision_avg": _safe_mean(result.citation_precision for result in positive_results),
        "no_answer_accuracy": _safe_mean(result.no_answer_correct for result in results),
        "negative_case_accuracy": _safe_mean(result.no_answer_correct for result in negative_results),
        "overall_pass_rate": _safe_mean(result.passed for result in results),
        "avg_total_latency_ms": _safe_mean(result.diagnostics.total_latency_ms for result in results),
        "avg_retrieval_latency_ms": _safe_mean(
            result.diagnostics.retrieval_latency_ms for result in results
        ),
        "avg_rerank_latency_ms": _safe_mean(
            result.diagnostics.rerank_latency_ms for result in results
        ),
        "avg_generation_latency_ms": _safe_mean(
            result.diagnostics.generation_latency_ms for result in results
        ),
        "p95_total_latency_ms": _p95(result.diagnostics.total_latency_ms for result in results),
        "semantic_modes": sorted({result.diagnostics.semantic_mode for result in results}),
        "answer_providers": sorted({result.diagnostics.answer_provider for result in results}),
    }

    return {
        "summary": summary,
        "cases": [
            {
                **asdict(result),
                "diagnostics": asdict(result.diagnostics),
            }
            for result in results
        ],
    }


def write_evaluation_report(report: dict[str, object], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")


def _evaluate_case(service: KnowledgeService, case: EvaluationCase) -> EvaluationCaseResult:
    response, diagnostics = service.answer_question_with_diagnostics(
        QueryRequest(question=case.question, top_k=case.top_k)
    )
    cited_titles = [citation.title for citation in response.citations]
    relevant_titles = [title for title in cited_titles if title in case.expected_note_titles]
    retrieval_hit = (
        len(set(relevant_titles)) >= case.minimum_relevant_citations
        if case.expect_answer
        else len(cited_titles) == 0
    )
    top_citation_hit = (
        bool(cited_titles) and cited_titles[0] in case.expected_note_titles
        if case.expect_answer
        else len(cited_titles) == 0
    )
    citation_precision = _citation_precision(case, response)
    no_answer_correct = response.insufficient_evidence == (not case.expect_answer)

    return EvaluationCaseResult(
        case_id=case.case_id,
        category=case.category,
        question=case.question,
        expect_answer=case.expect_answer,
        passed=retrieval_hit and no_answer_correct,
        retrieval_hit=retrieval_hit,
        top_citation_hit=top_citation_hit,
        citation_precision=round(citation_precision, 3),
        no_answer_correct=no_answer_correct,
        cited_titles=cited_titles,
        relevant_titles=relevant_titles,
        insufficient_evidence=response.insufficient_evidence,
        diagnostics=diagnostics,
    )


def _citation_precision(case: EvaluationCase, response: QueryResponse) -> float:
    if not response.citations:
        return 1.0 if not case.expect_answer else 0.0

    if not case.expect_answer:
        return 0.0

    relevant_count = sum(1 for citation in response.citations if citation.title in case.expected_note_titles)
    return relevant_count / len(response.citations)


def _safe_mean(values: list[float] | tuple[float, ...] | object) -> float:
    items = [float(value) for value in values]
    if not items:
        return 0.0
    return round(mean(items), 3)


def _p95(values: list[float] | tuple[float, ...] | object) -> float:
    items = sorted(float(value) for value in values)
    if not items:
        return 0.0
    index = max(0, round((len(items) - 1) * 0.95))
    return round(items[index], 3)
