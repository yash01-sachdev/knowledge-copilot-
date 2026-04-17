from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def make_client(tmp_path: Path) -> TestClient:
    settings = Settings(
        app_name="Knowledge Copilot API",
        data_dir=tmp_path,
        database_path=tmp_path / "test.db",
        cors_origins=("http://localhost:3000",),
    )
    app = create_app(settings)
    return TestClient(app)


def test_note_ingestion_query_and_feedback_flow(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    created = client.post(
        "/api/notes",
        json={
            "title": "Recovering momentum",
            "content": (
                "Old notes lower the activation energy. "
                "Reading two relevant notes and then writing one concrete next step helps me restart."
            ),
            "note_date": "2026-04-01",
            "source_name": "momentum.md",
        },
    )
    assert created.status_code == 201
    assert created.json()["chunk_count"] >= 1

    queried = client.post(
        "/api/query",
        json={"question": "What should I do when I lose momentum?", "top_k": 4},
    )
    assert queried.status_code == 200
    payload = queried.json()
    assert payload["citations"]
    assert payload["answer"]
    assert "timeline" in payload
    assert "recurring_themes" in payload
    assert "note_links" in payload
    assert payload["confidence_label"] in {"low", "medium", "high"}
    assert payload["diagnostics"]["semantic_mode"]
    assert payload["diagnostics"]["answer_provider"]

    feedback = client.post(
        "/api/feedback",
        json={
            "question": "What should I do when I lose momentum?",
            "answer": payload["answer"],
            "useful": True,
        },
    )
    assert feedback.status_code == 202

    note_id = created.json()["id"]
    detail = client.get(f"/api/notes/{note_id}")
    assert detail.status_code == 200
    assert "activation energy" in detail.json()["content"]

    updated = client.put(
        f"/api/notes/{note_id}",
        json={
            "title": "Recovering momentum fast",
            "content": (
                "Old notes lower the activation energy. "
                "A short review plus one concrete task gets me moving again quickly."
            ),
            "note_date": "2026-04-02",
            "source_name": "momentum-updated.md",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Recovering momentum fast"


def test_demo_notes_seed_and_query_patterns(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    seeded = client.post("/api/demo/load")
    assert seeded.status_code == 200
    assert seeded.json()["loaded_notes"] >= 1

    queried = client.post(
        "/api/query",
        json={"question": "What patterns keep repeating in my notes?", "top_k": 5},
    )
    assert queried.status_code == 200
    payload = queried.json()
    assert len(payload["citations"]) >= 2
    assert "Your notes repeatedly come back" in payload["answer"]
    assert len(payload["recurring_themes"]) >= 2
    assert len(payload["timeline"]) >= 2

    overview = client.get("/api/memory/overview")
    assert overview.status_code == 200
    memory_payload = overview.json()
    assert memory_payload["themes"]
    assert "theme_drift" in memory_payload
    assert memory_payload["timeline"]
    assert "suggested_links" in memory_payload
    assert "memory_trails" in memory_payload
    assert memory_payload["graph_links"]
    assert memory_payload["graph_nodes"]
    assert memory_payload["graph_links"][0]["shared_themes"]


def test_goal_style_query_returns_direct_action_language(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    client.post("/api/demo/load")

    queried = client.post(
        "/api/query",
        json={"question": "how do i win interview prep", "top_k": 5},
    )

    assert queried.status_code == 200
    payload = queried.json()
    assert "the way you win is to" in payload["answer"].lower()
    assert payload["suggested_actions"]


def test_unrelated_query_returns_insufficient_evidence(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    client.post("/api/demo/load")

    queried = client.post(
        "/api/query",
        json={"question": "penguin turbine sandwich", "top_k": 5},
    )

    assert queried.status_code == 200
    payload = queried.json()
    assert payload["insufficient_evidence"] is True
    assert payload["citations"] == []
    assert "could not find enough grounded evidence" in payload["answer"].lower()


def test_folder_sync_imports_and_updates_notes(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    sync_dir = tmp_path / "phone-notes"
    sync_dir.mkdir()
    journal_path = sync_dir / "2026-04-10-momentum.md"
    journal_path.write_text(
        "# Momentum reset\n\nOld notes lower the activation energy and help me restart quickly.",
        encoding="utf-8",
    )

    first_sync = client.post("/api/sync/folder", json={"folder_path": str(sync_dir)})
    assert first_sync.status_code == 200
    assert first_sync.json()["imported_notes"] == 1

    journal_path.write_text(
        "# Momentum reset\n\nOld notes lower the activation energy and a walk helps me restart quickly.",
        encoding="utf-8",
    )
    second_sync = client.post("/api/sync/folder", json={"folder_path": str(sync_dir)})
    assert second_sync.status_code == 200
    assert second_sync.json()["updated_notes"] == 1


def test_delete_note_removes_it_from_api_and_memory(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    created = client.post(
        "/api/notes",
        json={
            "title": "Disposable note",
            "content": "This note exists long enough to verify delete behaviour and memory refresh handling.",
            "note_date": "2026-04-17",
            "source_name": None,
        },
    )
    assert created.status_code == 201
    note_id = created.json()["id"]

    deleted = client.delete(f"/api/notes/{note_id}")
    assert deleted.status_code == 200
    assert deleted.json()["title"] == "Disposable note"

    detail = client.get(f"/api/notes/{note_id}")
    assert detail.status_code == 404

    notes = client.get("/api/notes")
    assert notes.status_code == 200
    assert notes.json() == []

    memory = client.get("/api/memory/overview")
    assert memory.status_code == 200
    assert memory.json()["total_notes"] == 0


def test_memory_link_feedback_can_reject_a_graph_connection(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    seeded = client.post("/api/demo/load")
    assert seeded.status_code == 200

    overview_before = client.get("/api/memory/overview")
    assert overview_before.status_code == 200
    links_before = overview_before.json()["graph_links"]
    assert links_before
    first_link = links_before[0]

    rejected = client.post(
        "/api/memory/link-feedback",
        json={
            "source_note_id": first_link["source_note_id"],
            "target_note_id": first_link["target_note_id"],
            "decision": "rejected",
        },
    )
    assert rejected.status_code == 200

    links_after = rejected.json()["graph_links"]
    assert not any(
        {
            link["source_note_id"],
            link["target_note_id"],
        }
        == {first_link["source_note_id"], first_link["target_note_id"]}
        for link in links_after
    )
