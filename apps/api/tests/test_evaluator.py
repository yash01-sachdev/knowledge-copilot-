from pathlib import Path

from app.config import Settings
from app.evaluator import evaluate_cases, load_evaluation_cases
from app.repository import SQLiteRepository
from app.service import KnowledgeService


def test_evaluator_reports_summary_metrics(tmp_path: Path) -> None:
    settings = Settings(
        app_name="Knowledge Copilot API",
        data_dir=tmp_path,
        database_path=tmp_path / "test.db",
        cors_origins=("http://localhost:3000",),
    )
    service = KnowledgeService(SQLiteRepository(settings.database_path), settings)
    service.load_demo_notes()

    dataset_path = Path(__file__).resolve().parents[1] / "evals" / "demo-eval-set.json"
    cases = load_evaluation_cases(dataset_path)
    report = evaluate_cases(service, cases[:4])

    assert report["summary"]["dataset_size"] == 4
    assert "retrieval_hit_rate" in report["summary"]
    assert len(report["cases"]) == 4
