type DateStyle = "short" | "full";

function buildDateOptions(style: DateStyle): Intl.DateTimeFormatOptions {
  if (style === "full") {
    return {
      year: "numeric",
      month: "short",
      day: "numeric",
    };
  }

  return {
    month: "short",
    day: "numeric",
  };
}

export function formatDate(value: string, style: DateStyle = "full"): string {
  return new Date(value).toLocaleDateString(undefined, buildDateOptions(style));
}

export function formatProviderLabel(value: string): string {
  return value
    .split(":")
    .map((part) => part.replace(/[-_]/g, " "))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ");
}

export function formatLatency(value: number): string {
  if (value < 1) {
    return "<1 ms";
  }
  return `${Math.round(value)} ms`;
}

export function shortenLabel(value: string, limit = 22): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}...`;
}
