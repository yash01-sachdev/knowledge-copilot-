from datetime import date

from app.domain import ChunkRecord
from app.search import HybridSearchEngine, analyze_query, merge_candidates, rerank_candidates


def _sample_chunks() -> list[ChunkRecord]:
    return [
        ChunkRecord(
            chunk_id="c1",
            note_id="n1",
            title="Interview prep reset",
            note_date=date(2026, 2, 4),
            content="I should return to one deep focus block on RAG systems when I feel scattered.",
            chunk_index=0,
        ),
        ChunkRecord(
            chunk_id="c2",
            note_id="n2",
            title="When I feel stuck",
            note_date=date(2026, 2, 18),
            content="Pick one small implementation task, finish it, and only then zoom back out.",
            chunk_index=0,
        ),
        ChunkRecord(
            chunk_id="c3",
            note_id="n3",
            title="Energy patterns",
            note_date=date(2026, 3, 10),
            content="Sleep, morning sunlight, and a clean work plan strongly affect how steady I feel.",
            chunk_index=0,
        ),
    ]


def test_hybrid_search_engine_returns_relevant_semantic_match() -> None:
    engine = HybridSearchEngine()
    engine.rebuild(_sample_chunks())

    results = engine.semantic_search("What helps when I feel stuck?", limit=2)

    assert len(results) == 2
    assert results[0].title in {"When I feel stuck", "Interview prep reset"}


def test_hybrid_search_engine_skips_unrelated_semantic_hits() -> None:
    engine = HybridSearchEngine()
    engine.rebuild(_sample_chunks())

    results = engine.semantic_search("penguin turbine sandwich", limit=3)

    assert results == []


def test_merge_and_rerank_prioritizes_direct_overlap() -> None:
    engine = HybridSearchEngine()
    engine.rebuild(_sample_chunks())
    semantic_hits = engine.semantic_search("what should I do when I feel scattered", limit=3)

    merged = merge_candidates(semantic_hits, [])
    reranked = rerank_candidates("what should I do when I feel scattered", merged)

    assert reranked[0].title == "Interview prep reset"
    assert reranked[0].rerank_score >= reranked[-1].rerank_score


def test_analyze_query_marks_short_goal_question_as_action() -> None:
    profile = analyze_query("how do i win")

    assert profile.is_action_query is True
