"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createNote, deleteNote, getNote, listNotes, loadDemoNotes, syncFolder, updateNote } from "@/lib/api";
import { inferImportedNote } from "@/lib/import-notes";
import type { NoteDraft, NoteSummary } from "@/lib/types";
import { StatusBanner } from "./status-banner";

const today = new Date().toISOString().slice(0, 10);

const EMPTY_DRAFT: NoteDraft = {
  title: "",
  content: "",
  noteDate: today,
  sourceName: null,
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function NotesWorkspace() {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NoteDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState<"idle" | "list" | "save" | "sync" | "delete">("idle");
  const [folderPath, setFolderPath] = useState("");
  const [status, setStatus] = useState<{ tone: "default" | "error" | "success"; message: string } | null>({
    tone: "default",
    message: "Paste a synced markdown folder path or start writing directly.",
  });
  const hasLoadedInitialNotes = useRef(false);
  const notesRef = useRef<NoteSummary[]>([]);
  const selectedNoteIdRef = useRef<string | null>(null);

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId],
  );

  const wordCount = useMemo(() => {
    const trimmed = draft.content.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }, [draft.content]);

  const characterCount = draft.content.trim().length;

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    selectedNoteIdRef.current = selectedNoteId;
  }, [selectedNoteId]);

  const openNote = useCallback(
    async (noteId: string, availableNotes?: NoteSummary[]) => {
      const pool = availableNotes ?? notesRef.current;
      setSelectedNoteId(noteId);
      selectedNoteIdRef.current = noteId;
      try {
        const detail = await getNote(noteId);
        setDraft({
          title: detail.title,
          content: detail.content,
          noteDate: detail.note_date,
          sourceName: detail.source_name,
        });
        const note = pool.find((item) => item.id === noteId);
        setStatus({
          tone: "default",
          message: note?.source_path
            ? `Editing synced note from ${note.source_path}`
            : `Editing ${detail.title}`,
        });
      } catch (error) {
        setStatus({
          tone: "error",
          message: error instanceof Error ? error.message : "Could not open that note.",
        });
      }
    },
    [],
  );

  const refreshNotes = useCallback(async (nextSelectedId?: string | null) => {
    setBusy("list");
    try {
      const nextNotes = await listNotes();
      notesRef.current = nextNotes;
      startTransition(() => {
        setNotes(nextNotes);
      });
      const targetId =
        nextSelectedId === undefined
          ? selectedNoteIdRef.current ?? nextNotes[0]?.id ?? null
          : nextSelectedId;
      if (targetId) {
        await openNote(targetId, nextNotes);
      } else {
        setSelectedNoteId(null);
        selectedNoteIdRef.current = null;
        setDraft({ ...EMPTY_DRAFT, noteDate: today });
      }
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not load notes.",
      });
    } finally {
      setBusy("idle");
    }
  }, [openNote]);

  useEffect(() => {
    if (hasLoadedInitialNotes.current) {
      return;
    }
    hasLoadedInitialNotes.current = true;
    void refreshNotes();
  }, [refreshNotes]);

  function handleNewNote() {
    setSelectedNoteId(null);
    selectedNoteIdRef.current = null;
    setDraft({ ...EMPTY_DRAFT, noteDate: today });
    setStatus({
      tone: "default",
      message: "Drafting a fresh note. Add a title, write naturally, then save when it feels useful.",
    });
  }

  async function handleSave() {
    if (draft.title.trim().length < 2 || draft.content.trim().length < 30) {
      setStatus({
        tone: "error",
        message: "Give the note a title and at least 30 characters of content before saving.",
      });
      return;
    }

    setBusy("save");
    try {
      if (selectedNoteId) {
        const updated = await updateNote(selectedNoteId, draft);
        await refreshNotes(updated.id);
        setStatus({ tone: "success", message: `Updated ${updated.title}.` });
      } else {
        const created = await createNote(draft);
        await refreshNotes(created.id);
        setStatus({ tone: "success", message: `Saved ${created.title}.` });
      }
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not save the note.",
      });
    } finally {
      setBusy("idle");
    }
  }

  async function handleDelete() {
    const currentNoteId = selectedNoteIdRef.current;
    const currentNote =
      notesRef.current.find((note) => note.id === currentNoteId) ?? (currentNoteId === selectedNoteId ? selectedNote : null);

    if (!currentNoteId || !currentNote) {
      return;
    }

    const confirmed = window.confirm(
      currentNote.source_path
        ? "Delete this synced note from the app? If the source file still exists, syncing that folder again will bring it back."
        : `Delete "${currentNote.title}" from the app?`,
    );
    if (!confirmed) {
      return;
    }

    setBusy("delete");
    try {
      const deleted = await deleteNote(currentNoteId);
      await refreshNotes(null);
      setStatus({
        tone: "success",
        message: deleted.source_path
          ? `Deleted ${deleted.title} from the app. Syncing the source folder again will re-import it if the file still exists.`
          : `Deleted ${deleted.title}.`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not delete the note.",
      });
    } finally {
      setBusy("idle");
    }
  }

  async function handleImportFiles(files: FileList | null) {
    if (!files?.length) {
      return;
    }

    setBusy("sync");
    try {
      for (const file of Array.from(files)) {
        const content = await file.text();
        await createNote(inferImportedNote(file.name, content));
      }
      await refreshNotes();
      setStatus({
        tone: "success",
        message: `Imported ${files.length} file${files.length === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not import those files.",
      });
    } finally {
      setBusy("idle");
    }
  }

  async function handleLoadDemo() {
    setBusy("sync");
    try {
      const result = await loadDemoNotes();
      await refreshNotes();
      setStatus({
        tone: "success",
        message:
          result.loaded_notes > 0
            ? `Loaded ${result.loaded_notes} demo notes.`
            : "Demo notes were already in the database.",
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not load the demo notes.",
      });
    } finally {
      setBusy("idle");
    }
  }

  async function handleSyncFolder() {
    if (!folderPath.trim()) {
      setStatus({ tone: "error", message: "Paste a folder path before syncing." });
      return;
    }

    setBusy("sync");
    try {
      const result = await syncFolder(folderPath.trim());
      await refreshNotes();
      setStatus({
        tone: "success",
        message: `Synced folder: ${result.imported_notes} imported, ${result.updated_notes} updated.`,
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Folder sync failed.",
      });
    } finally {
      setBusy("idle");
    }
  }

  return (
    <main className="page-frame flex flex-1 flex-col gap-5">
      <section className="panel relative overflow-hidden rounded-[32px] px-6 py-6 sm:px-7 lg:px-8">
        <div className="pointer-events-none absolute -right-10 top-8 h-44 w-44 rounded-full bg-accent-soft blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-10 h-32 w-32 rounded-full bg-warm-soft blur-3xl" />

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="kicker">Write</div>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-[3.4rem]">
              A real notes workspace, not a chatbot with a textbox.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-muted">
              Capture entries quickly, keep the library tidy, and bring in markdown from your phone
              without losing the calm feel of a real writing tool.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[520px]">
            <div className="metric-card px-4 py-4">
              <div className="kicker">Library</div>
              <div className="mt-3 text-3xl font-semibold text-foreground">{notes.length}</div>
              <p className="mt-2 text-sm leading-6 text-muted">indexed notes ready for retrieval</p>
            </div>
            <div className="metric-card px-4 py-4">
              <div className="kicker">Capture</div>
              <div className="mt-3 text-lg font-semibold text-foreground">Phone sync friendly</div>
              <p className="mt-2 text-sm leading-6 text-muted">use any cloud-synced markdown folder</p>
            </div>
            <button
              type="button"
              onClick={handleNewNote}
              className="button-primary flex min-h-[138px] flex-col items-start justify-between px-4 py-4 text-left"
            >
              <span className="kicker text-[rgba(7,16,24,0.72)]">Fresh entry</span>
              <div>
                <div className="text-xl font-semibold">New note</div>
                <div className="mt-2 text-sm text-[rgba(7,16,24,0.72)]">
                  Jump into a blank draft without losing the library.
                </div>
              </div>
            </button>
          </div>
        </div>
      </section>

      {status ? <StatusBanner tone={status.tone} message={status.message} /> : null}

      <section className="grid flex-1 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="panel flex min-h-[760px] flex-col overflow-hidden rounded-[30px]">
          <div className="border-b border-white/8 px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="kicker">Library</div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">Your note stack</h2>
                <p className="mt-2 text-sm leading-7 text-muted">
                  Switch between saved notes, synced entries, and fresh drafts without leaving the
                  page.
                </p>
              </div>
              <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-xs text-muted">
                {notes.length} total
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {notes.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-white/12 bg-white/[0.02] px-4 py-5 text-sm leading-7 text-muted">
                No notes yet. Start a fresh note, import files, or sync a folder from a phone-friendly
                markdown setup.
              </div>
            ) : (
              <div className="space-y-2">
                {notes.map((note) => {
                  const active = note.id === selectedNoteId;
                  return (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => void openNote(note.id)}
                      className={`w-full rounded-[22px] border px-4 py-4 text-left transition ${
                        active
                          ? "border-accent/28 bg-[linear-gradient(135deg,rgba(131,225,197,0.12),rgba(255,255,255,0.04))] shadow-[0_18px_36px_rgba(4,16,12,0.16)]"
                          : "border-transparent bg-transparent hover:border-white/10 hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-foreground">{note.title}</div>
                          <div className="mt-1 text-xs text-muted">{formatDate(note.updated_at)}</div>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] ${
                            active ? "bg-accent-soft text-accent" : "bg-white/[0.04] text-muted"
                          }`}
                        >
                          {note.source_name ? "synced" : "manual"}
                        </span>
                      </div>
                      <div className="mt-3 text-xs text-muted">
                        {note.source_name ? note.source_name : `${note.chunk_count} indexed chunks`}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-white/8 px-4 py-4">
            <div className="rounded-[24px] border border-white/8 bg-black/10 p-4">
              <div className="kicker">Sync toolkit</div>
              <p className="mt-3 text-sm leading-7 text-muted">
                Point this at any cloud-synced markdown or text folder if you want the same notes on
                your phone and here.
              </p>

              <label className="mt-4 block">
                <span className="kicker">Phone sync folder</span>
                <input
                  value={folderPath}
                  onChange={(event) => setFolderPath(event.target.value)}
                  placeholder="E:\\notes-sync\\mobile-vault"
                  className="field-input mt-2 px-3 py-3 text-sm"
                />
              </label>

              <button
                type="button"
                onClick={() => void handleSyncFolder()}
                disabled={busy !== "idle"}
                className="button-secondary mt-3 w-full px-4 py-3 text-sm disabled:opacity-60"
              >
                Sync folder
              </button>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="button-secondary cursor-pointer px-4 py-3 text-center text-sm">
                  Import files
                  <input
                    type="file"
                    accept=".txt,.md,.markdown,text/plain,text/markdown"
                    multiple
                    hidden
                    onChange={(event) => void handleImportFiles(event.target.files)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void handleLoadDemo()}
                  disabled={busy !== "idle"}
                  className="button-secondary px-4 py-3 text-sm disabled:opacity-60"
                >
                  Demo notes
                </button>
              </div>
            </div>
          </div>
        </aside>

        <section className="panel flex min-h-[760px] flex-col overflow-hidden rounded-[30px]">
          <div className="border-b border-white/8 px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="kicker">Editor</div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                    {selectedNote ? selectedNote.title : "Drafting a new note"}
                  </h2>
                  <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-xs uppercase tracking-[0.16em] text-muted">
                    {selectedNote ? "selected note" : "blank draft"}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-7 text-muted">
                  {selectedNote
                    ? selectedNote.source_path || "Manual note stored inside the app."
                    : "Write naturally. Retrieval, chunking, linking, and timeline features happen after the note is saved."}
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[420px]">
                <div className="metric-card px-4 py-3">
                  <div className="kicker">Words</div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">{wordCount}</div>
                </div>
                <div className="metric-card px-4 py-3">
                  <div className="kicker">Chars</div>
                  <div className="mt-2 text-2xl font-semibold text-foreground">{characterCount}</div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={busy !== "idle"}
                    className="button-primary px-4 py-3 text-sm disabled:opacity-60"
                  >
                    {busy === "save" ? "Saving..." : selectedNoteId ? "Save changes" : "Save note"}
                  </button>
                  {selectedNoteId ? (
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      disabled={busy !== "idle"}
                      className="rounded-2xl border border-rose-400/22 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/14 disabled:opacity-60"
                    >
                      {busy === "delete" ? "Deleting..." : "Delete note"}
                    </button>
                  ) : (
                    <div className="metric-card flex items-center justify-center px-4 py-3 text-sm text-muted">
                      draft not saved yet
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-5 py-5 md:grid-cols-[minmax(0,1fr)_220px] sm:px-6">
            <label className="block">
              <span className="kicker">Title</span>
              <input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="Morning reset after a rough week"
                className="field-input mt-2 px-4 py-3 text-base"
              />
            </label>

            <label className="block">
              <span className="kicker">Date</span>
              <input
                type="date"
                value={draft.noteDate}
                onChange={(event) => setDraft((current) => ({ ...current, noteDate: event.target.value }))}
                className="field-input mt-2 px-4 py-3 text-base"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 px-5 pb-5 sm:px-6">
            <textarea
              value={draft.content}
              onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
              placeholder="Write naturally. The system will chunk, index, link, and summarize later."
              className="field-textarea h-full min-h-[520px] resize-none px-5 py-5 text-[15px] leading-8"
            />
          </div>
        </section>
      </section>
    </main>
  );
}
