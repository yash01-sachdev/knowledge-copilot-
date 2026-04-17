from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings
from app.evaluator import evaluate_cases, load_evaluation_cases, write_evaluation_report
from app.repository import SQLiteRepository
from app.service import KnowledgeService


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Knowledge Copilot retrieval and answer evals.")
    parser.add_argument(
        "--dataset",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "evals" / "demo-eval-set.json",
        help="Path to the evaluation dataset JSON file.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional output path for the report JSON. Defaults to the configured eval output path.",
    )
    parser.add_argument(
        "--use-existing-db",
        action="store_true",
        help="Use the configured database instead of a temporary seeded database.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    settings = Settings.from_env()
    cases = load_evaluation_cases(args.dataset)

    if args.use_existing_db:
        service = KnowledgeService(SQLiteRepository(settings.database_path), settings)
        report = evaluate_cases(service, cases)
    else:
        with TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            temp_settings = Settings(
                app_name=settings.app_name,
                data_dir=tmp_path,
                database_path=tmp_path / "eval.db",
                cors_origins=settings.cors_origins,
                semantic_limit=settings.semantic_limit,
                keyword_limit=settings.keyword_limit,
                answer_limit=settings.answer_limit,
                embedding_provider=settings.embedding_provider,
                embedding_model=settings.embedding_model,
                answer_provider=settings.answer_provider,
                answer_model=settings.answer_model,
                openai_api_key=settings.openai_api_key,
                openai_base_url=settings.openai_base_url,
                ollama_base_url=settings.ollama_base_url,
                provider_timeout_seconds=settings.provider_timeout_seconds,
                embedding_batch_size=settings.embedding_batch_size,
                eval_output_path=settings.eval_output_path,
            )
            service = KnowledgeService(SQLiteRepository(temp_settings.database_path), temp_settings)
            service.load_demo_notes()
            report = evaluate_cases(service, cases)

    output_path = args.output or settings.eval_output_path
    if output_path is not None:
        write_evaluation_report(report, output_path)

    print(json.dumps(report["summary"], indent=2))
    if output_path is not None:
        print(f"Report written to {output_path}")


if __name__ == "__main__":
    main()
