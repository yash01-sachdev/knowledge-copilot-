import Link from "next/link";

const landingCards = [
  {
    href: "/write",
    label: "WRITE",
    title: "Open workspace",
    chip: "Daily use",
    color: "blue",
  },
  {
    href: "/ask",
    label: "ASK",
    title: "Query your notes",
    chip: "Retrieval first",
    color: "purple",
  },
  {
    href: "/memory",
    label: "MEMORY",
    title: "Explore long view",
    chip: "Graph + timeline",
    color: "emerald",
  },
] as const;

const colorClasses = {
  blue: {
    bar: "bg-blue-500",
    hover: "hover:border-blue-500/30",
    chip: "border-blue-500/20 bg-blue-500/10 text-blue-400",
  },
  purple: {
    bar: "bg-purple-500",
    hover: "hover:border-purple-500/30",
    chip: "border-purple-500/20 bg-purple-500/10 text-purple-400",
  },
  emerald: {
    bar: "bg-emerald-500",
    hover: "hover:border-emerald-500/30",
    chip: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  },
} as const;

export default function Home() {
  return (
    <main className="relative z-10 min-h-screen overflow-hidden bg-[#090d0c] text-white">
      <div className="mx-auto grid min-h-screen max-w-[1400px] grid-cols-1 items-center gap-12 px-6 py-12 sm:px-10 lg:grid-cols-2 lg:gap-16 lg:px-20 lg:py-16">
        <section className="space-y-8">
          <div className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-3 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
              PERSONAL NOTE OS
            </span>
          </div>

          <h1 className="max-w-[680px] text-[42px] font-bold leading-tight text-white sm:text-[48px]">
            Turn scattered thoughts into a calm, queryable memory system.
          </h1>

          <p className="max-w-[660px] text-[16px] leading-7 text-white/70">
            Write fast. Ask carefully. Every answer stays grounded in your notes.
          </p>

          <Link
            href="/write"
            prefetch={false}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-emerald-600 px-8 font-medium text-white transition-colors hover:bg-emerald-500"
          >
            Start writing
            <span className="text-2xl leading-none" aria-hidden="true">
              &rarr;
            </span>
          </Link>
        </section>

        <section className="space-y-3">
          {landingCards.map((card) => {
            const classes = colorClasses[card.color];

            return (
              <Link
                key={card.href}
                href={card.href}
                prefetch={false}
                className={`group relative block overflow-hidden rounded-lg border border-[#1e2d28] bg-[#111816] p-6 transition-colors ${classes.hover}`}
              >
                <div className={`absolute bottom-0 left-0 top-0 w-1 ${classes.bar}`} />
                <div className="flex items-center justify-between gap-5">
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                      {card.label}
                    </div>
                    <div className="text-[18px] font-bold leading-tight text-white">{card.title}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${classes.chip}`}
                    >
                      {card.chip}
                    </span>
                    <span
                      className="text-3xl leading-none text-white/40 transition-all group-hover:translate-x-0.5 group-hover:text-white"
                      aria-hidden="true"
                    >
                      &rarr;
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}
