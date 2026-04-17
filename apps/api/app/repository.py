from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterator
from uuid import uuid4

from .domain import ChunkRecord, NoteRecord, SearchCandidate
from .text_utils import ChunkDraft, build_match_terms


SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    note_date TEXT NOT NULL,
    source_name TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_chunks (
    id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    start_char INTEGER NOT NULL,
    end_char INTEGER NOT NULL,
    content TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS note_chunks_fts USING fts5(
    chunk_id UNINDEXED,
    note_id UNINDEXED,
    title,
    note_date,
    content,
    tokenize = 'porter unicode61'
);

CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    useful INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_links (
    id TEXT PRIMARY KEY,
    source_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    strength REAL NOT NULL,
    shared_themes TEXT NOT NULL,
    rationale TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(source_note_id, target_note_id)
);

CREATE INDEX IF NOT EXISTS idx_note_links_source ON note_links(source_note_id);
CREATE INDEX IF NOT EXISTS idx_note_links_target ON note_links(target_note_id);

CREATE TABLE IF NOT EXISTS note_link_feedback (
    id TEXT PRIMARY KEY,
    source_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    decision TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(source_note_id, target_note_id)
);

CREATE INDEX IF NOT EXISTS idx_note_link_feedback_source ON note_link_feedback(source_note_id);
CREATE INDEX IF NOT EXISTS idx_note_link_feedback_target ON note_link_feedback(target_note_id);
"""


class SQLiteRepository:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def initialize(self) -> None:
        with self.connection() as conn:
            conn.executescript(SCHEMA_SQL)
            self._ensure_table_column(conn, "notes", "source_path", "TEXT")
            self._ensure_table_column(conn, "notes", "updated_at", "TEXT")
            self._ensure_table_column(conn, "note_chunks", "embedding_json", "TEXT")
            self._ensure_table_column(conn, "note_chunks", "embedding_provider", "TEXT")
            self._ensure_table_column(conn, "note_chunks", "embedding_model", "TEXT")
            self._ensure_table_column(conn, "note_chunks", "embedding_updated_at", "TEXT")
            conn.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_source_path
                ON notes(source_path) WHERE source_path IS NOT NULL
                """
            )
            conn.execute(
                """
                UPDATE notes
                SET updated_at = COALESCE(updated_at, created_at)
                WHERE updated_at IS NULL
                """
            )

    def _ensure_table_column(
        self,
        conn: sqlite3.Connection,
        table_name: str,
        column_name: str,
        definition: str,
    ) -> None:
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
        existing = {row["name"] for row in rows}
        if column_name in existing:
            return
        conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")

    def add_note(
        self,
        *,
        title: str,
        content: str,
        note_date: date,
        source_name: str | None,
        source_path: str | None,
        chunks: list[ChunkDraft],
    ) -> dict[str, object]:
        note_id = str(uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()
        with self.connection() as conn:
            self._insert_note(
                conn,
                note_id=note_id,
                title=title,
                content=content,
                note_date=note_date,
                source_name=source_name,
                source_path=source_path,
                created_at=timestamp,
                updated_at=timestamp,
            )
            self._replace_note_chunks(conn, note_id=note_id, title=title, note_date=note_date, chunks=chunks)
            return self._fetch_note_summary(conn, note_id)

    def update_note(
        self,
        note_id: str,
        *,
        title: str,
        content: str,
        note_date: date,
        source_name: str | None,
        source_path: str | None = None,
        chunks: list[ChunkDraft],
    ) -> dict[str, object] | None:
        updated_at = datetime.now(timezone.utc).isoformat()
        with self.connection() as conn:
            current = conn.execute(
                "SELECT id, source_path FROM notes WHERE id = ?",
                (note_id,),
            ).fetchone()
            if current is None:
                return None
            resolved_source_path = source_path if source_path is not None else current["source_path"]
            conn.execute(
                """
                UPDATE notes
                SET title = ?, content = ?, note_date = ?, source_name = ?, source_path = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    title,
                    content,
                    note_date.isoformat(),
                    source_name,
                    resolved_source_path,
                    updated_at,
                    note_id,
                ),
            )
            self._replace_note_chunks(conn, note_id=note_id, title=title, note_date=note_date, chunks=chunks)
            return self._fetch_note_summary(conn, note_id)

    def get_note(self, note_id: str) -> dict[str, object] | None:
        with self.connection() as conn:
            row = self._fetch_note_row(conn, note_id)
            if row is None:
                return None
            return self._row_to_note(row)

    def delete_note(self, note_id: str) -> bool:
        with self.connection() as conn:
            deleted = conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
            return deleted.rowcount > 0

    def find_note_by_source_path(self, source_path: str) -> dict[str, object] | None:
        with self.connection() as conn:
            row = conn.execute(
                """
                SELECT n.*, COUNT(c.id) AS chunk_count
                FROM notes n
                LEFT JOIN note_chunks c ON c.note_id = n.id
                WHERE n.source_path = ?
                GROUP BY n.id
                """,
                (source_path,),
            ).fetchone()
            if row is None:
                return None
            return self._row_to_note(row)

    def list_notes(self) -> list[dict[str, object]]:
        with self.connection() as conn:
            rows = conn.execute(
                """
                SELECT n.*, COUNT(c.id) AS chunk_count
                FROM notes n
                LEFT JOIN note_chunks c ON c.note_id = n.id
                GROUP BY n.id
                ORDER BY datetime(n.updated_at) DESC, n.note_date DESC, datetime(n.created_at) DESC
                """
            ).fetchall()
        return [self._row_to_summary(row) for row in rows]

    def fetch_all_notes(self) -> list[NoteRecord]:
        with self.connection() as conn:
            rows = conn.execute(
                """
                SELECT n.*, COUNT(c.id) AS chunk_count
                FROM notes n
                LEFT JOIN note_chunks c ON c.note_id = n.id
                GROUP BY n.id
                ORDER BY n.note_date ASC, datetime(n.updated_at) ASC
                """
            ).fetchall()
        return [NoteRecord(**self._row_to_note(row)) for row in rows]

    def fetch_all_chunks(self) -> list[ChunkRecord]:
        with self.connection() as conn:
            rows = conn.execute(
                """
                SELECT
                    c.id,
                    c.note_id,
                    n.title,
                    n.note_date,
                    c.content,
                    c.chunk_index,
                    c.embedding_json,
                    c.embedding_provider,
                    c.embedding_model
                FROM note_chunks c
                JOIN notes n ON n.id = c.note_id
                ORDER BY n.note_date DESC, c.chunk_index ASC
                """
            ).fetchall()
        return [
            ChunkRecord(
                chunk_id=row["id"],
                note_id=row["note_id"],
                title=row["title"],
                note_date=date.fromisoformat(row["note_date"]),
                content=row["content"],
                chunk_index=row["chunk_index"],
                embedding=json.loads(row["embedding_json"]) if row["embedding_json"] else None,
                embedding_provider=row["embedding_provider"],
                embedding_model=row["embedding_model"],
            )
            for row in rows
        ]

    def update_chunk_embeddings(
        self,
        rows: list[tuple[str, list[float], str, str]],
    ) -> None:
        if not rows:
            return

        updated_at = datetime.now(timezone.utc).isoformat()
        with self.connection() as conn:
            conn.executemany(
                """
                UPDATE note_chunks
                SET embedding_json = ?, embedding_provider = ?, embedding_model = ?, embedding_updated_at = ?
                WHERE id = ?
                """,
                [
                    (
                        json.dumps(embedding),
                        provider_name,
                        model_name,
                        updated_at,
                        chunk_id,
                    )
                    for chunk_id, embedding, provider_name, model_name in rows
                ],
            )

    def keyword_search(self, question: str, limit: int) -> list[SearchCandidate]:
        terms = build_match_terms(question)
        if not terms:
            return []
        match_query = " OR ".join(f'"{term}"' for term in terms)
        with self.connection() as conn:
            rows = conn.execute(
                """
                SELECT
                    fts.chunk_id,
                    fts.note_id,
                    n.title,
                    n.note_date,
                    c.content,
                    c.chunk_index,
                    bm25(note_chunks_fts) AS raw_bm25
                FROM note_chunks_fts AS fts
                JOIN note_chunks c ON c.id = fts.chunk_id
                JOIN notes n ON n.id = fts.note_id
                WHERE note_chunks_fts MATCH ?
                ORDER BY raw_bm25
                LIMIT ?
                """,
                (match_query, limit),
            ).fetchall()

        candidates: list[SearchCandidate] = []
        for row in rows:
            raw_bm25 = abs(float(row["raw_bm25"]))
            candidates.append(
                SearchCandidate(
                    chunk_id=row["chunk_id"],
                    note_id=row["note_id"],
                    title=row["title"],
                    note_date=date.fromisoformat(row["note_date"]),
                    content=row["content"],
                    chunk_index=row["chunk_index"],
                    keyword_score=1.0 / (1.0 + raw_bm25),
                )
            )
        return candidates

    def replace_note_links(self, links: list[dict[str, object]]) -> None:
        timestamp = datetime.now(timezone.utc).isoformat()
        with self.connection() as conn:
            conn.execute("DELETE FROM note_links")
            for link in links:
                conn.execute(
                    """
                    INSERT INTO note_links (
                        id, source_note_id, target_note_id, strength, shared_themes,
                        rationale, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(uuid4()),
                        link["source_note_id"],
                        link["target_note_id"],
                        float(link["strength"]),
                        json.dumps(link["shared_themes"]),
                        str(link["rationale"]),
                        timestamp,
                        timestamp,
                    ),
                )

    def list_note_links(self) -> list[dict[str, object]]:
        with self.connection() as conn:
            rows = conn.execute(
                """
                SELECT
                    l.source_note_id,
                    s.title AS source_title,
                    s.note_date AS source_date,
                    l.target_note_id,
                    t.title AS target_title,
                    t.note_date AS target_date,
                    l.shared_themes,
                    l.rationale,
                    l.strength
                FROM note_links l
                JOIN notes s ON s.id = l.source_note_id
                JOIN notes t ON t.id = l.target_note_id
                ORDER BY l.strength DESC, s.note_date ASC, t.note_date ASC
                """
            ).fetchall()
        return [
            {
                "source_note_id": row["source_note_id"],
                "source_title": row["source_title"],
                "source_date": date.fromisoformat(row["source_date"]),
                "target_note_id": row["target_note_id"],
                "target_title": row["target_title"],
                "target_date": date.fromisoformat(row["target_date"]),
                "shared_themes": json.loads(row["shared_themes"]),
                "rationale": row["rationale"],
                "strength": float(row["strength"]),
            }
            for row in rows
        ]

    def set_note_link_feedback(self, source_note_id: str, target_note_id: str, decision: str) -> None:
        left_id, right_id = sorted((source_note_id, target_note_id))
        timestamp = datetime.now(timezone.utc).isoformat()
        with self.connection() as conn:
            existing = conn.execute(
                """
                SELECT id
                FROM note_link_feedback
                WHERE source_note_id = ? AND target_note_id = ?
                """,
                (left_id, right_id),
            ).fetchone()
            if existing is None:
                conn.execute(
                    """
                    INSERT INTO note_link_feedback (
                        id, source_note_id, target_note_id, decision, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (str(uuid4()), left_id, right_id, decision, timestamp, timestamp),
                )
                return
            conn.execute(
                """
                UPDATE note_link_feedback
                SET decision = ?, updated_at = ?
                WHERE source_note_id = ? AND target_note_id = ?
                """,
                (decision, timestamp, left_id, right_id),
            )

    def list_note_link_feedback(self) -> dict[tuple[str, str], str]:
        with self.connection() as conn:
            rows = conn.execute(
                """
                SELECT source_note_id, target_note_id, decision
                FROM note_link_feedback
                """
            ).fetchall()
        return {
            (row["source_note_id"], row["target_note_id"]): row["decision"]
            for row in rows
        }

    def add_feedback(self, *, question: str, answer: str, useful: bool) -> None:
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO feedback (id, question, answer, useful, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    str(uuid4()),
                    question,
                    answer,
                    int(useful),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )

    def note_count(self) -> int:
        with self.connection() as conn:
            row = conn.execute("SELECT COUNT(*) AS total FROM notes").fetchone()
        return int(row["total"]) if row else 0

    def reset(self) -> None:
        with self.connection() as conn:
            conn.execute("DELETE FROM feedback")
            conn.execute("DELETE FROM note_link_feedback")
            conn.execute("DELETE FROM note_links")
            conn.execute("DELETE FROM note_chunks_fts")
            conn.execute("DELETE FROM note_chunks")
            conn.execute("DELETE FROM notes")

    def _insert_note(
        self,
        conn: sqlite3.Connection,
        *,
        note_id: str,
        title: str,
        content: str,
        note_date: date,
        source_name: str | None,
        source_path: str | None,
        created_at: str,
        updated_at: str,
    ) -> None:
        conn.execute(
            """
            INSERT INTO notes (
                id, title, content, note_date, source_name, source_path, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                note_id,
                title,
                content,
                note_date.isoformat(),
                source_name,
                source_path,
                created_at,
                updated_at,
            ),
        )

    def _replace_note_chunks(
        self,
        conn: sqlite3.Connection,
        *,
        note_id: str,
        title: str,
        note_date: date,
        chunks: list[ChunkDraft],
    ) -> None:
        conn.execute("DELETE FROM note_chunks_fts WHERE note_id = ?", (note_id,))
        conn.execute("DELETE FROM note_chunks WHERE note_id = ?", (note_id,))
        for chunk in chunks:
            chunk_id = str(uuid4())
            conn.execute(
                """
                INSERT INTO note_chunks (id, note_id, chunk_index, start_char, end_char, content)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    chunk_id,
                    note_id,
                    chunk.chunk_index,
                    chunk.start_char,
                    chunk.end_char,
                    chunk.content,
                ),
            )
            conn.execute(
                """
                INSERT INTO note_chunks_fts (chunk_id, note_id, title, note_date, content)
                VALUES (?, ?, ?, ?, ?)
                """,
                (chunk_id, note_id, title, note_date.isoformat(), chunk.content),
            )

    def _fetch_note_summary(self, conn: sqlite3.Connection, note_id: str) -> dict[str, object]:
        row = self._fetch_note_row(conn, note_id)
        if row is None:
            raise ValueError(f"Note {note_id} not found after write.")
        return self._row_to_summary(row)

    def _fetch_note_row(self, conn: sqlite3.Connection, note_id: str) -> sqlite3.Row | None:
        return conn.execute(
            """
            SELECT n.*, COUNT(c.id) AS chunk_count
            FROM notes n
            LEFT JOIN note_chunks c ON c.note_id = n.id
            WHERE n.id = ?
            GROUP BY n.id
            """,
            (note_id,),
        ).fetchone()

    def _row_to_summary(self, row: sqlite3.Row) -> dict[str, object]:
        return {
            "id": row["id"],
            "title": row["title"],
            "note_date": date.fromisoformat(row["note_date"]),
            "source_name": row["source_name"],
            "source_path": row["source_path"],
            "chunk_count": int(row["chunk_count"]),
            "created_at": datetime.fromisoformat(row["created_at"]),
            "updated_at": datetime.fromisoformat(row["updated_at"] or row["created_at"]),
        }

    def _row_to_note(self, row: sqlite3.Row) -> dict[str, object]:
        summary = self._row_to_summary(row)
        summary.update(
            {
                "content": row["content"],
            }
        )
        return summary
