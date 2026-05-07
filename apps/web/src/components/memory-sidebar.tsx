"use client";

import { getMemoryThemeTone } from "@/lib/memory-theme";

type SidebarTheme = {
  theme: string;
  noteCount: number;
  direction: "up" | "down" | "stable";
};

type MemorySidebarProps = {
  themes: SidebarTheme[];
  totalNotes: number;
  totalConnections: number;
  lastUpdated: string;
  selectedTheme: string | null;
  onSelectTheme: (theme: string | null) => void;
};

export function MemorySidebar({
  themes,
  totalNotes,
  totalConnections,
  lastUpdated,
  selectedTheme,
  onSelectTheme,
}: MemorySidebarProps) {
  return (
    <aside className="sticky top-0 h-[100dvh] overflow-y-auto bg-[rgba(8,14,12,0.96)] px-7 py-8">
      <div>
        <h1 className="text-[2.45rem] font-semibold tracking-[-0.05em] text-foreground">Knowledge Copilot</h1>
        <p className="mt-3 text-[1.18rem] text-muted">Your memory dashboard</p>
      </div>

      <section className="mt-12">
        <div className="kicker text-[0.9rem] text-muted">Recurring themes</div>
        <div className="mt-5 flex flex-wrap gap-3">
          {themes.map((item) => {
            const tone = getMemoryThemeTone(item.theme);
            const isSelected = selectedTheme === item.theme;
            const isRising = item.direction === "up";

            return (
              <button
                key={item.theme}
                type="button"
                onClick={() => onSelectTheme(isSelected ? null : item.theme)}
                className="inline-flex items-center gap-2 rounded-full border px-4 py-2 transition"
                style={{
                  borderColor: isSelected ? tone.border : "rgba(26, 41, 34, 0.95)",
                  backgroundColor: isSelected ? tone.soft : "rgba(17, 24, 22, 0.92)",
                }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tone.base }} />
                <span className="text-[1.14rem] font-medium text-foreground">{item.theme}</span>
                <span className="rounded-full bg-[#1a2922] px-2 py-0.5 text-[0.95rem] text-muted">
                  {item.noteCount}
                </span>
                {isRising ? <span className="text-[0.95rem] font-semibold" style={{ color: tone.base }}>↗</span> : null}
              </button>
            );
          })}
        </div>
      </section>

      <div className="mt-12 border-t border-[#1a2922] pt-8 text-[1.08rem] text-muted">
        <div className="flex items-center justify-between py-1.5">
          <span>Total Notes</span>
          <span className="font-medium text-[1.14rem] text-foreground">{totalNotes}</span>
        </div>
        <div className="flex items-center justify-between py-1.5">
          <span>Connections</span>
          <span className="font-medium text-[1.14rem] text-foreground">{totalConnections}</span>
        </div>
        <div className="flex items-center justify-between py-1.5">
          <span>Last Updated</span>
          <span className="font-medium text-[1.14rem] text-accent">{lastUpdated}</span>
        </div>
      </div>
    </aside>
  );
}
