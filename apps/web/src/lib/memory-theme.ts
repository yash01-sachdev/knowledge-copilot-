type ThemeTone = {
  base: string;
  soft: string;
  border: string;
};

const THEME_TONES: ThemeTone[] = [
  { base: "#46d89a", soft: "rgba(70, 216, 154, 0.14)", border: "rgba(70, 216, 154, 0.34)" },
  { base: "#8b5cf6", soft: "rgba(139, 92, 246, 0.14)", border: "rgba(139, 92, 246, 0.34)" },
  { base: "#f3a11a", soft: "rgba(243, 161, 26, 0.14)", border: "rgba(243, 161, 26, 0.34)" },
  { base: "#22b8cf", soft: "rgba(34, 184, 207, 0.14)", border: "rgba(34, 184, 207, 0.34)" },
  { base: "#ef4fa6", soft: "rgba(239, 79, 166, 0.14)", border: "rgba(239, 79, 166, 0.34)" },
  { base: "#f97316", soft: "rgba(249, 115, 22, 0.14)", border: "rgba(249, 115, 22, 0.34)" },
  { base: "#60a5fa", soft: "rgba(96, 165, 250, 0.14)", border: "rgba(96, 165, 250, 0.34)" },
];

function hashTheme(theme: string): number {
  let hash = 0;

  for (const character of theme) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

export function getMemoryThemeTone(theme: string): ThemeTone {
  return THEME_TONES[hashTheme(theme) % THEME_TONES.length];
}
