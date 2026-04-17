import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NotesWorkspace } from "./notes-workspace";

vi.mock("@/lib/api", () => ({
  listNotes: vi.fn(),
  getNote: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  loadDemoNotes: vi.fn(),
  syncFolder: vi.fn(),
}));

import { createNote, deleteNote, getNote, listNotes } from "@/lib/api";

describe("NotesWorkspace", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(listNotes).mockResolvedValue([]);
    vi.mocked(getNote).mockResolvedValue({
      id: "note-1",
      title: "Existing note",
      content: "This is an existing note with enough content to open in the editor.",
      note_date: "2026-04-17",
      source_name: null,
      source_path: null,
      chunk_count: 1,
      created_at: "2026-04-17T00:00:00Z",
      updated_at: "2026-04-17T00:00:00Z",
    });
    vi.mocked(createNote).mockResolvedValue({
      id: "note-2",
      title: "Created note",
      note_date: "2026-04-17",
      source_name: null,
      source_path: null,
      chunk_count: 1,
      created_at: "2026-04-17T00:00:00Z",
      updated_at: "2026-04-17T00:00:00Z",
    });
    vi.mocked(deleteNote).mockResolvedValue({
      id: "note-1",
      title: "Existing note",
      content: "This is an existing note with enough content to open in the editor.",
      note_date: "2026-04-17",
      source_name: null,
      source_path: null,
      chunk_count: 1,
      created_at: "2026-04-17T00:00:00Z",
      updated_at: "2026-04-17T00:00:00Z",
    });
  });

  it("renders the note-app style workspace", async () => {
    render(<NotesWorkspace />);

    await screen.findByText(/No notes yet/i);
    expect(screen.getByText(/Phone sync folder/i)).toBeInTheDocument();
    expect(screen.getByText(/Editor/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save note/i })).toBeInTheDocument();
  });

  it("stays in draft mode after clicking new note", async () => {
    vi.mocked(listNotes).mockResolvedValue([
      {
        id: "note-1",
        title: "Existing note",
        note_date: "2026-04-17",
        source_name: null,
        source_path: null,
        chunk_count: 1,
        created_at: "2026-04-17T00:00:00Z",
        updated_at: "2026-04-17T00:00:00Z",
      },
    ]);

    render(<NotesWorkspace />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Existing note")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /New note/i }));

    const titleInput = screen.getByPlaceholderText(/Morning reset after a rough week/i) as HTMLInputElement;
    const contentInput = screen.getByPlaceholderText(
      /Write naturally. The system will chunk, index, link, and summarize later./i,
    ) as HTMLTextAreaElement;

    await waitFor(() => {
      expect(titleInput.value).toBe("");
      expect(contentInput.value).toBe("");
    });
    expect(screen.getByText(/Drafting a new note/i)).toBeInTheDocument();
  });

  it("blocks saving short content before the backend returns 422", async () => {
    render(<NotesWorkspace />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Save note/i })).toBeEnabled();
    });

    fireEvent.change(screen.getByPlaceholderText(/Morning reset after a rough week/i), {
      target: { value: "Short note" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Write naturally/i), {
      target: { value: "Too short to save" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Save note/i }));

    expect(
      await screen.findByText(/at least 30 characters of content before saving/i),
    ).toBeInTheDocument();
    expect(createNote).not.toHaveBeenCalled();
  });

  it("deletes the selected note and returns to a blank draft", async () => {
    vi.mocked(listNotes)
      .mockResolvedValueOnce([
        {
          id: "note-1",
          title: "Existing note",
          note_date: "2026-04-17",
          source_name: null,
          source_path: null,
          chunk_count: 1,
          created_at: "2026-04-17T00:00:00Z",
          updated_at: "2026-04-17T00:00:00Z",
        },
      ])
      .mockResolvedValueOnce([]);

    render(<NotesWorkspace />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Existing note")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Delete note/i }));

    await waitFor(() => {
      expect(deleteNote).toHaveBeenCalledWith("note-1");
    });
    expect(await screen.findByText(/Deleted Existing note/i)).toBeInTheDocument();
    expect(screen.getByText(/Drafting a new note/i)).toBeInTheDocument();
  });
});
