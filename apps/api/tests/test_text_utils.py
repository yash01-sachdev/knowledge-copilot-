from app.text_utils import build_match_terms, chunk_text, extract_ranked_sentences


def test_chunk_text_splits_long_note_into_overlapping_chunks() -> None:
    text = " ".join(f"word{i}" for i in range(260))
    chunks = chunk_text(text, target_words=100, overlap_words=20)

    assert len(chunks) == 3
    assert chunks[1].content.split()[0] == "word80"
    assert chunks[2].content.split()[0] == "word160"


def test_extract_ranked_sentences_prefers_query_overlap() -> None:
    text = (
        "I felt scattered when I opened too many tabs. "
        "A short checklist helped me focus again. "
        "Coffee was fine but structure mattered more."
    )
    sentences = extract_ranked_sentences(text, {"checklist", "focus"}, limit=1)

    assert sentences == ["A short checklist helped me focus again."]


def test_build_match_terms_removes_common_words() -> None:
    assert build_match_terms("What should I focus on this week?") == ["focus", "week"]
