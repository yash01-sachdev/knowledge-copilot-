"use client";

import { useState } from "react";
import type { ReactNode } from "react";

type MemorySectionProps = {
  title: string;
  summary: string;
  children: ReactNode;
  defaultExpanded?: boolean;
};

export function MemorySection({
  title,
  summary,
  children,
  defaultExpanded = false,
}: MemorySectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <section className="mb-8 last:mb-0">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center gap-3 text-left"
      >
        <span
          className={`inline-block text-[13px] text-muted transition-transform duration-200 ${
            expanded ? "rotate-90 text-foreground" : ""
          }`}
        >
          ›
        </span>
        <span className="mono text-[13px] uppercase tracking-[0.18em] text-muted">{title}</span>
        <span className="mono ml-auto text-[13px] uppercase tracking-[0.18em] text-muted/80">{summary}</span>
      </button>

      <div
        className="overflow-hidden transition-all duration-200 ease-in-out"
        style={{
          maxHeight: expanded ? "2400px" : "0",
          opacity: expanded ? 1 : 0,
        }}
      >
        <div className="mt-5">{children}</div>
      </div>
    </section>
  );
}
