from __future__ import annotations

from collections import Counter, defaultdict
import re

from .text_utils import STOPWORDS, THEME_STOPWORDS


WORD_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9']+")


def extract_key_phrases(
    text: str,
    exclude_terms: set[str] | None = None,
    *,
    limit: int = 8,
    max_words: int = 3,
) -> list[str]:
    blocked = exclude_terms or set()
    tokens = [token.lower() for token in WORD_RE.findall(text)]
    scores: Counter[str] = Counter()

    for window_size in range(1, max_words + 1):
        for index in range(0, len(tokens) - window_size + 1):
            window = tokens[index : index + window_size]
            if not _is_valid_phrase_window(window, blocked):
                continue
            phrase = " ".join(window)
            scores[phrase] += _window_weight(window_size)

    ranked = sorted(scores.items(), key=lambda item: (item[1], len(item[0].split())), reverse=True)
    chosen: list[str] = []
    for phrase, _score in ranked:
        if any(_is_subphrase(phrase, existing) for existing in chosen):
            continue
        chosen.append(phrase)
        if len(chosen) >= limit:
            break
    return chosen


def summarize_phrase_clusters(
    phrase_map: dict[str, list[str]],
    *,
    limit: int = 6,
) -> list[tuple[str, list[str], int]]:
    note_sets: defaultdict[str, set[str]] = defaultdict(set)
    for note_id, phrases in phrase_map.items():
        for phrase in phrases:
            note_sets[phrase].add(note_id)

    ranked = sorted(
        note_sets.items(),
        key=lambda item: (len(item[1]), len(item[0].split()), item[0]),
        reverse=True,
    )
    return [(phrase, list(note_ids), len(note_ids)) for phrase, note_ids in ranked[:limit]]


def _is_valid_phrase_window(window: list[str], blocked: set[str]) -> bool:
    if not window:
        return False

    for token in window:
        if (
            token in blocked
            or token in STOPWORDS
            or token in THEME_STOPWORDS
            or len(token) < 3
        ):
            return False

    if len(window) == 1 and len(window[0]) < 5:
        return False

    return True


def _window_weight(size: int) -> float:
    if size == 1:
        return 1.0
    if size == 2:
        return 2.6
    return 3.2


def _is_subphrase(candidate: str, existing: str) -> bool:
    return candidate != existing and candidate in existing
