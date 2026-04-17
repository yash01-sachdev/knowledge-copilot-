import type { NoteDraft } from "@/lib/types";

function toTitleCase(value: string): string {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function findDate(input: string): string | null {
  const match = input.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return match?.[1] ?? null;
}

export function inferImportedNote(fileName: string, content: string): NoteDraft {
  const trimmedContent = content.trim();
  const headingMatch = trimmedContent.match(/^#\s+(.+)$/m);
  const title = headingMatch?.[1]?.trim() || toTitleCase(fileName);
  const noteDate = findDate(fileName) || findDate(trimmedContent) || new Date().toISOString().slice(0, 10);

  return {
    title,
    content: trimmedContent,
    noteDate,
    sourceName: fileName,
  };
}
