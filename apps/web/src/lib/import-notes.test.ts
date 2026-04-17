import { describe, expect, it } from "vitest";

import { inferImportedNote } from "@/lib/import-notes";

describe("inferImportedNote", () => {
  it("prefers markdown headings and file dates when available", () => {
    const note = inferImportedNote(
      "2026-04-12-interview-reset.md",
      "# Interview reset\n\nFocus on one project story.",
    );

    expect(note.title).toBe("Interview reset");
    expect(note.noteDate).toBe("2026-04-12");
    expect(note.sourceName).toBe("2026-04-12-interview-reset.md");
  });

  it("falls back to a cleaned filename when no heading exists", () => {
    const note = inferImportedNote("energy_patterns.txt", "Morning walk helped.");

    expect(note.title).toBe("Energy Patterns");
    expect(note.content).toBe("Morning walk helped.");
  });
});
