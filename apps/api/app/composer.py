from __future__ import annotations

import re
from collections import Counter, OrderedDict, defaultdict
from dataclasses import dataclass, field
from datetime import date
from itertools import combinations

from .domain import SearchCandidate
from .phrases import extract_key_phrases
from .providers import AnswerGenerationRequest, AnswerProvider
from .schemas import Citation, NoteLink, QueryResponse, RecurringTheme, TimelineEvent
from .search import analyze_query
from .text_utils import (
    build_match_terms,
    clamp,
    confidence_label,
    extract_ranked_sentences,
    geometric_mean,
)


@dataclass(frozen=True, slots=True)
class EvidencePoint:
    candidate: SearchCandidate
    sentence: str


@dataclass(slots=True)
class NoteProfile:
    note_id: str
    title: str
    note_date: date
    score: float = 0.0
    excerpts: list[str] = field(default_factory=list)
    terms: list[str] = field(default_factory=list)
def compose_answer(
    question: str,
    candidates: list[SearchCandidate],
    *,
    answer_provider: AnswerProvider | None = None,
) -> QueryResponse:
    if not candidates:
        return QueryResponse(
            answer=(
                "I could not find enough grounded evidence in your notes yet. Add more notes or try a more specific question."
            ),
            why_selected="No note chunks passed retrieval for this question.",
            suggested_actions=[
                "Try narrowing the question to a topic, time range, or exact phrase you used in a note."
            ],
            citations=[],
            recurring_themes=[],
            timeline=[],
            note_links=[],
            confidence=0.12,
            confidence_label="low",
            insufficient_evidence=True,
        )

    query_terms = set(build_match_terms(question))
    profile = analyze_query(question)
    evidence = _build_evidence_points(candidates, query_terms)
    top_candidates = [item.candidate for item in evidence[: min(4, len(evidence))]]
    unique_titles = list(OrderedDict((candidate.note_id, candidate.title) for candidate in top_candidates).values())
    key_terms = extract_key_phrases(
        " ".join(
            [candidate.title for candidate in top_candidates]
            + [candidate.title for candidate in top_candidates]
            + [candidate.content for candidate in top_candidates]
        ),
        query_terms,
        limit=4,
    )
    note_profiles = _build_note_profiles(evidence, query_terms)
    recurring_themes = _build_recurring_themes(note_profiles)
    timeline = _build_timeline(note_profiles, recurring_themes)
    note_links = _build_note_links(note_profiles, recurring_themes)

    confidence = _score_confidence(top_candidates)
    strongest_candidate = top_candidates[0]
    has_single_strong_match = (
        len(top_candidates) == 1
        and (
            strongest_candidate.keyword_score >= 0.58
            or strongest_candidate.rerank_score >= 0.52
            or strongest_candidate.semantic_score >= 0.78
        )
    )
    insufficient = confidence < 0.42 or (len(top_candidates) < 2 and not has_single_strong_match)

    if profile.is_pattern_query:
        query_style = "pattern"
        lead = _pattern_answer(evidence, key_terms)
    elif profile.is_action_query:
        query_style = "action"
        lead = _action_answer(evidence, key_terms)
    else:
        query_style = "reflective"
        lead = _reflective_answer(evidence, key_terms)

    why_selected = (
        f"These notes were picked because they combine semantic similarity with direct phrase overlap, "
        f"cover {len(unique_titles)} distinct notes, and span dated evidence from "
        f"{top_candidates[-1].note_date.isoformat()} to {top_candidates[0].note_date.isoformat()}."
    )

    suggested_actions = _build_actions(evidence)
    citations = [
        Citation(
            chunk_id=point.candidate.chunk_id,
            note_id=point.candidate.note_id,
            title=point.candidate.title,
            note_date=point.candidate.note_date,
            excerpt=point.sentence,
            reason=point.candidate.reason,
            score=round(point.candidate.rerank_score, 3),
        )
        for point in evidence[: min(5, len(evidence))]
    ]

    answer = lead
    if insufficient:
        answer = (
            f"{lead} The support is still thin, so treat this as a starting point rather than a final conclusion."
        )
        return QueryResponse(
            answer=answer,
            why_selected=why_selected,
            suggested_actions=suggested_actions,
            citations=citations,
            recurring_themes=recurring_themes,
            timeline=timeline,
            note_links=note_links,
            confidence=round(confidence, 3),
            confidence_label=confidence_label(confidence),
            insufficient_evidence=insufficient,
        )

    if answer_provider is not None:
        try:
            generated = answer_provider.generate(
                AnswerGenerationRequest(
                    question=question,
                    query_style=query_style,
                    citations=citations,
                    recurring_themes=recurring_themes,
                    fallback_answer=answer,
                    fallback_why_selected=why_selected,
                    fallback_actions=suggested_actions,
                )
            )
            answer = generated.answer
            why_selected = generated.why_selected
            suggested_actions = generated.suggested_actions
        except Exception:
            pass

    return QueryResponse(
        answer=answer,
        why_selected=why_selected,
        suggested_actions=suggested_actions,
        citations=citations,
        recurring_themes=recurring_themes,
        timeline=timeline,
        note_links=note_links,
        confidence=round(confidence, 3),
        confidence_label=confidence_label(confidence),
        insufficient_evidence=insufficient,
    )


def _build_evidence_points(
    candidates: list[SearchCandidate], query_terms: set[str]
) -> list[EvidencePoint]:
    evidence: list[EvidencePoint] = []
    seen_note_ids: set[str] = set()
    for candidate in candidates:
        preferred_sentences = extract_ranked_sentences(candidate.content, query_terms, limit=1)
        sentence = preferred_sentences[0] if preferred_sentences else candidate.content[:220]
        evidence.append(EvidencePoint(candidate=candidate, sentence=sentence))
        seen_note_ids.add(candidate.note_id)
        if len(evidence) >= 5 and len(seen_note_ids) >= 3:
            break
    return evidence


def _pattern_answer(evidence: list[EvidencePoint], key_terms: list[str]) -> str:
    themes = ", ".join(key_terms[:3]) if key_terms else "a few recurring themes"
    strongest = evidence[0]
    supporting = evidence[1] if len(evidence) > 1 else evidence[0]
    return (
        f"Your notes repeatedly come back to {themes}. The clearest signal appears in "
        f"'{strongest.candidate.title}' ({strongest.candidate.note_date.isoformat()}), where you wrote: "
        f"\"{strongest.sentence}\" A supporting note from '{supporting.candidate.title}' "
        f"({supporting.candidate.note_date.isoformat()}) reinforces the same direction: "
        f"\"{supporting.sentence}\""
    )


def _action_answer(evidence: list[EvidencePoint], key_terms: list[str]) -> str:
    principles = _distill_action_principles(evidence)
    strongest = evidence[0]
    supporting = evidence[1] if len(evidence) > 1 else evidence[0]
    principle_line = " -> ".join(principles[:3]) if principles else "narrow the scope and act on one concrete step"

    return (
        f"Based on your notes, the way you win is to {principle_line}. "
        f"Your clearest note is '{strongest.candidate.title}' ({strongest.candidate.note_date.isoformat()}), "
        f"which says: \"{strongest.sentence}\" "
        f"A second note, '{supporting.candidate.title}' ({supporting.candidate.note_date.isoformat()}), "
        f"backs the same move: \"{supporting.sentence}\""
    )


def _reflective_answer(evidence: list[EvidencePoint], key_terms: list[str]) -> str:
    themes = ", ".join(key_terms[:3]) if key_terms else "the strongest matching evidence"
    strongest = evidence[0]
    supporting = evidence[1] if len(evidence) > 1 else evidence[0]
    return (
        f"Your notes most strongly point toward {themes}. The best matching note is "
        f"'{strongest.candidate.title}' ({strongest.candidate.note_date.isoformat()}), where you wrote: "
        f"\"{strongest.sentence}\" Another helpful note is '{supporting.candidate.title}' "
        f"({supporting.candidate.note_date.isoformat()}): \"{supporting.sentence}\""
    )


def _build_actions(evidence: list[EvidencePoint]) -> list[str]:
    actions: list[str] = []
    for point in evidence[:3]:
        action = _extract_action(point.sentence)
        if not action:
            action = (
                f"Review '{point.candidate.title}' from {point.candidate.note_date.isoformat()} and pull one action you still agree with."
            )
        actions.append(action)
    deduped = list(OrderedDict((action, action) for action in actions).values())
    return deduped[:3]


def _extract_action(sentence: str) -> str | None:
    cleaned = sentence.strip().strip('"')
    lowered = cleaned.lower()
    structured_markers = [
        "try",
        "start",
        "keep",
        "review",
        "focus",
        "return to",
        "pick",
        "choose",
        "stop",
        "avoid",
        "define",
        "finish",
    ]
    structured_pattern = re.compile(
        r"\b(i should|i need to|you should|the fix is to|what helped was)\s+"
        r"(try|start|keep|review|focus|return to|pick|choose|stop|avoid|define|finish)\b",
        re.IGNORECASE,
    )
    match = structured_pattern.search(cleaned)
    if match:
        return cleaned[match.start(2) :].strip()

    for marker in structured_markers:
        if lowered.startswith(marker + " "):
            return cleaned
    if cleaned and cleaned[0].isupper() and cleaned.split(" ", 1)[0].lower() in {
        "pick",
        "choose",
        "start",
        "stop",
        "focus",
        "review",
        "plan",
        "return",
        "finish",
    }:
        return cleaned
    if " helps " in lowered or " helped " in lowered:
        return f"Revisit this pattern: {cleaned}"
    return None


def _distill_action_principles(evidence: list[EvidencePoint]) -> list[str]:
    extracted = [
        _normalize_action_phrase(action)
        for action in (_extract_action(point.sentence) for point in evidence[:4])
        if action
    ]
    return list(OrderedDict((action, action) for action in extracted if action).values())


def _normalize_action_phrase(action: str) -> str:
    cleaned = action.strip().strip(".")
    lowered = cleaned.lower()
    if lowered.startswith("revisit this pattern: "):
        cleaned = cleaned.split(": ", 1)[1]
        lowered = cleaned.lower()

    replacements = [
        ("i should ", ""),
        ("i need to ", ""),
        ("you should ", ""),
        ("return ", "return "),
    ]
    for prefix, replacement in replacements:
        if lowered.startswith(prefix):
            cleaned = replacement + cleaned[len(prefix) :]
            break

    return cleaned[0].lower() + cleaned[1:] if cleaned else cleaned


def _score_confidence(candidates: list[SearchCandidate]) -> float:
    scores = [candidate.rerank_score for candidate in candidates[:3]]
    if not scores:
        return 0.12
    diversity = len({candidate.note_id for candidate in candidates[:3]}) / max(len(scores), 1)
    confidence = (0.65 * geometric_mean(scores)) + (0.35 * diversity)
    return clamp(confidence, 0.0, 0.96)


def _build_note_profiles(
    evidence: list[EvidencePoint], query_terms: set[str]
) -> list[NoteProfile]:
    profiles: OrderedDict[str, NoteProfile] = OrderedDict()
    for point in evidence:
        profile = profiles.get(point.candidate.note_id)
        if profile is None:
            profile = NoteProfile(
                note_id=point.candidate.note_id,
                title=point.candidate.title,
                note_date=point.candidate.note_date,
            )
            profiles[point.candidate.note_id] = profile

        profile.score = max(profile.score, point.candidate.rerank_score)
        if point.sentence not in profile.excerpts:
            profile.excerpts.append(point.sentence)
        profile.terms = _merge_unique(
            profile.terms,
            extract_key_phrases(
                f"{point.candidate.title} {point.sentence} {point.candidate.content}",
                query_terms,
                limit=8,
            ),
        )
    return list(profiles.values())


def _build_recurring_themes(note_profiles: list[NoteProfile]) -> list[RecurringTheme]:
    theme_notes: defaultdict[str, set[str]] = defaultdict(set)
    theme_titles: defaultdict[str, list[str]] = defaultdict(list)
    theme_counts: Counter[str] = Counter()

    for profile in note_profiles:
        for term in profile.terms[:6]:
            theme_notes[term].add(profile.note_id)
            theme_titles[term].append(profile.title)
            theme_counts[term] += 1

    sorted_terms = sorted(
        theme_counts,
        key=lambda term: (len(theme_notes[term]), theme_counts[term], term),
        reverse=True,
    )

    chosen_terms = [term for term in sorted_terms if len(theme_notes[term]) >= 2]
    if len(chosen_terms) < 3:
        for term in sorted_terms:
            if term not in chosen_terms:
                chosen_terms.append(term)
            if len(chosen_terms) >= 4:
                break

    themes: list[RecurringTheme] = []
    for term in chosen_terms[:4]:
        representative_notes = list(
            OrderedDict((title, title) for title in theme_titles[term]).values()
        )[:3]
        theme_name = term.replace("_", " ").title()
        note_count = len(theme_notes[term])
        evidence_count = theme_counts[term]

        if len(representative_notes) >= 2:
            note_example = f"{representative_notes[0]} and {representative_notes[1]}"
        else:
            note_example = representative_notes[0]

        summary = (
            f"{theme_name} shows up across {note_count} note"
            f"{'' if note_count == 1 else 's'}, especially in {note_example}."
        )
        themes.append(
            RecurringTheme(
                theme=theme_name,
                note_count=note_count,
                evidence_count=evidence_count,
                summary=summary,
                representative_notes=representative_notes,
            )
        )
    return themes


def _build_timeline(
    note_profiles: list[NoteProfile], recurring_themes: list[RecurringTheme]
) -> list[TimelineEvent]:
    recurring_lookup = {theme.theme.lower() for theme in recurring_themes}
    timeline: list[TimelineEvent] = []
    for profile in sorted(note_profiles, key=lambda item: (item.note_date, -item.score)):
        linked_themes = [
            term.replace("_", " ").title()
            for term in profile.terms
            if term in recurring_lookup
        ][:2]
        summary = profile.excerpts[0]
        if linked_themes:
            summary = f"{summary} Linked themes: {', '.join(linked_themes)}."

        timeline.append(
            TimelineEvent(
                note_id=profile.note_id,
                title=profile.title,
                note_date=profile.note_date,
                summary=summary,
                score=round(profile.score, 3),
            )
        )
    return timeline[:5]


def _build_note_links(
    note_profiles: list[NoteProfile], recurring_themes: list[RecurringTheme]
) -> list[NoteLink]:
    recurring_lookup = {theme.theme.lower() for theme in recurring_themes}
    links: list[NoteLink] = []

    for left, right in combinations(note_profiles, 2):
        left_terms = set(left.terms)
        right_terms = set(right.terms)
        shared_raw = [
            term for term in left.terms if term in right_terms and (term in recurring_lookup or len(term) >= 5)
        ]
        shared_themes = _merge_unique(
            [],
            [term.replace("_", " ").title() for term in shared_raw],
        )[:3]
        if not shared_themes:
            continue

        time_gap_days = abs((left.note_date - right.note_date).days)
        temporal_closeness = 1.0 / (1.0 + (time_gap_days / 45.0))
        overlap_ratio = len(shared_themes) / max(len(left_terms | right_terms), 1)
        strength = clamp(
            (0.4 * overlap_ratio)
            + (0.35 * ((left.score + right.score) / 2.0))
            + (0.25 * temporal_closeness),
            0.0,
            0.98,
        )

        source, target = sorted([left, right], key=lambda item: item.note_date)
        rationale = (
            f"These notes connect around {', '.join(shared_themes[:2])} and reinforce each other "
            f"from {source.note_date.isoformat()} to {target.note_date.isoformat()}."
        )
        links.append(
            NoteLink(
                source_note_id=source.note_id,
                source_title=source.title,
                source_date=source.note_date,
                target_note_id=target.note_id,
                target_title=target.title,
                target_date=target.note_date,
                shared_themes=shared_themes,
                rationale=rationale,
                strength=round(strength, 3),
            )
        )

    links.sort(key=lambda item: item.strength, reverse=True)
    return links[:3]


def _merge_unique(existing: list[str], incoming: list[str]) -> list[str]:
    return list(OrderedDict((item, item) for item in [*existing, *incoming]).values())
