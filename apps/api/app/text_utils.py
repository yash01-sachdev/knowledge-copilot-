from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass


STOPWORDS = {
    "a",
    "about",
    "after",
    "again",
    "all",
    "am",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "because",
    "been",
    "before",
    "being",
    "between",
    "both",
    "but",
    "by",
    "can",
    "could",
    "did",
    "do",
    "does",
    "doing",
    "down",
    "during",
    "each",
    "few",
    "for",
    "from",
    "further",
    "had",
    "has",
    "have",
    "having",
    "he",
    "her",
    "here",
    "hers",
    "herself",
    "him",
    "himself",
    "his",
    "how",
    "i",
    "if",
    "in",
    "into",
    "is",
    "it",
    "its",
    "itself",
    "just",
    "me",
    "more",
    "most",
    "my",
    "myself",
    "no",
    "nor",
    "not",
    "now",
    "of",
    "off",
    "on",
    "once",
    "only",
    "or",
    "other",
    "our",
    "ours",
    "ourselves",
    "out",
    "over",
    "own",
    "same",
    "she",
    "should",
    "so",
    "some",
    "such",
    "than",
    "that",
    "the",
    "their",
    "theirs",
    "them",
    "themselves",
    "then",
    "there",
    "these",
    "they",
    "this",
    "those",
    "through",
    "to",
    "too",
    "under",
    "until",
    "up",
    "very",
    "was",
    "we",
    "were",
    "what",
    "when",
    "where",
    "which",
    "while",
    "who",
    "why",
    "will",
    "with",
    "you",
    "your",
    "yours",
    "yourself",
    "yourselves",
    "note",
    "notes",
    "plan",
    "say",
    "says",
    "said",
    "thing",
    "things",
    "thought",
    "thoughts",
    "write",
    "writes",
    "writing",
    "wrote",
}

THEME_STOPWORDS = {
    "back",
    "better",
    "feel",
    "felt",
    "focus",
    "help",
    "helped",
    "helps",
    "keep",
    "notes",
    "note",
    "project",
    "really",
    "return",
    "stuck",
    "today",
    "using",
    "write",
    "wrote",
}


@dataclass(slots=True)
class ChunkDraft:
    content: str
    chunk_index: int
    start_char: int
    end_char: int


def normalize_whitespace(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def tokenize(text: str) -> list[str]:
    return [token for token in re.findall(r"[a-zA-Z0-9']+", text.lower()) if len(token) > 1]


def build_match_terms(text: str) -> list[str]:
    return [token for token in tokenize(text) if token not in STOPWORDS]


def extract_theme_terms(text: str, exclude_terms: set[str] | None = None) -> list[str]:
    blocked_terms = exclude_terms or set()
    terms: list[str] = []
    seen: set[str] = set()
    for token in build_match_terms(text):
        if (
            len(token) <= 3
            or token in blocked_terms
            or token in STOPWORDS
            or token in THEME_STOPWORDS
            or token in seen
        ):
            continue
        terms.append(token)
        seen.add(token)
    return terms


def chunk_text(text: str, target_words: int = 120, overlap_words: int = 28) -> list[ChunkDraft]:
    cleaned = normalize_whitespace(text)
    if not cleaned:
        return []

    words = re.findall(r"\S+", cleaned)
    if len(words) <= target_words:
        return [ChunkDraft(content=cleaned, chunk_index=0, start_char=0, end_char=len(cleaned))]

    chunks: list[ChunkDraft] = []
    start_word = 0
    word_spans = [match.span() for match in re.finditer(r"\S+", cleaned)]

    while start_word < len(word_spans):
        end_word = min(start_word + target_words, len(word_spans))
        start_char = word_spans[start_word][0]
        end_char = word_spans[end_word - 1][1]
        chunk = cleaned[start_char:end_char].strip()
        chunks.append(
            ChunkDraft(
                content=chunk,
                chunk_index=len(chunks),
                start_char=start_char,
                end_char=end_char,
            )
        )
        if end_word == len(word_spans):
            break
        start_word = max(0, end_word - overlap_words)

    return chunks


def split_sentences(text: str) -> list[str]:
    cleaned = normalize_whitespace(text)
    if not cleaned:
        return []
    raw_sentences = re.split(r"(?<=[.!?])\s+|\n", cleaned)
    return [sentence.strip() for sentence in raw_sentences if sentence.strip()]


def extract_ranked_sentences(text: str, query_terms: set[str], limit: int = 2) -> list[str]:
    ranked: list[tuple[float, str]] = []
    for index, sentence in enumerate(split_sentences(text)):
        sentence_terms = set(build_match_terms(sentence))
        overlap = len(sentence_terms & query_terms)
        density = overlap / max(len(sentence_terms), 1)
        lead_bonus = max(0.0, 0.2 - (index * 0.04))
        score = overlap + density + lead_bonus
        if score > 0:
            ranked.append((score, sentence))
    if not ranked:
        return split_sentences(text)[:limit]
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [sentence for _, sentence in ranked[:limit]]


def top_keywords(texts: list[str], exclude_terms: set[str], limit: int = 5) -> list[str]:
    counter = Counter()
    for text in texts:
        counter.update(extract_theme_terms(text, exclude_terms))
    return [word for word, _ in counter.most_common(limit)]


def confidence_label(score: float) -> str:
    if score >= 0.74:
        return "high"
    if score >= 0.48:
        return "medium"
    return "low"


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def geometric_mean(values: list[float]) -> float:
    non_zero = [value for value in values if value > 0]
    if not non_zero:
        return 0.0
    log_total = sum(math.log(value) for value in non_zero)
    return math.exp(log_total / len(non_zero))
