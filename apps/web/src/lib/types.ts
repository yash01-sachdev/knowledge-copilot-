export type NoteSummary = {
  id: string;
  title: string;
  note_date: string;
  source_name: string | null;
  source_path: string | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
};

export type NoteDetail = NoteSummary & {
  content: string;
};

export type Citation = {
  chunk_id: string;
  note_id: string;
  title: string;
  note_date: string;
  excerpt: string;
  reason: string;
  score: number;
};

export type RecurringTheme = {
  theme: string;
  note_count: number;
  evidence_count: number;
  summary: string;
  representative_notes: string[];
};

export type TimelineEvent = {
  note_id: string;
  title: string;
  note_date: string;
  summary: string;
  score: number;
};

export type NoteLink = {
  source_note_id: string;
  source_title: string;
  source_date: string;
  target_note_id: string;
  target_title: string;
  target_date: string;
  shared_themes: string[];
  rationale: string;
  strength: number;
};

export type ThemeDrift = {
  theme: string;
  recent_count: number;
  previous_count: number;
  delta: number;
  direction: "up" | "down" | "stable";
  summary: string;
};

export type MemoryTrailStep = {
  note_id: string;
  title: string;
  note_date: string;
  summary: string;
};

export type MemoryTrail = {
  topic: string;
  arc_summary: string;
  steps: MemoryTrailStep[];
};

export type MemoryGraphNode = {
  note_id: string;
  title: string;
  note_date: string;
  primary_theme: string | null;
  degree: number;
};

export type MemoryOverview = {
  total_notes: number;
  themes: RecurringTheme[];
  theme_drift: ThemeDrift[];
  timeline: TimelineEvent[];
  suggested_links: NoteLink[];
  memory_trails: MemoryTrail[];
  graph_nodes: MemoryGraphNode[];
  graph_links: NoteLink[];
};

export type QueryDiagnostics = {
  query_mode: "fast" | "quality";
  retrieval_latency_ms: number;
  rerank_latency_ms: number;
  generation_latency_ms: number;
  total_latency_ms: number;
  semantic_mode: string;
  reranker_mode: string;
  answer_provider: string;
  citation_count: number;
  insufficient_evidence: boolean;
};

export type QueryMode = "fast" | "quality";

export type QueryResponse = {
  answer: string;
  why_selected: string;
  suggested_actions: string[];
  citations: Citation[];
  recurring_themes: RecurringTheme[];
  timeline: TimelineEvent[];
  note_links: NoteLink[];
  confidence: number;
  confidence_label: "low" | "medium" | "high";
  insufficient_evidence: boolean;
  diagnostics: QueryDiagnostics | null;
};

export type NoteDraft = {
  title: string;
  content: string;
  noteDate: string;
  sourceName?: string | null;
};
