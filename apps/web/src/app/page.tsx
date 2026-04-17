import Link from "next/link";

export default function Home() {
  return (
    <main className="page-frame flex flex-1 flex-col gap-5">
      <section className="subtle-grid panel relative overflow-hidden rounded-[34px] px-6 py-8 sm:px-8 lg:px-10 lg:py-10">
        <div className="pointer-events-none absolute -right-12 top-12 h-56 w-56 rounded-full bg-accent-soft blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-0 h-44 w-44 rounded-full bg-warm-soft blur-3xl" />

        <div className="relative grid gap-8 xl:grid-cols-[1.12fr_0.88fr] xl:items-end">
          <div className="max-w-4xl">
            <div className="kicker mb-5 inline-flex rounded-full border border-accent/25 bg-black/10 px-4 py-1.5">
              Personal note operating system
            </div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-foreground sm:text-6xl">
              Turn scattered thoughts into a calm, queryable memory system.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-muted sm:text-lg">
              Write in a notes-first workspace, sync markdown from your phone, and ask for answers
              that stay tied to dated evidence instead of sounding like guesswork.
            </p>

            <div className="mt-8 flex flex-wrap gap-3 text-sm text-muted">
              <span className="rounded-full border border-white/8 bg-white/[0.03] px-4 py-2">
                grounded answers with citations
              </span>
              <span className="rounded-full border border-white/8 bg-white/[0.03] px-4 py-2">
                phone-friendly folder sync
              </span>
              <span className="rounded-full border border-white/8 bg-white/[0.03] px-4 py-2">
                memory graph, timeline, recurring themes
              </span>
            </div>
          </div>

          <div className="grid gap-4">
            <Link
              href="/write"
              prefetch={false}
              className="panel-soft group rounded-[28px] p-6 transition hover:-translate-y-0.5 hover:border-accent/30 hover:bg-white/[0.04]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="kicker">Write notes</div>
                  <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
                    Open the workspace
                  </h2>
                </div>
                <span className="rounded-full border border-accent/20 bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
                  Daily use
                </span>
              </div>
              <p className="mt-3 max-w-xl text-sm leading-7 text-muted">
                A focused notes app layout with a proper library, editor, import flow, and sync
                path for notes mirrored from your phone.
              </p>
              <div className="mt-5 text-sm font-semibold text-foreground transition group-hover:text-accent">
                Go to writer
              </div>
            </Link>

            <Link
              href="/ask"
              prefetch={false}
              className="panel-soft group rounded-[28px] p-6 transition hover:-translate-y-0.5 hover:border-warm/35 hover:bg-white/[0.04]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="kicker">Get answers</div>
                  <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
                    Query your note base
                  </h2>
                </div>
                <span className="rounded-full border border-warm/20 bg-warm-soft px-3 py-1 text-xs font-semibold text-warm">
                  Retrieval first
                </span>
              </div>
              <p className="mt-3 max-w-xl text-sm leading-7 text-muted">
                Ask one sharp question at a time and see the ranked evidence, citations, and memory
                context behind the answer.
              </p>
              <div className="mt-5 text-sm font-semibold text-foreground transition group-hover:text-warm">
                Go to answers
              </div>
            </Link>
          </div>
        </div>

        <div className="warm-rule mt-8" />

        <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-muted">
          <Link href="/memory" prefetch={false} className="text-accent transition hover:text-foreground">
            Open memory view
          </Link>
          <span className="hidden text-border sm:inline">/</span>
          <span>Built for journal entries, study notes, project logs, and synced markdown folders.</span>
        </div>
      </section>
    </main>
  );
}
