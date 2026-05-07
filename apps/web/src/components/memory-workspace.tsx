"use client";

import { useEffect, useMemo, useState } from "react";

import { getMemoryOverview, reviewMemoryLink } from "@/lib/api";
import { formatDate } from "@/lib/formatters";
import { getMemoryThemeTone } from "@/lib/memory-theme";
import type { MemoryOverview, MemoryTrail, NoteLink, ThemeDrift, TimelineEvent } from "@/lib/types";
import { MemoryGraph } from "./memory-graph";
import { MemorySection } from "./memory-section";
import { MemorySidebar } from "./memory-sidebar";

type StatusTone = "default" | "error" | "success";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getLastUpdatedLabel(overview: MemoryOverview | null): string {
  if (!overview || overview.graph_nodes.length === 0) {
    return "Waiting";
  }

  const latest = [...overview.graph_nodes]
    .sort((left, right) => Date.parse(right.note_date) - Date.parse(left.note_date))[0]
    ?.note_date;

  return latest ? formatDate(latest, "short") : "Waiting";
}

function buildThemeBars(item: ThemeDrift): number[] {
  const start = clamp(item.previous_count * 12 + 12, 12, 56);
  const end = clamp(item.recent_count * 12 + 12, 12, 56);

  return Array.from({ length: 7 }, (_, index) => {
    const progress = index / 6;
    return Math.round(start + (end - start) * progress);
  });
}

function EmptySection({ message }: { message: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-5 text-base leading-8 text-muted">
      {message}
    </div>
  );
}

function ThemeDriftPanel({ items }: { items: ThemeDrift[] }) {
  if (items.length === 0) {
    return <EmptySection message="No theme drift data surfaced for the current filter yet." />;
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const tone = getMemoryThemeTone(item.theme);
        const bars = buildThemeBars(item);
        const statusLabel =
          item.direction === "up" ? "rising" : item.direction === "down" ? "fading" : "stable";
        const statusColor =
          item.direction === "up" ? tone.base : item.direction === "down" ? "#ff7070" : "rgba(150,168,188,0.9)";

        return (
          <article
            key={`drift-${item.theme}`}
            className="rounded-[22px] border border-white/8 bg-[rgba(10,16,14,0.64)] px-5 py-5"
          >
            <div className="grid items-center gap-4 xl:grid-cols-[170px_minmax(0,1fr)_120px]">
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tone.base }} />
                <div className="text-[1.2rem] font-medium text-foreground">{item.theme}</div>
              </div>

              <div className="flex items-end gap-1.5">
                {bars.map((height, index) => (
                  <div
                    key={`${item.theme}-${index}`}
                    className="min-w-0 flex-1 rounded-md"
                    style={{
                      height: `${height}px`,
                      backgroundColor: tone.base,
                      opacity: 0.55 + index * 0.06,
                    }}
                  />
                ))}
              </div>

              <div className="text-right">
                <div className="text-base font-medium" style={{ color: statusColor }}>
                  {item.direction === "up" ? "↗" : item.direction === "down" ? "↘" : "—"} {statusLabel}
                </div>
                <div className="mt-1 text-sm text-muted">{item.recent_count} recent / {item.previous_count} earlier</div>
              </div>
            </div>

            <p className="mt-3 text-base leading-8 text-muted">{item.summary}</p>
          </article>
        );
      })}
    </div>
  );
}

function TimelinePanel({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <EmptySection message="No recent timeline events matched the current filter." />;
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-4">
        {events.map((event) => (
          <article
            key={`${event.note_id}-${event.note_date}`}
            className="w-[310px] rounded-[24px] border border-white/8 bg-[rgba(10,16,14,0.62)] px-5 py-5"
          >
            <div className="inline-flex rounded-full bg-accent-soft px-3 py-1 text-sm font-medium text-accent">
              {formatDate(event.note_date, "short")}
            </div>
            <h3 className="mt-4 text-[1.45rem] font-medium text-foreground">{event.title}</h3>
            <p className="mt-3 text-base leading-8 text-muted">{event.summary}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function SuggestedConnectionsPanel({
  links,
  reviewingLinkKey,
  onReview,
}: {
  links: NoteLink[];
  reviewingLinkKey: string | null;
  onReview: (sourceNoteId: string, targetNoteId: string, decision: "accepted" | "rejected") => Promise<void>;
}) {
  if (links.length === 0) {
    return <EmptySection message="No pending connection suggestions are waiting for review right now." />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {links.map((link) => {
        const reviewKey = `${link.source_note_id}-${link.target_note_id}`;
        const isBusy = reviewingLinkKey === reviewKey;

        return (
          <article
            key={`connection-${reviewKey}`}
            className="rounded-[22px] border border-white/8 bg-[rgba(10,16,14,0.62)] px-5 py-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="mt-1 text-lg text-accent">↔</div>
                <div>
                  <h3 className="text-[1.25rem] font-medium text-foreground">{link.source_title}</h3>
                  <p className="mt-1 text-base text-muted">→ {link.target_title}</p>
                </div>
              </div>
              <span className="rounded-full bg-accent-soft px-3 py-1 text-sm text-accent">
                {Math.round(link.strength * 100)}% fit
              </span>
            </div>

            <p className="mt-3 text-base leading-8 text-muted">{link.rationale}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              {link.shared_themes.map((theme) => (
                <span
                  key={`${reviewKey}-${theme}`}
                  className="rounded-full border px-3 py-1 text-sm"
                  style={{
                    borderColor: getMemoryThemeTone(theme).border,
                    backgroundColor: getMemoryThemeTone(theme).soft,
                    color: getMemoryThemeTone(theme).base,
                  }}
                >
                  {theme}
                </span>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void onReview(link.source_note_id, link.target_note_id, "accepted")}
                className="button-primary px-4 py-2 text-base disabled:opacity-60"
              >
                {isBusy ? "Saving..." : "Keep link"}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void onReview(link.source_note_id, link.target_note_id, "rejected")}
                className="button-secondary px-4 py-2 text-base disabled:opacity-60"
              >
                Hide
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function OutlierNotesPanel({
  notes,
  onOpenTheme,
}: {
  notes: MemoryOverview["graph_nodes"];
  onOpenTheme: (theme: string | null) => void;
}) {
  if (notes.length === 0) {
    return <EmptySection message="No isolated notes surfaced in the current memory slice." />;
  }

  return (
    <div className="space-y-3">
      {notes.map((note) => (
        <article
          key={`isolated-${note.note_id}`}
          className="rounded-[20px] border border-white/8 bg-[rgba(10,16,14,0.58)] px-5 py-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-[1.15rem] font-medium text-foreground">{note.title}</h3>
              <p className="mt-1 text-sm uppercase tracking-[0.12em] text-muted">
                {formatDate(note.note_date, "full")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {note.primary_theme ? (
                <button
                  type="button"
                  onClick={() => onOpenTheme(note.primary_theme)}
                  className="rounded-full px-3 py-1 text-sm"
                  style={{
                    color: getMemoryThemeTone(note.primary_theme).base,
                    backgroundColor: getMemoryThemeTone(note.primary_theme).soft,
                    border: `1px solid ${getMemoryThemeTone(note.primary_theme).border}`,
                  }}
                >
                  {note.primary_theme}
                </button>
              ) : null}
              <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-muted">isolated</span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function MemoryTrailsPanel({ trails }: { trails: MemoryTrail[] }) {
  if (trails.length === 0) {
    return <EmptySection message="Add a few more notes around the same ideas and memory trails will start forming." />;
  }

  return (
    <div className="space-y-6">
      {trails.map((trail) => (
        <div key={`trail-${trail.topic}`} className="space-y-3">
          <div className="kicker">{trail.topic}</div>
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max items-center gap-5">
              {trail.steps.map((step, index) => {
                const isLast = index === trail.steps.length - 1;
                return (
                  <div key={step.note_id} className="flex items-center gap-5">
                    <article
                      className={`w-[280px] rounded-full border px-6 py-5 ${
                        isLast ? "border-accent/60 bg-accent-soft" : "border-white/10 bg-[rgba(10,16,14,0.58)]"
                      }`}
                    >
                      <div className={`text-sm ${isLast ? "text-accent" : "text-muted"}`}>
                        {formatDate(step.note_date, "short")}
                      </div>
                      <h3 className="mt-2 text-[1.2rem] font-medium text-foreground">{step.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-muted">{step.summary}</p>
                    </article>
                    {index < trail.steps.length - 1 ? <div className="text-3xl text-accent">→</div> : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function MemoryWorkspace() {
  const [overview, setOverview] = useState<MemoryOverview | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [reviewingLinkKey, setReviewingLinkKey] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: StatusTone; message: string } | null>({
    tone: "default",
    message:
      "This page uses the same note base as Ask, but shows the broader memory structure: themes, drift, timeline, trails, and note-to-note links.",
  });

  useEffect(() => {
    void (async () => {
      try {
        const nextOverview = await getMemoryOverview();
        setOverview(nextOverview);
        setStatus({
          tone: "success",
          message: `Loaded ${nextOverview.total_notes} notes into the memory dashboard.`,
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

  const driftByTheme = useMemo(() => {
    const map = new Map<string, ThemeDrift["direction"]>();
    overview?.theme_drift.forEach((item) => {
      map.set(item.theme, item.direction);
    });
    return map;
  }, [overview]);

  const selectedThemeNodeIds = useMemo(() => {
    if (!overview || !selectedTheme) {
      return new Set<string>();
    }

    return new Set(
      overview.graph_nodes.filter((node) => node.primary_theme === selectedTheme).map((node) => node.note_id),
    );
  }, [overview, selectedTheme]);

  const filteredOverview = useMemo(() => {
    if (!overview || !selectedTheme) {
      return {
        themes: overview?.themes ?? [],
        themeDrift: overview?.theme_drift ?? [],
        timeline: overview?.timeline ?? [],
        suggestedLinks: overview?.suggested_links ?? [],
        outlierNotes: overview?.graph_nodes.filter((node) => node.degree === 0) ?? [],
        trails: overview?.memory_trails ?? [],
      };
    }

    const matchesSelectedNote = (noteId: string) => selectedThemeNodeIds.has(noteId);

    return {
      themes: overview.themes.filter((item) => item.theme === selectedTheme),
      themeDrift: overview.theme_drift.filter((item) => item.theme === selectedTheme),
      timeline: overview.timeline.filter((item) => matchesSelectedNote(item.note_id)),
      suggestedLinks: overview.suggested_links.filter(
        (item) =>
          item.shared_themes.includes(selectedTheme) ||
          matchesSelectedNote(item.source_note_id) ||
          matchesSelectedNote(item.target_note_id),
      ),
      outlierNotes: overview.graph_nodes.filter(
        (node) => node.degree === 0 && node.primary_theme === selectedTheme,
      ),
      trails: overview.memory_trails.filter(
        (trail) => trail.topic === selectedTheme || trail.steps.some((step) => matchesSelectedNote(step.note_id)),
      ),
    };
  }, [overview, selectedTheme, selectedThemeNodeIds]);

  const sidebarThemes = useMemo(
    () =>
      (overview?.themes ?? []).map((item) => ({
        theme: item.theme,
        noteCount: item.note_count,
        direction: driftByTheme.get(item.theme) ?? "stable",
      })),
    [driftByTheme, overview],
  );

  const graphSummary = useMemo(() => {
    if (!overview) {
      return "loading";
    }

    if (!selectedTheme) {
      return `${overview.graph_nodes.length} nodes`;
    }

    return `${selectedThemeNodeIds.size} theme nodes`;
  }, [overview, selectedTheme, selectedThemeNodeIds]);

  return (
    <main className="flex min-h-screen flex-1 bg-[#090d0c] text-[#e5e7e6]">
      <section className="flex w-full flex-col xl:grid xl:grid-cols-[28%_72%]">
        <div className="border-b border-[#1a2922] xl:border-b-0 xl:border-r">
          <MemorySidebar
            themes={sidebarThemes}
            totalNotes={overview?.total_notes ?? 0}
            totalConnections={overview?.graph_links.length ?? 0}
            lastUpdated={getLastUpdatedLabel(overview)}
            selectedTheme={selectedTheme}
            onSelectTheme={setSelectedTheme}
          />
        </div>

        <div className="overflow-y-auto px-6 py-8 sm:px-8 xl:px-10">
          {status?.tone === "error" ? (
            <div className="mb-6 rounded-2xl border border-rose-500/15 bg-rose-500/8 px-4 py-3 text-sm text-rose-100">
              {status.message}
            </div>
          ) : null}

          <MemorySection title="Memory Graph" summary={graphSummary} defaultExpanded>
            <MemoryGraph
              nodes={overview?.graph_nodes ?? []}
              links={overview?.graph_links ?? []}
              selectedTheme={selectedTheme}
            />
          </MemorySection>

          <MemorySection
            title="Theme Drift"
            summary={`${filteredOverview.themeDrift.length} themes`}
            defaultExpanded={Boolean(selectedTheme)}
          >
            <ThemeDriftPanel items={filteredOverview.themeDrift} />
          </MemorySection>

          <MemorySection title="Timeline" summary={`${filteredOverview.timeline.length} recent notes`}>
            <TimelinePanel events={filteredOverview.timeline} />
          </MemorySection>

          <MemorySection
            title="Suggested Connections"
            summary={`${filteredOverview.suggestedLinks.length} connections`}
          >
            <SuggestedConnectionsPanel
              links={filteredOverview.suggestedLinks}
              reviewingLinkKey={reviewingLinkKey}
              onReview={handleReviewLink}
            />
          </MemorySection>

          <MemorySection title="Outlier Notes" summary={`${filteredOverview.outlierNotes.length} isolated`}>
            <OutlierNotesPanel notes={filteredOverview.outlierNotes} onOpenTheme={setSelectedTheme} />
          </MemorySection>

          <MemorySection title="Memory Trails" summary={`${filteredOverview.trails.length} trails`}>
            <MemoryTrailsPanel trails={filteredOverview.trails} />
          </MemorySection>
        </div>
      </section>
    </main>
  );
}
