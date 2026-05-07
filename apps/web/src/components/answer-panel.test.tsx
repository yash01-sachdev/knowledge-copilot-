import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { QueryResponse } from "@/lib/types";
import { AnswerPanel } from "./answer-panel";

const answer: QueryResponse = {
  answer:
    "Your notes most strongly point toward momentum and structure. The best matching note is 'Recovering momentum' (2026-04-01).",
  why_selected:
    "These notes were picked because they combine semantic similarity with direct phrase overlap and span dated evidence.",
  suggested_actions: ["Review 'Recovering momentum' from 2026-04-01 and pull one action you still agree with."],
  citations: [
    {
      chunk_id: "chunk-1",
      note_id: "note-1",
      title: "Recovering momentum",
      note_date: "2026-04-01",
      excerpt: "Reading two relevant notes and then writing one concrete next step helps me restart.",
      reason: "strong semantic match",
      score: 0.82,
    },
  ],
  recurring_themes: [
    {
      theme: "Momentum",
      note_count: 2,
      evidence_count: 2,
      summary: "Momentum shows up across 2 notes, especially in Recovering momentum and Interview reset.",
      representative_notes: ["Recovering momentum", "Interview reset"],
    },
  ],
  timeline: [
    {
      note_id: "note-1",
      title: "Recovering momentum",
      note_date: "2026-04-01",
      summary: "Reading two relevant notes and then writing one concrete next step helps me restart.",
      score: 0.82,
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
      shared_themes: ["Momentum", "Structure"],
      rationale: "These notes connect around Momentum and Structure and reinforce each other across two dates.",
      strength: 0.79,
    },
  ],
  confidence: 0.82,
  confidence_label: "high",
  insufficient_evidence: false,
  diagnostics: {
    query_mode: "quality",
    retrieval_latency_ms: 12,
    rerank_latency_ms: 4,
    generation_latency_ms: 28,
    total_latency_ms: 44,
    semantic_mode: "local-tfidf",
    reranker_mode: "local-smart:quality",
    answer_provider: "local:heuristic",
    citation_count: 1,
    insufficient_evidence: false,
  },
};

describe("AnswerPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders grounded answer details and citations", () => {
    render(
      <AnswerPanel
        answer={answer}
        question="What helps me recover momentum?"
        feedbackState="idle"
        onFeedback={vi.fn()}
      />,
    );

    expect(screen.getByText("Grounded response")).toBeInTheDocument();
    expect(screen.getByText(/strong semantic match/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Recovering momentum/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Open memory page/i)).toBeInTheDocument();
    expect(screen.getByText(/1 active links/i)).toBeInTheDocument();
    expect(screen.getByText(/quality mode/i)).toBeInTheDocument();
    expect(screen.getByText(/high confidence/i)).toBeInTheDocument();
    expect(screen.getByText(/Run details/i)).toBeInTheDocument();
    expect(screen.getByText(/Semantic search/i)).toBeInTheDocument();
    expect(screen.getByText(/Answer model/i)).toBeInTheDocument();
  });

  it("renders a no-notes-linked state for insufficient evidence", () => {
    render(
      <AnswerPanel
        answer={{
          ...answer,
          citations: [],
          confidence: 0.12,
          confidence_label: "low",
          insufficient_evidence: true,
        }}
        question="penguin turbine sandwich"
        feedbackState="idle"
        onFeedback={vi.fn()}
      />,
    );

    expect(screen.getByText(/No notes linked yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No grounded knowledge surfaced from your notes/i)).toBeInTheDocument();
    expect(screen.queryByText(/Grounded response/i)).not.toBeInTheDocument();
  });
});
