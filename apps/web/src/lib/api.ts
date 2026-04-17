import type {
  MemoryOverview,
  NoteDetail,
  NoteDraft,
  NoteSummary,
  QueryResponse,
} from "@/lib/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

const DEFAULT_TTL_MS = 15_000;
const NOTE_TTL_MS = 45_000;

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const responseCache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<unknown>>();

type ApiFetchOptions = {
  cacheKey?: string;
  ttlMs?: number;
  skipCache?: boolean;
};

function now(): number {
  return Date.now();
}

function readCache<T>(cacheKey?: string): T | null {
  if (!cacheKey) {
    return null;
  }

  const entry = responseCache.get(cacheKey);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= now()) {
    responseCache.delete(cacheKey);
    return null;
  }

  return entry.value as T;
}

function writeCache(cacheKey: string | undefined, value: unknown, ttlMs: number): void {
  if (!cacheKey) {
    return;
  }

  responseCache.set(cacheKey, {
    expiresAt: now() + ttlMs,
    value,
  });
}

function invalidateCache(prefixes: string[]): void {
  if (prefixes.length === 0) {
    return;
  }

  for (const cacheKey of [...responseCache.keys()]) {
    if (prefixes.some((prefix) => cacheKey.startsWith(prefix))) {
      responseCache.delete(cacheKey);
    }
  }

  for (const cacheKey of [...pendingRequests.keys()]) {
    if (prefixes.some((prefix) => cacheKey.startsWith(prefix))) {
      pendingRequests.delete(cacheKey);
    }
  }
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  options?: ApiFetchOptions,
): Promise<T> {
  const requestMethod = init?.method ?? "GET";
  const cacheKey =
    requestMethod === "GET" && !options?.skipCache ? options?.cacheKey ?? path : undefined;
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;

  const cached = readCache<T>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  const pending = cacheKey ? pendingRequests.get(cacheKey) : undefined;
  if (pending) {
    return pending as Promise<T>;
  }

  const request = fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  }).then(async (response) => {
    if (!response.ok) {
      let message = "Something went wrong while talking to the API.";
      try {
        const payload = (await response.json()) as { detail?: string };
        if (payload.detail) {
          message = payload.detail;
        }
      } catch {
        message = `${message} (${response.status})`;
      }
      throw new Error(message);
    }

    const payload = (await response.json()) as T;
    writeCache(cacheKey, payload, ttlMs);
    return payload;
  });

  if (cacheKey) {
    pendingRequests.set(cacheKey, request);
  }

  try {
    return await request;
  } finally {
    if (cacheKey) {
      pendingRequests.delete(cacheKey);
    }
  }
}

export async function listNotes(options?: { skipCache?: boolean }): Promise<NoteSummary[]> {
  return apiFetch<NoteSummary[]>("/api/notes", undefined, {
    cacheKey: "/api/notes",
    ttlMs: DEFAULT_TTL_MS,
    skipCache: options?.skipCache,
  });
}

export async function createNote(draft: NoteDraft): Promise<NoteSummary> {
  const created = await apiFetch<NoteSummary>("/api/notes", {
    method: "POST",
    body: JSON.stringify({
      title: draft.title,
      content: draft.content,
      note_date: draft.noteDate,
      source_name: draft.sourceName ?? null,
    }),
  });

  invalidateCache(["/api/notes", "/api/memory/overview"]);
  return created;
}

export async function getNote(noteId: string, options?: { skipCache?: boolean }): Promise<NoteDetail> {
  return apiFetch<NoteDetail>(`/api/notes/${noteId}`, undefined, {
    cacheKey: `/api/notes/${noteId}`,
    ttlMs: NOTE_TTL_MS,
    skipCache: options?.skipCache,
  });
}

export async function updateNote(noteId: string, draft: NoteDraft): Promise<NoteDetail> {
  const updated = await apiFetch<NoteDetail>(`/api/notes/${noteId}`, {
    method: "PUT",
    body: JSON.stringify({
      title: draft.title,
      content: draft.content,
      note_date: draft.noteDate,
      source_name: draft.sourceName ?? null,
    }),
  });

  invalidateCache(["/api/notes", `/api/notes/${noteId}`, "/api/memory/overview"]);
  return updated;
}

export async function deleteNote(noteId: string): Promise<NoteDetail> {
  const deleted = await apiFetch<NoteDetail>(`/api/notes/${noteId}`, {
    method: "DELETE",
  });

  invalidateCache(["/api/notes", `/api/notes/${noteId}`, "/api/memory/overview"]);
  return deleted;
}

export async function askQuestion(question: string): Promise<QueryResponse> {
  return apiFetch<QueryResponse>("/api/query", {
    method: "POST",
    body: JSON.stringify({ question, top_k: 5 }),
  });
}

export async function submitFeedback(payload: {
  question: string;
  answer: string;
  useful: boolean;
}): Promise<void> {
  await apiFetch<{ status: string }>("/api/feedback", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function loadDemoNotes(): Promise<{ loaded_notes: number; total_notes: number }> {
  const result = await apiFetch<{ loaded_notes: number; total_notes: number }>("/api/demo/load", {
    method: "POST",
    body: JSON.stringify({}),
  });

  invalidateCache(["/api/notes", "/api/memory/overview"]);
  return result;
}

export async function syncFolder(folderPath: string): Promise<{
  imported_notes: number;
  updated_notes: number;
  total_notes: number;
}> {
  const result = await apiFetch<{
    imported_notes: number;
    updated_notes: number;
    total_notes: number;
  }>("/api/sync/folder", {
    method: "POST",
    body: JSON.stringify({ folder_path: folderPath }),
  });

  invalidateCache(["/api/notes", "/api/memory/overview"]);
  return result;
}

export async function getMemoryOverview(options?: { skipCache?: boolean }): Promise<MemoryOverview> {
  return apiFetch<MemoryOverview>("/api/memory/overview", undefined, {
    cacheKey: "/api/memory/overview",
    ttlMs: DEFAULT_TTL_MS,
    skipCache: options?.skipCache,
  });
}

export async function reviewMemoryLink(payload: {
  source_note_id: string;
  target_note_id: string;
  decision: "accepted" | "rejected";
}): Promise<MemoryOverview> {
  const result = await apiFetch<MemoryOverview>("/api/memory/link-feedback", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  invalidateCache(["/api/memory/overview"]);
  return result;
}
