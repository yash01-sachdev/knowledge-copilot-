from __future__ import annotations

from collections import Counter, OrderedDict, defaultdict
from dataclasses import dataclass
from itertools import combinations

import numpy as np
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from .domain import NoteRecord
from .phrases import extract_key_phrases
from .schemas import (
    MemoryGraphNode,
    MemoryOverviewResponse,
    MemoryTrail,
    MemoryTrailStep,
    NoteLink,
    RecurringTheme,
    ThemeDrift,
    TimelineEvent,
)
from .text_utils import clamp, split_sentences

MAX_GRAPH_LINKS = 42
MAX_GRAPH_NODES = 30
MIN_SEMANTIC_LINK_SCORE = 0.14
MIN_SEMANTIC_LINK_WITHOUT_SHARED_PHRASES = 0.22


@dataclass(frozen=True, slots=True)
class MemoryBuildResult:
    overview: MemoryOverviewResponse
    link_rows: list[dict[str, object]]


def build_memory_overview(
    notes: list[NoteRecord],
    link_feedback: dict[tuple[str, str], str] | None = None,
) -> MemoryBuildResult:
    if not notes:
        overview = MemoryOverviewResponse(total_notes=0)
        return MemoryBuildResult(overview=overview, link_rows=[])

    normalized_feedback = link_feedback or {}
    phrase_map = {
        note.id: extract_key_phrases(f"{note.title}. {note.title}. {note.content}", limit=10)
        for note in notes
    }
    similarity_map = _build_note_similarity(notes)
    candidate_links = _build_link_candidates(notes, phrase_map, similarity_map)
    graph_links = _select_graph_links(candidate_links, normalized_feedback)
    suggested_links = _build_suggested_links(candidate_links, graph_links, normalized_feedback)
    themes = _build_themes(notes, phrase_map)
    theme_drift = _build_theme_drift(notes, phrase_map, themes)
    timeline = _build_timeline(notes, phrase_map)
    graph_nodes = _build_nodes(notes, phrase_map, graph_links)
    memory_trails = _build_memory_trails(notes, phrase_map, themes)

    overview = MemoryOverviewResponse(
        total_notes=len(notes),
        themes=themes,
        theme_drift=theme_drift,
        timeline=timeline,
        suggested_links=suggested_links,
        memory_trails=memory_trails,
        graph_nodes=graph_nodes,
        graph_links=graph_links,
    )
    return MemoryBuildResult(
        overview=overview,
        link_rows=[
            {
                "source_note_id": link.source_note_id,
                "target_note_id": link.target_note_id,
                "strength": link.strength,
                "shared_themes": link.shared_themes,
                "rationale": link.rationale,
            }
            for link in graph_links
        ],
    )


def _build_note_similarity(notes: list[NoteRecord]) -> dict[tuple[str, str], float]:
    if len(notes) < 2:
        return {}

    vectorizer = TfidfVectorizer(
        stop_words="english",
        ngram_range=(1, 3),
        max_features=18_000,
        sublinear_tf=True,
    )
    corpus = [f"{note.title}\n{note.content}" for note in notes]
    sparse = vectorizer.fit_transform(corpus)

    if sparse.shape[0] >= 3 and sparse.shape[1] >= 3:
        components = min(96, sparse.shape[0] - 1, sparse.shape[1] - 1)
        if components >= 2:
            reducer = TruncatedSVD(n_components=components, random_state=42)
            dense = reducer.fit_transform(sparse)
        else:
            dense = sparse.toarray()
    else:
        dense = sparse.toarray()

    matrix = normalize(np.asarray(dense))
    scores: dict[tuple[str, str], float] = {}
    for left_index, right_index in combinations(range(len(notes)), 2):
        cosine = float(np.dot(matrix[left_index], matrix[right_index]))
        normalized_similarity = clamp(cosine, 0.0, 1.0)
        left = notes[left_index]
        right = notes[right_index]
        scores[(left.id, right.id)] = normalized_similarity
    return scores


def _build_link_candidates(
    notes: list[NoteRecord],
    phrase_map: dict[str, list[str]],
    similarity_map: dict[tuple[str, str], float],
) -> list[NoteLink]:
    candidates: list[NoteLink] = []

    for left, right in combinations(notes, 2):
        similarity = similarity_map.get((left.id, right.id), 0.0)
        shared_phrases = _shared_phrases(phrase_map[left.id], phrase_map[right.id])[:3]
        if similarity < MIN_SEMANTIC_LINK_SCORE and len(shared_phrases) < 2:
            continue
        if not shared_phrases and similarity < MIN_SEMANTIC_LINK_WITHOUT_SHARED_PHRASES:
            continue

        time_gap_days = abs((left.note_date - right.note_date).days)
        temporal_closeness = 1.0 / (1.0 + (time_gap_days / 60.0))
        overlap_bonus = min(len(shared_phrases) / 3.0, 1.0)
        strength = clamp(
            (0.68 * similarity) + (0.2 * overlap_bonus) + (0.12 * temporal_closeness),
            0.0,
            0.99,
        )

        source, target = sorted([left, right], key=lambda note: (note.note_date, note.updated_at))
        rationale = (
            f"These notes keep circling the same ideas around {', '.join(shared_phrases[:2])}"
            if shared_phrases
            else "These notes are semantically close across the same period"
        )
        rationale = (
            f"{rationale} and stay connected from {source.note_date.isoformat()} to {target.note_date.isoformat()}."
        )

        candidates.append(
            NoteLink(
                source_note_id=source.id,
                source_title=source.title,
                source_date=source.note_date,
                target_note_id=target.id,
                target_title=target.title,
                target_date=target.note_date,
                shared_themes=[phrase.title() for phrase in shared_phrases] or ["Semantic Similarity"],
                rationale=rationale,
                strength=round(strength, 3),
            )
        )

    candidates.sort(key=lambda item: item.strength, reverse=True)
    return candidates


def _select_graph_links(
    candidates: list[NoteLink],
    link_feedback: dict[tuple[str, str], str],
) -> list[NoteLink]:
    selected: list[NoteLink] = []
    degree_counter: Counter[str] = Counter()
    sorted_candidates = sorted(
        candidates,
        key=lambda item: (
            link_feedback.get(_normalized_link_key(item.source_note_id, item.target_note_id)) == "accepted",
            item.strength,
        ),
        reverse=True,
    )
    for link in sorted_candidates:
        feedback = link_feedback.get(_normalized_link_key(link.source_note_id, link.target_note_id))
        if feedback == "rejected":
            continue
        degree_limit = 5 if feedback == "accepted" else 4
        if degree_counter[link.source_note_id] >= degree_limit or degree_counter[link.target_note_id] >= degree_limit:
            continue
        selected.append(link)
        degree_counter[link.source_note_id] += 1
        degree_counter[link.target_note_id] += 1
        if len(selected) >= MAX_GRAPH_LINKS:
            break
    return selected


def _build_suggested_links(
    candidates: list[NoteLink],
    graph_links: list[NoteLink],
    link_feedback: dict[tuple[str, str], str],
) -> list[NoteLink]:
    selected_keys = {
        _normalized_link_key(link.source_note_id, link.target_note_id)
        for link in graph_links
    }
    suggestions: list[NoteLink] = []

    for link in candidates:
        key = _normalized_link_key(link.source_note_id, link.target_note_id)
        feedback = link_feedback.get(key)
        has_shared_theme = any(theme != "Semantic Similarity" for theme in link.shared_themes)
        if key in selected_keys or feedback in {"accepted", "rejected"}:
            continue
        if not has_shared_theme and link.strength < 0.28:
            continue
        if has_shared_theme and link.strength < 0.18:
            continue
        suggestions.append(link)
        if len(suggestions) >= 6:
            break

    return suggestions


def _build_themes(notes: list[NoteRecord], phrase_map: dict[str, list[str]]) -> list[RecurringTheme]:
    phrase_to_note_ids: defaultdict[str, set[str]] = defaultdict(set)
    phrase_to_titles: defaultdict[str, list[str]] = defaultdict(list)
    phrase_evidence: Counter[str] = Counter()

    title_by_note_id = {note.id: note.title for note in notes}
    for note in notes:
        seen_in_note: set[str] = set()
        for phrase in phrase_map[note.id]:
            phrase_evidence[phrase] += 1
            phrase_to_titles[phrase].append(note.title)
            if phrase not in seen_in_note:
                phrase_to_note_ids[phrase].add(note.id)
                seen_in_note.add(phrase)

    ranked = sorted(
        phrase_to_note_ids,
        key=lambda phrase: (len(phrase_to_note_ids[phrase]), len(phrase.split()), phrase_evidence[phrase]),
        reverse=True,
    )
    picked = [phrase for phrase in ranked if len(phrase_to_note_ids[phrase]) >= 2][:5]
    if len(picked) < 4:
        for phrase in ranked:
            if phrase not in picked:
                picked.append(phrase)
            if len(picked) >= 5:
                break

    themes: list[RecurringTheme] = []
    for phrase in picked:
        note_ids = list(phrase_to_note_ids[phrase])
        representative_notes = list(OrderedDict((title_by_note_id[note_id], title_by_note_id[note_id]) for note_id in note_ids).values())[:3]
        theme_name = phrase.title()
        summary = (
            f"{theme_name} appears across {len(note_ids)} note"
            f"{'' if len(note_ids) == 1 else 's'}, including {', '.join(representative_notes[:2])}."
        )
        themes.append(
            RecurringTheme(
                theme=theme_name,
                note_count=len(note_ids),
                evidence_count=phrase_evidence[phrase],
                summary=summary,
                representative_notes=representative_notes,
            )
        )
    return themes


def _build_theme_drift(
    notes: list[NoteRecord],
    phrase_map: dict[str, list[str]],
    themes: list[RecurringTheme],
) -> list[ThemeDrift]:
    if len(notes) < 4:
        return []

    sorted_notes = sorted(notes, key=lambda note: (note.note_date, note.updated_at))
    window_size = max(2, len(sorted_notes) // 2)
    previous_window = sorted_notes[:-window_size]
    recent_window = sorted_notes[-window_size:]
    if not previous_window:
        return []

    previous_counts: Counter[str] = Counter()
    recent_counts: Counter[str] = Counter()

    for note in previous_window:
        for phrase in dict.fromkeys(phrase_map[note.id][:3]):
            previous_counts[phrase] += 1
    for note in recent_window:
        for phrase in dict.fromkeys(phrase_map[note.id][:3]):
            recent_counts[phrase] += 1

    candidate_phrases: list[str] = []
    for theme in themes:
        candidate_phrases.append(theme.theme.lower())
    candidate_phrases.extend(phrase for phrase, _count in recent_counts.most_common(6))
    candidate_phrases.extend(phrase for phrase, _count in previous_counts.most_common(6))

    drift_items: list[ThemeDrift] = []
    for phrase in OrderedDict((phrase, phrase) for phrase in candidate_phrases).values():
        previous_count = previous_counts.get(phrase, 0)
        recent_count = recent_counts.get(phrase, 0)
        if previous_count == 0 and recent_count == 0:
            continue
        delta = recent_count - previous_count
        direction = "up" if delta > 0 else "down" if delta < 0 else "stable"
        theme_name = phrase.title()
        if direction == "up":
            summary = f"{theme_name} is rising recently: {recent_count} recent notes vs {previous_count} earlier notes."
        elif direction == "down":
            summary = f"{theme_name} is fading: {recent_count} recent notes vs {previous_count} earlier notes."
        else:
            summary = f"{theme_name} is steady across time: {recent_count} recent notes and {previous_count} earlier notes."
        drift_items.append(
            ThemeDrift(
                theme=theme_name,
                recent_count=recent_count,
                previous_count=previous_count,
                delta=delta,
                direction=direction,
                summary=summary,
            )
        )

    drift_items.sort(
        key=lambda item: (abs(item.delta), item.recent_count + item.previous_count, item.theme),
        reverse=True,
    )
    return drift_items[:5]


def _build_timeline(notes: list[NoteRecord], phrase_map: dict[str, list[str]]) -> list[TimelineEvent]:
    sorted_notes = sorted(notes, key=lambda note: (note.note_date, note.updated_at))
    recent_notes = sorted_notes[-12:]
    timeline: list[TimelineEvent] = []
    for note in recent_notes:
        summary = _summarize_note(note)
        primary_phrases = [phrase.title() for phrase in phrase_map[note.id][:2]]
        if primary_phrases:
            summary = f"{summary} Focus: {', '.join(primary_phrases)}."
        timeline.append(
            TimelineEvent(
                note_id=note.id,
                title=note.title,
                note_date=note.note_date,
                summary=summary,
                score=0.7,
            )
        )
    return list(reversed(timeline))


def _build_memory_trails(
    notes: list[NoteRecord],
    phrase_map: dict[str, list[str]],
    themes: list[RecurringTheme],
) -> list[MemoryTrail]:
    sorted_notes = sorted(notes, key=lambda note: (note.note_date, note.updated_at))
    trails: list[MemoryTrail] = []

    for theme in themes[:4]:
        phrase = theme.theme.lower()
        related_notes = [
            note
            for note in sorted_notes
            if phrase in phrase_map[note.id]
        ]
        if len(related_notes) < 2:
            continue

        steps = [
            MemoryTrailStep(
                note_id=note.id,
                title=note.title,
                note_date=note.note_date,
                summary=_summarize_note(note),
            )
            for note in related_notes[:4]
        ]
        if len(steps) < 2:
            continue
        arc_summary = (
            f"This thread starts in {steps[0].title}, gets refined through {steps[min(1, len(steps) - 1)].title}, "
            f"and most recently shows up in {steps[-1].title}."
        )
        trails.append(
            MemoryTrail(
                topic=theme.theme,
                arc_summary=arc_summary,
                steps=steps,
            )
        )

    return trails[:3]


def _build_nodes(
    notes: list[NoteRecord],
    phrase_map: dict[str, list[str]],
    graph_links: list[NoteLink],
) -> list[MemoryGraphNode]:
    degree_counter: Counter[str] = Counter()
    for link in graph_links:
        degree_counter[link.source_note_id] += 1
        degree_counter[link.target_note_id] += 1
    linked_note_ids = {
        note_id
        for link in graph_links
        for note_id in (link.source_note_id, link.target_note_id)
    }

    nodes = [
        MemoryGraphNode(
            note_id=note.id,
            title=note.title,
            note_date=note.note_date,
            primary_theme=phrase_map[note.id][0].title() if phrase_map[note.id] else None,
            degree=degree_counter[note.id],
        )
        for note in notes
    ]
    nodes.sort(
        key=lambda item: (
            item.note_id in linked_note_ids,
            item.degree,
            item.note_date,
        ),
        reverse=True,
    )
    return nodes[:MAX_GRAPH_NODES]


def _shared_phrases(left: list[str], right: list[str]) -> list[str]:
    right_set = set(right)
    return [phrase for phrase in left if phrase in right_set]


def _normalized_link_key(left_note_id: str, right_note_id: str) -> tuple[str, str]:
    return tuple(sorted((left_note_id, right_note_id)))


def _summarize_note(note: NoteRecord) -> str:
    sentences = split_sentences(note.content)
    return sentences[0] if sentences else note.content[:180]
