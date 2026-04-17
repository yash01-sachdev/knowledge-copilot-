from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings
from .repository import SQLiteRepository
from .schemas import (
    DemoLoadResponse,
    FeedbackCreate,
    MemoryLinkDecisionRequest,
    MemoryOverviewResponse,
    NoteCreate,
    NoteDetail,
    NoteSummary,
    NoteUpdate,
    QueryRequest,
    QueryResponse,
    SyncFolderRequest,
    SyncFolderResponse,
)
from .service import KnowledgeService


def get_service(request: Request) -> KnowledgeService:
    return request.app.state.service


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or Settings.from_env()
    repository = SQLiteRepository(resolved_settings.database_path)
    service = KnowledgeService(repository, resolved_settings)

    app = FastAPI(title=resolved_settings.app_name, version="0.1.0")
    app.state.settings = resolved_settings
    app.state.service = service

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(resolved_settings.cors_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def healthcheck() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/notes", response_model=list[NoteSummary])
    def list_notes(request: Request) -> list[NoteSummary]:
        return get_service(request).list_notes()

    @app.get("/api/notes/{note_id}", response_model=NoteDetail)
    def get_note(request: Request, note_id: str) -> NoteDetail:
        note = get_service(request).get_note(note_id)
        if note is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found.")
        return note

    @app.post("/api/notes", response_model=NoteSummary, status_code=status.HTTP_201_CREATED)
    def create_note(request: Request, payload: NoteCreate) -> NoteSummary:
        return get_service(request).create_note(payload)

    @app.put("/api/notes/{note_id}", response_model=NoteDetail)
    def update_note(request: Request, note_id: str, payload: NoteUpdate) -> NoteDetail:
        note = get_service(request).update_note(note_id, payload)
        if note is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found.")
        return note

    @app.delete("/api/notes/{note_id}", response_model=NoteDetail)
    def delete_note(request: Request, note_id: str) -> NoteDetail:
        note = get_service(request).delete_note(note_id)
        if note is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found.")
        return note

    @app.post("/api/query", response_model=QueryResponse)
    def query_notes(request: Request, payload: QueryRequest) -> QueryResponse:
        return get_service(request).answer_question(payload)

    @app.get("/api/memory/overview", response_model=MemoryOverviewResponse)
    def memory_overview(request: Request) -> MemoryOverviewResponse:
        return get_service(request).get_memory_overview()

    @app.post("/api/memory/link-feedback", response_model=MemoryOverviewResponse)
    def memory_link_feedback(request: Request, payload: MemoryLinkDecisionRequest) -> MemoryOverviewResponse:
        return get_service(request).record_link_decision(payload)

    @app.post("/api/feedback", status_code=status.HTTP_202_ACCEPTED)
    def create_feedback(request: Request, payload: FeedbackCreate) -> dict[str, str]:
        get_service(request).record_feedback(payload)
        return {"status": "accepted"}

    @app.post("/api/demo/load", response_model=DemoLoadResponse)
    def load_demo_notes(request: Request) -> DemoLoadResponse:
        return get_service(request).load_demo_notes()

    @app.post("/api/sync/folder", response_model=SyncFolderResponse)
    def sync_folder(request: Request, payload: SyncFolderRequest) -> SyncFolderResponse:
        try:
            return get_service(request).sync_folder(payload)
        except ValueError as error:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error

    return app


app = create_app()
