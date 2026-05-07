import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { QueryResponse } from "@/lib/types";
import { AskWorkspace } from "./ask-workspace";

vi.mock("@/lib/api", () => ({
  listNotes: vi.fn().mockResolvedValue([{ id: "1" }, { id: "2" }]),
  askQuestion: vi.fn(),
  submitFeedback: vi.fn(),
}));

import { askQuestion, listNotes } from "@/lib/api";

const queryResponse: QueryResponse = {
  answer:
    "Based on the notes you already wrote, the most grounded next move is to reuse the routines that restored momentum before.",
  why_selected:
    "These notes were picked because they combine semantic similarity with direct phrase overlap.",
  suggested_actions: ["Review 'Recovering momentum' from 2026-04-01 and pull one action you still agree with."],
  citations: [
    {
      chunk_id: "chunk-1",
      note_id: "note-1",
      title: "Recovering momentum",
      note_date: "2026-04-01",
      excerpt: "Old notes lower the activation energy.",
      reason: "strong semantic match",
      score: 0.81,
    },
  ],
  recurring_themes: [
    {
      theme: "Momentum",
      note_count: 2,
      evidence_count: 2,
      summary: "Momentum appears across 2 notes.",
      representative_notes: ["Recovering momentum", "Interview reset"],
    },
  ],
  timeline: [
    {
      note_id: "note-1",
      title: "Recovering momentum",
      note_date: "2026-04-01",
      summary: "Old notes lower the activation energy.",
      score: 0.81,
    },
  ],
  note_links: [
    {
      source_note_id: "note-1",
      source_title: "Recovering momentum",
      source_date: "2026-04-01",
      target_note_id: "note-2",
      target_title: "Interview reset",
      target_date: "2026-04-03",
      shared_themes: ["Momentum"],
      rationale: "These notes connect around Momentum and reinforce each other across two dates.",
      strength: 0.78,
    },
  ],
  confidence: 0.81,
  confidence_label: "high",
  insufficient_evidence: false,
  diagnostics: {
    query_mode: "fast",
    retrieval_latency_ms: 10,
    rerank_latency_ms: 3,
    generation_latency_ms: 20,
    total_latency_ms: 33,
    semantic_mode: "local-tfidf",
    reranker_mode: "local-smart:fast",
    answer_provider: "local:heuristic",
    citation_count: 1,
    insufficient_evidence: false,
  },
};

describe("AskWorkspace", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.mocked(listNotes).mockResolvedValue([
      {
        id: "1",
        title: "a",
        note_date: "2026-04-01",
        source_name: null,
        source_path: null,
        chunk_count: 2,
        created_at: "2026-04-01T00:00:00Z",
        updated_at: "2026-04-01T00:00:00Z",
      },
      {
        id: "2",
        title: "b",
        note_date: "2026-04-02",
        source_name: null,
        source_path: null,
        chunk_count: 2,
        created_at: "2026-04-02T00:00:00Z",
        updated_at: "2026-04-02T00:00:00Z",
      },
    ]);
    vi.mocked(askQuestion).mockResolvedValue(queryResponse);
  });

  it("submits a query and renders the simplified answer flow", async () => {
    render(<AskWorkspace />);

    const questionField = await screen.findByPlaceholderText(/What should I focus on this week/i);
    fireEvent.change(
      questionField,
      { target: { value: "What should I do when I lose momentum?" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /ask notes/i }));

    await waitFor(() => {
      expect(askQuestion).toHaveBeenCalledWith("What should I do when I lose momentum?", "fast");
    });

    expect(await screen.findByText(/Grounded response/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Open memory page/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Indexed notes/i)).toBeInTheDocument();
  });

  it("clears the old answer when the next question is too vague", async () => {
    render(<AskWorkspace />);

    const questionField = await screen.findByPlaceholderText(/What should I focus on this week/i);
    fireEvent.change(
      questionField,
      { target: { value: "What should I do when I lose momentum?" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /ask notes/i }));

    expect(await screen.findByText(/Grounded response/i)).toBeInTheDocument();

    fireEvent.change(questionField, {
      target: { value: "sex" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask notes/i }));

    expect(screen.getByRole("heading", { name: /No grounded answer yet/i })).toBeInTheDocument();
    expect(
      screen.getByText(/Ask with a topic, phrase, or event that actually appears in your notes./i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Based on the notes you already wrote/i)).not.toBeInTheDocument();
  });

  it("shows a no-notes-linked state when the backend marks evidence as thin", async () => {
    vi.mocked(askQuestion).mockResolvedValueOnce({
      ...queryResponse,
      answer: "I could not find enough grounded evidence in your notes yet.",
      citations: [],
      confidence: 0.12,
      confidence_label: "low",
      insufficient_evidence: true,
    });

    render(<AskWorkspace />);

    const questionField = await screen.findByPlaceholderText(/What should I focus on this week/i);
    fireEvent.change(questionField, {
      target: { value: "penguin turbine sandwich" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask notes/i }));

    expect(await screen.findByText(/No notes linked yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/No notes linked strongly enough to that question yet/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Based on the notes you already wrote/i)).not.toBeInTheDocument();
  });

  it("sends quality mode when the user switches the toggle", async () => {
    render(<AskWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: /quality mode/i }));

    const questionField = await screen.findByPlaceholderText(/What should I focus on this week/i);
    fireEvent.change(questionField, {
      target: { value: "What helps me recover momentum?" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ask notes/i }));

    await waitFor(() => {
      expect(askQuestion).toHaveBeenCalledWith("What helps me recover momentum?", "quality");
    });
  });
});
