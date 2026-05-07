import Link from "next/link";

import { formatDate, formatLatency, formatProviderLabel } from "@/lib/formatters";
import type { QueryResponse } from "@/lib/types";

type AnswerPanelProps = {
  answer: QueryResponse | null;
  question: string;
  feedbackState: "idle" | "sending" | "saved";
  onFeedback: (useful: boolean) => void;
};

function EmptyStateIcon() {
  return (
    <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-emerald-400/14 bg-emerald-400/5">
      <div className="absolute h-14 w-14 rounded-full border border-emerald-400/12" />
      <svg
        width="44"
        height="44"
        viewBox="0 0 44 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-emerald-300"
        aria-hidden="true"
      >
        <path
          d="M17 11C13.4 11 10.5 14 10.5 17.6C10.5 19.3 11.2 21 12.4 22.1C11.6 23.1 11.2 24.4 11.2 25.7C11.2 29.2 14 32 17.5 32H19.2V24.5H16.9"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M27 11C30.6 11 33.5 14 33.5 17.6C33.5 19.3 32.8 21 31.6 22.1C32.4 23.1 32.8 24.4 32.8 25.7C32.8 29.2 30 32 26.5 32H24.8V24.5H27.1"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M22 13V35"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function ConfidenceChip({ label }: { label: QueryResponse["confidence_label"] }) {
  const className =
    label === "high"
      ? "bg-emerald-500/12 text-emerald-300"
      : label === "medium"
        ? "bg-amber-500/12 text-amber-300"
        : "bg-rose-500/12 text-rose-300";

  return (
    <div className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${className}`}>
      {label} confidence
    </div>
  );
}

function QueryModeChip({ mode }: { mode: "fast" | "quality" }) {
  const className =
    mode === "quality"
      ? "bg-emerald-500/12 text-emerald-300"
      : "bg-sky-500/12 text-sky-200";

  return (
    <div className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${className}`}>
      {mode} mode
    </div>
  );
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
        : "Ask something grounded in your notes. If your notes don't mention it, the answer will say so.";

    return (
      <section className="pt-8 sm:pt-12">
        <div className="mx-auto flex max-w-[640px] flex-col items-center text-center">
          <EmptyStateIcon />
          <h2 className="mt-8 text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-[2.2rem]">
            {title}
          </h2>
          <p className="mt-4 text-lg leading-9 text-muted">{description}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <section className="panel-soft rounded-[30px] border border-white/8 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="kicker">Answer output</div>
          <div className="flex flex-wrap items-center gap-2">
            {answer.diagnostics ? <QueryModeChip mode={answer.diagnostics.query_mode} /> : null}
            <ConfidenceChip label={answer.confidence_label} />
          </div>
        </div>

        <h2 className="mt-5 text-3xl font-semibold tracking-[-0.03em] text-foreground sm:text-[2.35rem]">
          Grounded response
        </h2>
        <p className="mt-3 text-base leading-8 text-muted">{question}</p>

        <div className="mt-8 rounded-[28px] border border-white/7 bg-[rgba(255,255,255,0.02)] px-6 py-6">
          <p className="text-[1.08rem] leading-9 text-foreground sm:text-[1.12rem]">{answer.answer}</p>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/8 pt-5">
          <div>
            <Link href="/memory" prefetch={false} className="button-secondary px-4 py-2.5 text-base">
              Open memory page
            </Link>
            <p className="mt-3 text-sm leading-7 text-muted">
              {answer.recurring_themes.length} theme{answer.recurring_themes.length === 1 ? "" : "s"},{" "}
              {answer.timeline.length} timeline entries, and {answer.note_links.length} active links
              surfaced for this query.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onFeedback(true)}
              disabled={feedbackState === "sending"}
              className="button-primary px-4 py-2.5 text-base disabled:cursor-not-allowed disabled:opacity-60"
            >
              Useful
            </button>
            <button
              type="button"
              onClick={() => onFeedback(false)}
              disabled={feedbackState === "sending"}
              className="button-secondary px-4 py-2.5 text-base disabled:cursor-not-allowed disabled:opacity-60"
            >
              Needs work
            </button>
            {feedbackState === "saved" ? <span className="text-base text-success">Saved</span> : null}
          </div>
        </div>
      </section>

      <details className="panel-soft rounded-[28px] border border-white/8 p-5 sm:p-6" open>
        <summary className="cursor-pointer list-none text-xl font-semibold text-foreground">
          Supporting notes
        </summary>
        <p className="mt-3 text-base leading-8 text-muted">
          {answer.citations.length} note-backed source{answer.citations.length === 1 ? "" : "s"} support this answer.
        </p>

        <div className="mt-4 space-y-3">
          {answer.citations.map((citation) => (
            <article
              key={citation.chunk_id}
              className="rounded-[24px] border border-white/8 bg-black/10 px-5 py-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{citation.title}</h3>
                  <p className="mt-1 text-sm uppercase tracking-[0.14em] text-muted">
                    {formatDate(citation.note_date, "full")}
                  </p>
                </div>
                <div className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
                  {citation.reason}
                </div>
              </div>
              <p className="mt-3 text-base leading-8 text-muted">{citation.excerpt}</p>
            </article>
          ))}
        </div>
      </details>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel-soft rounded-[28px] border border-white/8 p-5 sm:p-6">
          <div className="kicker">Why this evidence</div>
          <p className="mt-4 text-base leading-8 text-muted">{answer.why_selected}</p>
        </section>

        <section className="panel-soft rounded-[28px] border border-white/8 p-5 sm:p-6">
          <div className="kicker">Next actions</div>
          <ul className="mt-4 space-y-2">
            {answer.suggested_actions.map((item) => (
              <li key={item} className="text-base leading-8 text-muted">
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {answer.diagnostics ? (
        <details className="panel-soft rounded-[28px] border border-white/8 p-5 sm:p-6">
          <summary className="cursor-pointer list-none text-xl font-semibold text-foreground">
            Run details
          </summary>
          <p className="mt-3 text-base leading-8 text-muted">
            Beginner version: this shows which engine searched your notes, which layer reranked the
            matches, which provider wrote the final answer, and how long each step took.
          </p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="metric-card px-4 py-3">
              <div className="kicker">Mode</div>
              <div className="mt-2 text-base font-medium text-foreground">
                {answer.diagnostics.query_mode === "quality" ? "Quality / Ollama-ready" : "Fast / Local"}
              </div>
            </div>
            <div className="metric-card px-4 py-3">
              <div className="kicker">Semantic search</div>
              <div className="mt-2 text-base font-medium text-foreground">
                {formatProviderLabel(answer.diagnostics.semantic_mode)}
              </div>
            </div>
            <div className="metric-card px-4 py-3">
              <div className="kicker">Reranker</div>
              <div className="mt-2 text-base font-medium text-foreground">
                {formatProviderLabel(answer.diagnostics.reranker_mode)}
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="metric-card px-4 py-3">
              <div className="kicker">Answer model</div>
              <div className="mt-2 text-base font-medium text-foreground">
                {formatProviderLabel(answer.diagnostics.answer_provider)}
              </div>
            </div>
            <div className="metric-card px-4 py-3">
              <div className="kicker">Retrieval</div>
              <div className="mt-2 text-base font-medium text-foreground">
                {formatLatency(answer.diagnostics.retrieval_latency_ms)}
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="metric-card px-4 py-3">
              <div className="kicker">Rerank</div>
              <div className="mt-2 text-base font-medium text-foreground">
                {formatLatency(answer.diagnostics.rerank_latency_ms)}
              </div>
            </div>
            <div className="metric-card px-4 py-3">
              <div className="kicker">Generation</div>
              <div className="mt-2 text-base font-medium text-foreground">
                {formatLatency(answer.diagnostics.generation_latency_ms)}
              </div>
            </div>
            <div className="metric-card px-4 py-3">
              <div className="kicker">Total</div>
              <div className="mt-2 text-base font-medium text-foreground">
                {formatLatency(answer.diagnostics.total_latency_ms)}
              </div>
            </div>
          </div>
        </details>
      ) : null}
    </section>
  );
}
