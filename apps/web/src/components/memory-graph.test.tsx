import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MemoryGraph } from "./memory-graph";

const nodes = [
  {
    note_id: "note-1",
    title: "Recovering momentum",
    note_date: "2026-04-01",
    primary_theme: "Momentum",
    degree: 2,
  },
  {
    note_id: "note-2",
    title: "Interview reset",
    note_date: "2026-04-04",
    primary_theme: "Practice",
    degree: 1,
  },
  {
    note_id: "note-3",
    title: "Weekly planning",
    note_date: "2026-04-06",
    primary_theme: "Structure",
    degree: 1,
  },
];

const links = [
  {
    source_note_id: "note-1",
    source_title: "Recovering momentum",
    source_date: "2026-04-01",
    target_note_id: "note-2",
    target_title: "Interview reset",
    target_date: "2026-04-04",
    shared_themes: ["Momentum", "Practice"],
    rationale: "These notes reinforce the same recovery routine from two different weeks.",
    strength: 0.83,
  },
  {
    source_note_id: "note-2",
    source_title: "Interview reset",
    source_date: "2026-04-04",
    target_note_id: "note-3",
    target_title: "Weekly planning",
    target_date: "2026-04-06",
    shared_themes: ["Structure"],
    rationale: "These notes connect preparation habits to weekly planning.",
    strength: 0.74,
  },
];

describe("MemoryGraph", () => {
  it("lets the user open notes and inspect links", async () => {
    const fetchNoteDetail = vi.fn().mockResolvedValue({
      id: "note-1",
      title: "Recovering momentum",
      note_date: "2026-04-01",
      source_name: null,
      source_path: null,
      chunk_count: 2,
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
      content:
        "Reading two relevant notes and then writing one concrete next step helps me restart.",
    });

    render(<MemoryGraph nodes={nodes} links={links} fetchNoteDetail={fetchNoteDetail} />);

    expect(screen.getByText(/Interactive map/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Inspect note Recovering momentum/i));
    expect(fetchNoteDetail).toHaveBeenCalledWith("note-1");
    expect(await screen.findByText(/Full note/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Reading two relevant notes and then writing one concrete next step helps me restart./i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Inspect link between Recovering momentum and Interview reset/i));
    expect(screen.getByText(/Connection in focus/i)).toBeInTheDocument();
    expect(
      screen.getByText(/These notes reinforce the same recovery routine from two different weeks./i),
    ).toBeInTheDocument();
  });

  it("lets the user expand the graph canvas size", async () => {
    render(<MemoryGraph nodes={nodes} links={links} />);

    expect(
      screen
        .getAllByTestId("memory-graph-canvas")
        .some((canvas) => canvas.getAttribute("class")?.includes("h-[620px]")),
    ).toBe(true);

    fireEvent.click(screen.getAllByRole("button", { name: /Open fullscreen/i })[0]);

    await waitFor(() => {
      expect(
        screen
          .getAllByTestId("memory-graph-canvas")
          .some((canvas) => canvas.getAttribute("class")?.includes("h-[calc(100vh-220px)]")),
      ).toBe(true);
    });
  });
});
