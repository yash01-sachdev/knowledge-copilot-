"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createNote, deleteNote, getNote, listNotes, loadDemoNotes, syncFolder, updateNote } from "@/lib/api";
import { formatDate } from "@/lib/formatters";
import { inferImportedNote } from "@/lib/import-notes";
import type { NoteDraft, NoteSummary } from "@/lib/types";

const today = new Date().toISOString().slice(0, 10);

const EMPTY_DRAFT: NoteDraft = {
  title: "",
  content: "",
  noteDate: today,
  sourceName: null,
};

export function NotesWorkspace() {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NoteDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState<"idle" | "list" | "save" | "sync" | "delete">("idle");
  const [folderPath, setFolderPath] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);
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
  const filteredNotes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return notes;
    }

    return notes.filter((note) => {
      const source = note.source_name?.toLowerCase() ?? "";
      return note.title.toLowerCase().includes(query) || source.includes(query);
    });
  }, [notes, searchQuery]);

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
    <main className="flex min-h-screen flex-1 bg-[#090d0c] text-[#e5e7e6]">
      <section className="flex w-full flex-col xl:grid xl:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="flex min-h-[100dvh] flex-col border-b border-[#1a2922] bg-[#0a0f0d] xl:border-b-0 xl:border-r">
          <div className="border-b border-[#1a2922] px-6 py-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-foreground">Notes</h1>
                <span className="rounded-full bg-[#15221d] px-3 py-1 text-[0.95rem] text-accent">{notes.length}</span>
              </div>
              <button
                type="button"
                onClick={handleNewNote}
                className="rounded-full bg-[#41d693] px-5 py-3 text-[1rem] font-semibold text-[#08110f] transition hover:brightness-105"
              >
                + New Note
              </button>
            </div>

            <label className="mt-6 block">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search notes..."
                className="w-full rounded-[18px] border border-[#1e2d28] bg-[#0f1714] px-4 py-3.5 text-[1.05rem] text-foreground outline-none transition placeholder:text-[#6f807c] focus:border-[#2f8f70]"
              />
            </label>
          </div>

          {status ? (
            <div
              className={`border-b px-6 py-3 text-[0.98rem] ${
                status.tone === "error"
                  ? "border-rose-500/20 bg-rose-500/8 text-rose-100"
                  : status.tone === "success"
                    ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-100"
                    : "border-[#1a2922] bg-[#0d1412] text-muted"
              }`}
            >
              {status.message}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredNotes.length === 0 ? (
              <div className="px-6 py-6 text-[1rem] leading-8 text-muted">
                {notes.length === 0
                  ? "No notes yet. Start a new note, import files, or load the demo set."
                  : "No notes matched that search."}
              </div>
            ) : (
              <div>
                {filteredNotes.map((note) => {
                  const active = note.id === selectedNoteId;
                  return (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => void openNote(note.id)}
                      className={`w-full border-b border-[#111b17] px-6 py-5 text-left transition ${
                        active ? "bg-[#0f1814]" : "bg-transparent hover:bg-[#0c1411]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className={`truncate text-[1.05rem] font-semibold ${active ? "text-accent" : "text-foreground"}`}>
                            {note.title}
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-[0.98rem] text-muted">
                            <span>{formatDate(note.note_date, "short")}</span>
                          </div>
                          <div className="mt-2 truncate text-[0.98rem] text-muted">
                            {note.source_name ? `Synced from ${note.source_name}` : "Manual note saved in the app"}
                          </div>
                        </div>
                        <span
                          className={`rounded-lg px-2.5 py-1 text-[0.78rem] font-medium uppercase tracking-[0.12em] ${
                            note.source_name ? "bg-[#123126] text-[#55dba0]" : "bg-[#17201d] text-[#7f908c]"
                          }`}
                        >
                          {note.source_name ? "synced" : "manual"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-[#1a2922] px-6 py-4">
            <button
              type="button"
              onClick={() => setToolsOpen((current) => !current)}
              className="flex w-full items-center justify-between text-left text-[0.98rem] text-muted transition hover:text-foreground"
            >
              <span>Phone sync folder tools</span>
              <span>{toolsOpen ? "−" : "+"}</span>
            </button>

            {toolsOpen ? (
              <div className="mt-4 space-y-3">
                <input
                  value={folderPath}
                  onChange={(event) => setFolderPath(event.target.value)}
                  placeholder="path/to/notes-folder"
                  className="w-full rounded-[16px] border border-[#1e2d28] bg-[#0f1714] px-4 py-3 text-[0.98rem] text-foreground outline-none transition placeholder:text-[#6f807c] focus:border-[#2f8f70]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSyncFolder()}
                    disabled={busy !== "idle"}
                    className="rounded-[16px] border border-[#1f5d49] bg-[#123126] px-4 py-3 text-[0.95rem] font-medium text-accent transition hover:bg-[#173e30] disabled:opacity-60"
                  >
                    Sync folder
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleLoadDemo()}
                    disabled={busy !== "idle"}
                    className="rounded-[16px] border border-[#1e2d28] bg-[#111816] px-4 py-3 text-[0.95rem] font-medium text-foreground transition hover:bg-[#17211d] disabled:opacity-60"
                  >
                    Demo notes
                  </button>
                </div>
                <label className="block cursor-pointer rounded-[16px] border border-[#1e2d28] bg-[#111816] px-4 py-3 text-center text-[0.95rem] font-medium text-foreground transition hover:bg-[#17211d]">
                  Import files
                  <input
                    type="file"
                    accept=".txt,.md,.markdown,text/plain,text/markdown"
                    multiple
                    hidden
                    onChange={(event) => void handleImportFiles(event.target.files)}
                  />
                </label>
              </div>
            ) : null}
          </div>
        </aside>

        <section className="flex min-h-[100dvh] flex-col bg-[#090d0c]">
          <div className="flex flex-wrap items-center gap-4 border-b border-[#1a2922] px-6 py-5">
            <div className="min-w-0 flex-1">
              <div className="mb-2 text-[0.92rem] uppercase tracking-[0.16em] text-muted">Editor</div>
              <input
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="Morning reset after a rough week"
                className="w-full bg-transparent text-[2rem] font-semibold tracking-[-0.04em] text-foreground outline-none placeholder:text-[#7a8a86]"
              />
              <div className="mt-2 text-[0.98rem] text-muted">
                {selectedNote ? selectedNote.source_path || "Manual note stored inside the app" : "Drafting a new note"}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                type="date"
                value={draft.noteDate}
                onChange={(event) => setDraft((current) => ({ ...current, noteDate: event.target.value }))}
                className="rounded-[16px] border border-[#1e2d28] bg-[#0f1714] px-4 py-3 text-[1rem] text-muted outline-none transition focus:border-[#2f8f70]"
              />
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={busy !== "idle"}
                className="rounded-[16px] bg-[#1f7a56] px-5 py-3 text-[1rem] font-semibold text-foreground transition hover:brightness-105 disabled:opacity-60"
              >
                {busy === "save" ? "Saving..." : "Save note"}
              </button>
              {selectedNoteId ? (
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={busy !== "idle"}
                  className="rounded-[16px] bg-[#311414] px-4 py-3 text-[1rem] font-semibold text-rose-100 transition hover:bg-[#3c1717] disabled:opacity-60"
                >
                  {busy === "delete" ? "Deleting..." : "Delete note"}
                </button>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 px-6 py-6">
            <textarea
              value={draft.content}
              onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
              placeholder="Write naturally. The system will chunk, index, link, and summarize later."
              className="h-full min-h-[520px] w-full resize-none bg-transparent text-[1.18rem] leading-[2.2rem] text-foreground outline-none placeholder:text-[#667874]"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1a2922] px-6 py-4 text-[0.98rem] text-muted">
            <span>{selectedNote?.source_path ?? (selectedNoteId ? "Manual note stored inside the app" : "Unsaved draft")}</span>
            <span>
              {wordCount} words • {characterCount} characters
            </span>
          </div>
        </section>
      </section>
    </main>
  );
}
