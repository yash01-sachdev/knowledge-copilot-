from datetime import date

from app.composer import compose_answer
from app.domain import SearchCandidate


def test_compose_answer_drops_off_topic_supporting_note() -> None:
    response = compose_answer(
        "what do you think according to my notes how should i do workouts",
        [
            SearchCandidate(
                chunk_id="c-workout",
                note_id="n-workout",
                title="workout",
                note_date=date(2026, 4, 17),
                content=(
                    "its really important to work out you should always try to progress in lifts "
                    "go heavy go intense go get it"
                ),
                chunk_index=0,
                semantic_score=0.81,
                keyword_score=0.66,
                rerank_score=0.88,
                reason="strong semantic match, action cue",
            ),
            SearchCandidate(
                chunk_id="c-momentum",
                note_id="n-momentum",
                title="What helps me recover momentum",
                note_date=date(2026, 4, 1),
                content=(
                    "The quickest way back into momentum is to reconnect with something I already wrote "
                    "instead of starting from a blank page."
                ),
                chunk_index=0,
                semantic_score=0.63,
                keyword_score=0.21,
                rerank_score=0.67,
                reason="strong semantic match, action cue",
            ),
        ],
    )

    assert "workout" in response.answer.lower()
    assert "momentum" not in response.answer.lower()
    assert [citation.title for citation in response.citations] == ["workout"]
    assert all("momentum" not in action.lower() for action in response.suggested_actions)


def test_compose_answer_accepts_single_exact_topic_note() -> None:
    response = compose_answer(
        "what do you think according to my notes how should i do workouts",
        [
            SearchCandidate(
                chunk_id="c-workout",
                note_id="n-workout",
                title="workout",
                note_date=date(2026, 4, 17),
                content=(
                    "its really important to work out you should always try to progress in lifts "
                    "go heavy go intense go get it"
                ),
                chunk_index=0,
                semantic_score=0.0,
                keyword_score=0.319,
                rerank_score=0.091,
                reason="action cue",
            ),
        ],
    )

    assert response.insufficient_evidence is False
    assert response.citations[0].title == "workout"
    assert "workout" in response.answer.lower()
