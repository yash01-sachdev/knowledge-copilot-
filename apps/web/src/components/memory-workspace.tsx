"use client";

import { useEffect, useState } from "react";

import { getMemoryOverview, reviewMemoryLink } from "@/lib/api";
import type { MemoryOverview } from "@/lib/types";
import { MemoryGraph } from "./memory-graph";
import { StatusBanner } from "./status-banner";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function MemoryWorkspace() {
  const [overview, setOverview] = useState<MemoryOverview | null>(null);
  const [reviewingLinkKey, setReviewingLinkKey] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: "default" | "error" | "success"; message: string } | null>({
    tone: "default",
    message: "This page turns the note base into a longer-term memory view.",
  });
  const isolatedNotes = overview?.graph_nodes.filter((node) => node.degree === 0) ?? [];

  useEffect(() => {
    void (async () => {
      try {
        const nextOverview = await getMemoryOverview();
        setOverview(nextOverview);
        setStatus({
          tone: "success",
          message: `Loaded ${nextOverview.total_notes} notes into the memory graph.`,
        });
      } catch (error) {
        setStatus({
          tone: "error",
          message: error instanceof Error ? error.message : "Could not load the memory overview.",
        });
      }
    })();
  }, []);

  async function handleReviewLink(
    sourceNoteId: string,
    targetNoteId: string,
    decision: "accepted" | "rejected",
  ) {
    const key = `${sourceNoteId}-${targetNoteId}`;
    setReviewingLinkKey(key);
    try {
      const nextOverview = await reviewMemoryLink({
        source_note_id: sourceNoteId,
        target_note_id: targetNoteId,
        decision,
      });
      setOverview(nextOverview);
      setStatus({
        tone: "success",
        message:
          decision === "accepted"
            ? "Accepted the suggested connection and refreshed the memory graph."
            : "Rejected that suggestion and removed it from the active memory hints.",
      });
    } catch (error) {
      setStatus({
        tone: "error",
        message: error instanceof Error ? error.message : "Could not review that memory suggestion.",
      });
    } finally {
      setReviewingLinkKey(null);
    }
  }

  return (
    <main className="page-frame flex flex-1 flex-col gap-5">
      <section className="panel relative overflow-hidden rounded-[32px] px-6 py-6 sm:px-7 lg:px-8">
        <div className="pointer-events-none absolute right-0 top-0 h-52 w-52 rounded-full bg-accent-soft blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-40 w-40 rounded-full bg-warm-soft blur-3xl" />

        <div className="relative grid gap-6 xl:grid-cols-[1.05fr_0.95fr] xl:items-end">
          <div className="max-w-3xl">
            <div className="kicker">Memory</div>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-[3.2rem]">
              See how notes connect across time, not just one answer at a time.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-muted">
              This page turns the note base into a longer-term memory view with recurring themes,
              persistent links, and a graph you can actually explore.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="metric-card px-4 py-4">
              <div className="kicker">Notes</div>
              <div className="mt-3 text-3xl font-semibold text-foreground">
                {overview ? overview.total_notes : "..."}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">loaded into the memory system</p>
            </div>
            <div className="metric-card px-4 py-4">
              <div className="kicker">Themes</div>
              <div className="mt-3 text-3xl font-semibold text-foreground">
                {overview ? overview.themes.length : "..."}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">recurring clusters surfaced</p>
            </div>
            <div className="metric-card px-4 py-4">
              <div className="kicker">Links</div>
              <div className="mt-3 text-3xl font-semibold text-foreground">
                {overview ? overview.graph_links.length : "..."}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">persistent connections stored</p>
            </div>
          </div>
        </div>
      </section>

      {status ? <StatusBanner tone={status.tone} message={status.message} /> : null}

      <section className="grid gap-5 xl:grid-cols-[370px_minmax(0,1fr)]">
        <div className="space-y-5">
          <section className="panel rounded-[30px] p-5 sm:p-6">
            <div className="kicker">Recurring themes</div>
            <div className="mt-4 space-y-3">
              {overview?.themes.map((theme) => (
                <article
                  key={theme.theme}
                  className="rounded-[24px] border border-white/8 bg-black/10 px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold text-foreground">{theme.theme}</h2>
                    <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
                      {theme.note_count} notes
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-muted">{theme.summary}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel rounded-[30px] p-5 sm:p-6">
            <div className="kicker">Theme drift</div>
            <p className="mt-3 text-sm leading-7 text-muted">
              Compare the more recent note window against the earlier one to see what is rising,
              fading, or staying steady.
            </p>
            <div className="mt-4 space-y-3">
              {overview?.theme_drift.map((item) => (
                <article
                  key={`drift-${item.theme}`}
                  className="rounded-[24px] border border-white/8 bg-black/10 px-4 py-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-foreground">{item.theme}</h3>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        item.direction === "up"
                          ? "bg-emerald-500/12 text-emerald-200"
                          : item.direction === "down"
                            ? "bg-rose-500/12 text-rose-200"
                            : "bg-white/[0.06] text-muted"
                      }`}
                    >
                      {item.direction === "up" ? "rising" : item.direction === "down" ? "fading" : "stable"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-muted">{item.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                    <span className="rounded-full border border-white/8 px-3 py-1">
                      recent: {item.recent_count}
                    </span>
                    <span className="rounded-full border border-white/8 px-3 py-1">
                      earlier: {item.previous_count}
                    </span>
                    <span className="rounded-full border border-white/8 px-3 py-1">
                      delta: {item.delta > 0 ? `+${item.delta}` : item.delta}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="panel rounded-[30px] p-5 sm:p-6">
            <div className="kicker">Timeline</div>
            <div className="mt-4 space-y-3">
              {overview?.timeline.map((event) => (
                <article
                  key={`${event.note_id}-${event.note_date}`}
                  className="rounded-[24px] border border-white/8 bg-black/10 px-4 py-4"
                >
                  <div className="text-xs uppercase tracking-[0.18em] text-accent">
                    {formatDate(event.note_date)}
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-foreground">{event.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted">{event.summary}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel rounded-[30px] p-5 sm:p-6">
            <div className="kicker">Suggested connections</div>
            <p className="mt-3 text-sm leading-7 text-muted">
              These are possible memory links that have not been promoted into the graph yet. Accept
              one to strengthen the graph, or hide it if it feels wrong.
            </p>
            <div className="mt-4 space-y-3">
              {overview?.suggested_links.length ? (
                overview.suggested_links.map((link) => {
                  const reviewKey = `${link.source_note_id}-${link.target_note_id}`;
                  const isBusy = reviewingLinkKey === reviewKey;
                  return (
                    <article
                      key={`suggested-${reviewKey}`}
                      className="rounded-[24px] border border-white/8 bg-black/10 px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-foreground">
                            {link.source_title} to {link.target_title}
                          </h3>
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-muted">
                            {formatDate(link.source_date)} and {formatDate(link.target_date)}
                          </div>
                        </div>
                        <span className="rounded-full bg-white/[0.06] px-3 py-1 text-xs text-muted">
                          {Math.round(link.strength * 100)}% fit
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-7 text-muted">{link.rationale}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {link.shared_themes.map((theme) => (
                          <span
                            key={`${reviewKey}-${theme}`}
                            className="rounded-full border border-white/8 px-3 py-1 text-xs text-muted"
                          >
                            {theme}
                          </span>
                        ))}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleReviewLink(link.source_note_id, link.target_note_id, "accepted")}
                          disabled={isBusy}
                          className="button-primary px-4 py-2 text-sm disabled:opacity-60"
                        >
                          {isBusy ? "Saving..." : "Accept"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleReviewLink(link.source_note_id, link.target_note_id, "rejected")}
                          disabled={isBusy}
                          className="button-secondary px-4 py-2 text-sm disabled:opacity-60"
                        >
                          Hide
                        </button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm leading-7 text-muted">
                  No pending link suggestions right now. That usually means the current graph already
                  reflects the strongest reusable connections.
                </div>
              )}
            </div>
          </section>

          {isolatedNotes.length > 0 ? (
            <section className="panel rounded-[30px] p-5 sm:p-6">
              <div className="kicker">Outlier notes</div>
              <p className="mt-3 text-sm leading-7 text-muted">
                These notes are currently weakly connected to the rest of your memory graph. That
                usually means niche context, a one-off entry, or not enough detail yet.
              </p>
              <div className="mt-4 space-y-3">
                {isolatedNotes.slice(0, 4).map((note) => (
                  <article
                    key={`isolated-${note.note_id}`}
                    className="rounded-[24px] border border-white/8 bg-black/10 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold text-foreground">{note.title}</h3>
                      <span className="rounded-full border border-white/8 px-3 py-1 text-xs text-muted">
                        isolated
                      </span>
                    </div>
                    <div className="mt-2 text-xs uppercase tracking-[0.18em] text-muted">
                      {formatDate(note.note_date)}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <section className="panel rounded-[30px] p-5 sm:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="kicker">Memory graph</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
                Persistent note links
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
                Drag to pan, zoom for denser maps, click a note to open the full entry, and click a
                line to pin the connection. Clusters are color-coded so the map feels readable instead
                of turning into a wall of identical nodes.
              </p>
            </div>
            <div className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-xs text-muted">
              {overview ? `${overview.graph_nodes.length} visible nodes` : "loading graph"}
            </div>
          </div>

          <div className="mt-5">
            <MemoryGraph nodes={overview?.graph_nodes ?? []} links={overview?.graph_links ?? []} />
          </div>
        </section>
      </section>

      <section className="panel rounded-[30px] p-5 sm:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="kicker">Memory trails</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">
              Story view across time
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted">
              For one topic, this shows a sequence of related notes: first thought, later refinement,
              and current direction.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-3">
          {overview?.memory_trails.length ? (
            overview.memory_trails.map((trail) => (
              <article
                key={`trail-${trail.topic}`}
                className="rounded-[26px] border border-white/8 bg-black/10 px-5 py-5"
              >
                <div className="kicker">{trail.topic}</div>
                <p className="mt-3 text-sm leading-7 text-muted">{trail.arc_summary}</p>
                <div className="mt-5 space-y-4">
                  {trail.steps.map((step, index) => (
                    <div key={step.note_id} className="relative pl-6">
                      {index < trail.steps.length - 1 ? (
                        <div className="absolute left-[9px] top-6 h-[calc(100%+0.5rem)] w-px bg-gradient-to-b from-accent/60 to-transparent" />
                      ) : null}
                      <div className="absolute left-0 top-1.5 h-[18px] w-[18px] rounded-full border border-accent/30 bg-accent-soft" />
                      <div className="text-xs uppercase tracking-[0.16em] text-accent">
                        {index === 0
                          ? "first thought"
                          : index === trail.steps.length - 1
                            ? "current direction"
                            : "later refinement"}
                      </div>
                      <h3 className="mt-1 text-base font-semibold text-foreground">{step.title}</h3>
                      <div className="mt-1 text-xs uppercase tracking-[0.16em] text-muted">
                        {formatDate(step.note_date)}
                      </div>
                      <p className="mt-2 text-sm leading-7 text-muted">{step.summary}</p>
                    </div>
                  ))}
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm leading-7 text-muted xl:col-span-3">
              Add a few more notes around the same themes and the story view will start showing how
              ideas evolved from earlier thought to current direction.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
