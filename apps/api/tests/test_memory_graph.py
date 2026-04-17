from datetime import date, datetime, timezone

from app.domain import NoteRecord
from app.memory_graph import build_memory_overview


def _make_note(note_id: str, title: str, content: str, note_date: date) -> NoteRecord:
    timestamp = datetime(2026, 4, 17, tzinfo=timezone.utc)
    return NoteRecord(
        id=note_id,
        title=title,
        content=content,
        note_date=note_date,
        source_name=None,
        source_path=None,
        chunk_count=1,
        created_at=timestamp,
        updated_at=timestamp,
    )


def test_memory_graph_drops_unrelated_single_topic_note() -> None:
    notes = [
        _make_note(
            "note-1",
            "Interview prep reset",
            "I do better when I stop chasing ten topics and return to one concrete interview task.",
            date(2026, 2, 4),
        ),
        _make_note(
            "note-2",
            "When I feel stuck",
            "The stuck feeling usually comes from ambiguity, so I should choose one small implementation task.",
            date(2026, 2, 18),
        ),
        _make_note(
            "note-3",
            "Workout",
            "Go heavy, progress the lifts, and stay consistent with training.",
            date(2026, 4, 17),
        ),
    ]

    overview = build_memory_overview(notes).overview

    linked_titles = {
        overview_link.source_title
        for overview_link in overview.graph_links
    } | {
        overview_link.target_title
        for overview_link in overview.graph_links
    }

    assert "Workout" not in linked_titles

