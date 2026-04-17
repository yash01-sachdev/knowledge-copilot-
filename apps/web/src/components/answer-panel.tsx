import Link from "next/link";

import type { QueryResponse } from "@/lib/types";

type AnswerPanelProps = {
  answer: QueryResponse | null;
  question: string;
  feedbackState: "idle" | "sending" | "saved";
  onFeedback: (useful: boolean) => void;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatProviderLabel(value: string): string {
  return value
    .split(":")
    .map((part) => part.replace(/[-_]/g, " "))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ");
}

function formatLatency(value: number): string {
  if (value < 1) {
    return "<1 ms";
  }
  return `${Math.round(value)} ms`;
}

export function AnswerPanel({
  answer,
  question,
  feedbackState,
  onFeedback,
}: AnswerPanelProps) {
  const isEmptyState = !answer || answer.insufficient_evidence || answer.citations.length === 0;

  if (isEmptyState) {
    const title = answer?.insufficient_evidence ? "No notes linked yet." : "No grounded answer yet.";
    const description =
      answer?.insufficient_evidence && question
        ? `No grounded knowledge surfaced from your notes for "${question}" yet. Try a topic, phrase, project, or event that actually exists in your notes.`
        : "No notes are linked to the current prompt yet. Ask about a topic, phrase, project, or event that actually exists in your notes, and the answer panel will only show note-backed output.";

    return (
      <section className="panel relative flex flex-1 flex-col overflow-hidden rounded-[30px] p-6 sm:p-7">
        <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full bg-accent-soft blur-3xl" />
        <div className="relative">
          <div className="kicker">Answer output</div>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">{title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted">{description}</p>
          <div className="mt-6 rounded-[24px] border border-dashed border-white/12 bg-white/[0.02] px-5 py-5 text-sm leading-7 text-muted">
            This panel stays intentionally empty until retrieval finds enough real note evidence to
            justify an answer.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <section className="panel rounded-[30px] p-6 sm:p-7">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="kicker">Answer output</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-[2.5rem]">
              Grounded response
            </h2>
            <p className="mt-2 text-sm leading-7 text-muted">{question}</p>
          </div>
          <div
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
              answer.confidence_label === "high"
                ? "bg-emerald-500/12 text-emerald-300"
                : answer.confidence_label === "medium"
                  ? "bg-amber-500/12 text-amber-300"
                  : "bg-rose-500/12 text-rose-300"
            }`}
          >
            {answer.confidence_label} confidence
          </div>
        </div>

        <div className="mt-6 rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0))] px-5 py-5 sm:px-6">
          <p className="text-lg leading-9 text-foreground">{answer.answer}</p>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[24px] border border-white/8 bg-black/10 px-5 py-4">
            <div className="kicker">Why this evidence</div>
            <p className="mt-3 text-sm leading-7 text-muted">{answer.why_selected}</p>
          </div>
          <div className="rounded-[24px] border border-white/8 bg-black/10 px-5 py-4">
            <div className="kicker">Next actions</div>
            <ul className="mt-3 space-y-2">
              {answer.suggested_actions.map((item) => (
                <li key={item} className="text-sm leading-7 text-muted">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-5 rounded-[24px] border border-white/8 bg-[linear-gradient(135deg,rgba(131,225,197,0.08),rgba(255,255,255,0.02))] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="kicker">Memory view</div>
              <p className="mt-2 text-sm text-muted">
                {answer.recurring_themes.length} themes, {answer.timeline.length} timeline entries,
                and {answer.note_links.length} active links surfaced for this query.
              </p>
            </div>
            <Link
              href="/memory"
              prefetch={false}
              className="button-secondary px-4 py-2 text-sm"
            >
              Open memory page
            </Link>
          </div>
        </div>

        {answer.diagnostics ? (
          <div className="mt-5 rounded-[24px] border border-white/8 bg-black/10 px-5 py-4">
            <div className="kicker">Run details</div>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted">
              Beginner version: this shows which engine searched your notes, which layer reranked the
              matches, which provider wrote the final answer, and how long each step took.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="metric-card px-4 py-3">
                <div className="kicker text-[11px]">Semantic search</div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {formatProviderLabel(answer.diagnostics.semantic_mode)}
                </div>
              </div>
              <div className="metric-card px-4 py-3">
                <div className="kicker text-[11px]">Reranker</div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {formatProviderLabel(answer.diagnostics.reranker_mode)}
                </div>
              </div>
              <div className="metric-card px-4 py-3">
                <div className="kicker text-[11px]">Answer model</div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {formatProviderLabel(answer.diagnostics.answer_provider)}
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <div className="metric-card px-4 py-3">
                <div className="kicker text-[11px]">Retrieval</div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {formatLatency(answer.diagnostics.retrieval_latency_ms)}
                </div>
              </div>
              <div className="metric-card px-4 py-3">
                <div className="kicker text-[11px]">Rerank</div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {formatLatency(answer.diagnostics.rerank_latency_ms)}
                </div>
              </div>
              <div className="metric-card px-4 py-3">
                <div className="kicker text-[11px]">Generation</div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {formatLatency(answer.diagnostics.generation_latency_ms)}
                </div>
              </div>
              <div className="metric-card px-4 py-3">
                <div className="kicker text-[11px]">Total</div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {formatLatency(answer.diagnostics.total_latency_ms)}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel rounded-[30px] p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="kicker">Citations</div>
            <h3 className="mt-2 text-xl font-semibold text-foreground">Supporting notes</h3>
          </div>
          <div className="text-sm text-muted">{Math.round(answer.confidence * 100)} / 100 score</div>
        </div>

        <div className="mt-5 space-y-3">
          {answer.citations.map((citation) => (
            <article
              key={citation.chunk_id}
              className="rounded-[24px] border border-white/8 bg-black/10 px-5 py-4"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h4 className="text-lg font-semibold text-foreground">{citation.title}</h4>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">
                    {formatDate(citation.note_date)}
                  </div>
                </div>
                <div className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
                  {citation.reason}
                </div>
              </div>
              <p className="mt-3 text-sm leading-7 text-muted">{citation.excerpt}</p>
            </article>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
          <div className="text-sm text-muted">
            Was this answer useful enough to keep tuning retrieval and note linking?
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onFeedback(true)}
              disabled={feedbackState === "sending"}
              className="button-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              Useful
            </button>
            <button
              type="button"
              onClick={() => onFeedback(false)}
              disabled={feedbackState === "sending"}
              className="button-secondary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              Needs work
            </button>
            {feedbackState === "saved" ? <span className="text-sm text-success">Saved</span> : null}
          </div>
        </div>
      </section>
    </section>
  );
}
