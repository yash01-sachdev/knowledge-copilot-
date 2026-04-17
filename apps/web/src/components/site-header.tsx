"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/write", label: "Write" },
  { href: "/ask", label: "Ask" },
  { href: "/memory", label: "Memory" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 mb-4 pt-4">
      <div className="panel relative overflow-hidden rounded-[30px] px-4 py-4 sm:px-5">
        <div className="pointer-events-none absolute inset-y-0 left-[22%] hidden w-px bg-gradient-to-b from-transparent via-white/10 to-transparent xl:block" />
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <Link href="/" prefetch={false} className="flex items-center gap-4">
            <span className="mono flex h-12 w-12 items-center justify-center rounded-2xl border border-accent/30 bg-[linear-gradient(135deg,rgba(131,225,197,0.18),rgba(242,176,107,0.12))] text-sm font-semibold uppercase tracking-[0.24em] text-accent shadow-[0_14px_30px_rgba(86,200,167,0.12)]">
              KC
            </span>
            <div>
              <div className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
                Knowledge Copilot
              </div>
              <div className="text-xs uppercase tracking-[0.18em] text-muted">
                private note memory system
              </div>
            </div>
          </Link>

          <div className="hidden flex-1 items-center justify-center px-8 xl:flex">
            <div className="rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 text-center text-xs uppercase tracking-[0.18em] text-muted">
              Write fast. Ask carefully. Keep every answer grounded in dated notes.
            </div>
          </div>

          <nav className="flex items-center gap-2 rounded-[22px] border border-white/8 bg-black/10 p-1.5 backdrop-blur">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
                    active
                      ? "bg-[linear-gradient(135deg,rgba(131,225,197,0.18),rgba(242,176,107,0.12))] text-foreground shadow-[inset_0_0_0_1px_rgba(131,225,197,0.18)]"
                      : "text-muted hover:bg-white/5 hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="pointer-events-none absolute inset-x-10 bottom-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
    </header>
  );
}
