"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";

import { getNote } from "@/lib/api";
import { formatDate, shortenLabel } from "@/lib/formatters";
import type { MemoryGraphNode, NoteDetail, NoteLink } from "@/lib/types";

const GRAPH_WIDTH = 1240;
const GRAPH_HEIGHT = 760;
const MAX_VISIBLE_NODES = 30;
const MAX_VISIBLE_LINKS = 42;
const FOCUSED_NODE_COUNT = 18;
const FOCUSED_LINK_COUNT = 24;
const MIN_SCALE = 0.72;
const MAX_SCALE = 2.2;

type MemoryGraphProps = {
  nodes: MemoryGraphNode[];
  links: NoteLink[];
  fetchNoteDetail?: (noteId: string) => Promise<NoteDetail>;
  selectedTheme?: string | null;
};

type PositionedNode = MemoryGraphNode & {
  x: number;
  y: number;
  radius: number;
};

type PositionedLink = NoteLink & {
  key: string;
  gradientId: string;
  midX: number;
  midY: number;
  path: string;
  source: PositionedNode;
  target: PositionedNode;
};

type ThemeTone = {
  base: string;
  border: string;
  soft: string;
  panel: string;
  ink: string;
};

type ViewportState = {
  x: number;
  y: number;
  scale: number;
};

type GraphSize = "standard" | "tall";

type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
};

const DEFAULT_TONE: ThemeTone = {
  base: "#4cc9f0",
  border: "#bcefff",
  soft: "rgba(76, 201, 240, 0.18)",
  panel: "rgba(11, 22, 40, 0.92)",
  ink: "#08111f",
};

const THEME_TONES: ThemeTone[] = [
  DEFAULT_TONE,
  {
    base: "#ff8f6b",
    border: "#ffd7c9",
    soft: "rgba(255, 143, 107, 0.18)",
    panel: "rgba(42, 20, 12, 0.92)",
    ink: "#1b0e09",
  },
  {
    base: "#97df6f",
    border: "#dff9c8",
    soft: "rgba(151, 223, 111, 0.18)",
    panel: "rgba(17, 38, 18, 0.92)",
    ink: "#081107",
  },
  {
    base: "#f7c95e",
    border: "#fff0c6",
    soft: "rgba(247, 201, 94, 0.18)",
    panel: "rgba(48, 34, 12, 0.92)",
    ink: "#161006",
  },
  {
    base: "#f58bd6",
    border: "#ffd7f4",
    soft: "rgba(245, 139, 214, 0.18)",
    panel: "rgba(43, 17, 38, 0.92)",
    ink: "#170913",
  },
  {
    base: "#8ca8ff",
    border: "#d7e0ff",
    soft: "rgba(140, 168, 255, 0.18)",
    panel: "rgba(18, 24, 48, 0.92)",
    ink: "#0b0f18",
  },
  {
    base: "#70e1ca",
    border: "#d0fbf0",
    soft: "rgba(112, 225, 202, 0.18)",
    panel: "rgba(14, 40, 34, 0.92)",
    ink: "#06120f",
  },
  {
    base: "#c59bff",
    border: "#eadbff",
    soft: "rgba(197, 155, 255, 0.18)",
    panel: "rgba(27, 18, 44, 0.92)",
    ink: "#0d0915",
  },
];

const GRAPH_HEIGHT_CLASSES: Record<GraphSize, string> = {
  standard: "h-[620px]",
  tall: "h-[820px]",
};
const FULLSCREEN_GRAPH_HEIGHT_CLASS = "h-[calc(100vh-220px)] min-h-[720px]";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function isActivationKey(event: KeyboardEvent<SVGPathElement | SVGGElement | HTMLButtonElement>): boolean {
  return event.key === "Enter" || event.key === " ";
}

function getLinkKey(link: NoteLink): string {
  return `${link.source_note_id}-${link.target_note_id}`;
}

function getVisibleGraph(nodes: MemoryGraphNode[], links: NoteLink[], strongestOnly: boolean) {
  const rankedLinks = [...links].sort((left, right) => right.strength - left.strength);
  const seededNodeIds: string[] = [];
  const seenNodeIds = new Set<string>();
  const targetNodeCount = Math.min(nodes.length, strongestOnly ? FOCUSED_NODE_COUNT : MAX_VISIBLE_NODES);
  const targetLinkCount = Math.min(links.length, strongestOnly ? FOCUSED_LINK_COUNT : MAX_VISIBLE_LINKS);

  for (const link of rankedLinks.slice(0, targetLinkCount)) {
    if (!seenNodeIds.has(link.source_note_id)) {
      seededNodeIds.push(link.source_note_id);
      seenNodeIds.add(link.source_note_id);
    }
    if (!seenNodeIds.has(link.target_note_id)) {
      seededNodeIds.push(link.target_note_id);
      seenNodeIds.add(link.target_note_id);
    }
  }

  const rankedNodes = [...nodes].sort((left, right) => {
    if (right.degree !== left.degree) {
      return right.degree - left.degree;
    }
    return toTimestamp(right.note_date) - toTimestamp(left.note_date);
  });

  for (const node of rankedNodes) {
    if (seededNodeIds.length >= targetNodeCount) {
      break;
    }
    if (!seenNodeIds.has(node.note_id)) {
      seededNodeIds.push(node.note_id);
      seenNodeIds.add(node.note_id);
    }
  }

  const visibleNodeIds = new Set(seededNodeIds.slice(0, targetNodeCount));
  const visibleNodes = nodes.filter((node) => visibleNodeIds.has(node.note_id));
  const visibleLinks = rankedLinks
    .filter((link) => visibleNodeIds.has(link.source_note_id) && visibleNodeIds.has(link.target_note_id))
    .slice(0, targetLinkCount);

  return { visibleNodes, visibleLinks };
}

function buildNodePositions(nodes: MemoryGraphNode[]): PositionedNode[] {
  if (nodes.length === 0) {
    return [];
  }

  const sortedNodes = [...nodes].sort((left, right) => {
    const dateDifference = toTimestamp(left.note_date) - toTimestamp(right.note_date);
    if (dateDifference !== 0) {
      return dateDifference;
    }
    if (right.degree !== left.degree) {
      return right.degree - left.degree;
    }
    return left.title.localeCompare(right.title);
  });

  const lanes = [112, 198, 284, 370, 456, 542, 628];
  const dateValues = sortedNodes.map((node) => toTimestamp(node.note_date));
  const minDate = Math.min(...dateValues);
  const maxDate = Math.max(...dateValues);
  const span = Math.max(maxDate - minDate, 1);
  const perDateOffset = new Map<string, number>();

  return sortedNodes.map((node, index) => {
    const collisionCount = perDateOffset.get(node.note_date) ?? 0;
    perDateOffset.set(node.note_date, collisionCount + 1);

    const normalized =
      span === 1 ? (index + 1) / (sortedNodes.length + 1) : (toTimestamp(node.note_date) - minDate) / span;
    const laneBase = lanes[(index + node.degree) % lanes.length];
    const jitter = ((node.note_id.length + node.degree) % 5) * 9 - 18;
    const collisionLift = collisionCount === 0 ? 0 : (collisionCount % 2 === 0 ? 1 : -1) * collisionCount * 20;

    return {
      ...node,
      x: 116 + normalized * (GRAPH_WIDTH - 232) + collisionCount * 8,
      y: clamp(laneBase + jitter + collisionLift, 84, GRAPH_HEIGHT - 88),
      radius: 16 + Math.min(node.degree, 6) * 2.8,
    };
  });
}

function buildLinkGeometry(links: NoteLink[], nodeMap: Map<string, PositionedNode>): PositionedLink[] {
  return links.flatMap((link) => {
    const source = nodeMap.get(link.source_note_id);
    const target = nodeMap.get(link.target_note_id);

    if (!source || !target) {
      return [];
    }

    const sourceFirst = source.x <= target.x ? source : target;
    const targetSecond = source.x <= target.x ? target : source;
    const curveDirection = sourceFirst.y <= targetSecond.y ? -1 : 1;
    const lift = clamp(Math.abs(targetSecond.x - sourceFirst.x) * 0.16, 36, 104);
    const controlX = (source.x + target.x) / 2;
    const controlY = clamp((source.y + target.y) / 2 + curveDirection * lift, 64, GRAPH_HEIGHT - 64);
    const key = getLinkKey(link);

    return [
      {
        ...link,
        key,
        gradientId: `memory-link-${key}`,
        source,
        target,
        midX: 0.25 * source.x + 0.5 * controlX + 0.25 * target.x,
        midY: 0.25 * source.y + 0.5 * controlY + 0.25 * target.y,
        path: `M ${source.x} ${source.y} Q ${controlX} ${controlY} ${target.x} ${target.y}`,
      },
    ];
  });
}

function buildThemePalette(nodes: PositionedNode[], links: PositionedLink[]) {
  const themeNames = [
    ...nodes.map((node) => node.primary_theme).filter((theme): theme is string => Boolean(theme)),
    ...links.flatMap((link) => link.shared_themes),
  ];
  const orderedThemes = [...new Set(themeNames)].sort((left, right) => left.localeCompare(right));
  const themeMap = new Map<string, ThemeTone>();
  orderedThemes.forEach((theme, index) => {
    themeMap.set(theme, THEME_TONES[index % THEME_TONES.length]);
  });

  const themeCounts = new Map<string, number>();
  nodes.forEach((node) => {
    if (!node.primary_theme) {
      return;
    }
    themeCounts.set(node.primary_theme, (themeCounts.get(node.primary_theme) ?? 0) + 1);
  });

  return {
    themeMap,
    legend: [...themeCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 6)
      .map(([theme, count]) => ({
        theme,
        count,
        tone: themeMap.get(theme) ?? DEFAULT_TONE,
      })),
  };
}

function toneForTheme(theme: string | null | undefined, themeMap: Map<string, ThemeTone>): ThemeTone {
  if (!theme) {
    return DEFAULT_TONE;
  }
  return themeMap.get(theme) ?? DEFAULT_TONE;
}

function dominantThemeForLink(
  link: PositionedLink,
  themeMap: Map<string, ThemeTone>,
): { name: string | null; tone: ThemeTone } {
  const dominant = link.shared_themes[0] ?? link.source.primary_theme ?? link.target.primary_theme ?? null;
  return {
    name: dominant,
    tone: toneForTheme(dominant, themeMap),
  };
}

function getGraphPoint(
  svg: SVGSVGElement | null,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  if (!svg) {
    return { x: GRAPH_WIDTH / 2, y: GRAPH_HEIGHT / 2 };
  }

  const rect = svg.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return { x: GRAPH_WIDTH / 2, y: GRAPH_HEIGHT / 2 };
  }

  return {
    x: ((clientX - rect.left) / rect.width) * GRAPH_WIDTH,
    y: ((clientY - rect.top) / rect.height) * GRAPH_HEIGHT,
  };
}

export function MemoryGraph({
  nodes,
  links,
  fetchNoteDetail = getNote,
  selectedTheme = null,
}: MemoryGraphProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedLinkKey, setSelectedLinkKey] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredLinkKey, setHoveredLinkKey] = useState<string | null>(null);
  const strongestOnly = true;
  const [graphSize, setGraphSize] = useState<GraphSize>("standard");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewport, setViewport] = useState<ViewportState>({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [noteCache, setNoteCache] = useState<Record<string, NoteDetail>>({});
  const [loadingNoteId, setLoadingNoteId] = useState<string | null>(null);
  const [noteSheetError, setNoteSheetError] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const requestCounterRef = useRef(0);
  const previousGraphSizeRef = useRef<GraphSize>("standard");

  const { visibleNodes, visibleLinks } = useMemo(
    () => getVisibleGraph(nodes, links, strongestOnly),
    [links, nodes, strongestOnly],
  );

  const positionedNodes = useMemo(() => buildNodePositions(visibleNodes), [visibleNodes]);
  const nodeMap = useMemo(
    () => new Map(positionedNodes.map((node) => [node.note_id, node])),
    [positionedNodes],
  );
  const positionedLinks = useMemo(() => buildLinkGeometry(visibleLinks, nodeMap), [nodeMap, visibleLinks]);
  const { themeMap } = useMemo(
    () => buildThemePalette(positionedNodes, positionedLinks),
    [positionedLinks, positionedNodes],
  );

  const adjacency = useMemo(() => {
    const map = new Map<string, PositionedLink[]>();
    for (const link of positionedLinks) {
      const sourceLinks = map.get(link.source_note_id) ?? [];
      sourceLinks.push(link);
      map.set(link.source_note_id, sourceLinks);

      const targetLinks = map.get(link.target_note_id) ?? [];
      targetLinks.push(link);
      map.set(link.target_note_id, targetLinks);
    }
    return map;
  }, [positionedLinks]);

  const strongestLinks = positionedLinks.slice(0, 5);
  const openNote = openNoteId ? noteCache[openNoteId] ?? null : null;
  const openNode = openNoteId ? nodeMap.get(openNoteId) ?? null : null;
  const openNodeConnections = openNoteId
    ? [...(adjacency.get(openNoteId) ?? [])].sort((left, right) => right.strength - left.strength)
    : [];

  useEffect(() => {
    if (selectedNodeId && !nodeMap.has(selectedNodeId)) {
      setSelectedNodeId(null);
    }
    if (openNoteId && !nodeMap.has(openNoteId)) {
      setOpenNoteId(null);
    }
  }, [nodeMap, openNoteId, selectedNodeId]);

  useEffect(() => {
    if (selectedLinkKey && !positionedLinks.some((link) => link.key === selectedLinkKey)) {
      setSelectedLinkKey(null);
    }
  }, [positionedLinks, selectedLinkKey]);

  const activeInteraction = useMemo(() => {
    if (selectedLinkKey) {
      return { type: "link" as const, linkKey: selectedLinkKey };
    }
    if (selectedNodeId) {
      return { type: "node" as const, nodeId: selectedNodeId };
    }
    if (hoveredLinkKey) {
      return { type: "link" as const, linkKey: hoveredLinkKey };
    }
    if (hoveredNodeId) {
      return { type: "node" as const, nodeId: hoveredNodeId };
    }
    return null;
  }, [hoveredLinkKey, hoveredNodeId, selectedLinkKey, selectedNodeId]);

  const activeLink =
    activeInteraction?.type === "link"
      ? positionedLinks.find((link) => link.key === activeInteraction.linkKey) ?? null
      : null;
  const activeNode =
    activeInteraction?.type === "node" ? nodeMap.get(activeInteraction.nodeId) ?? null : null;

  const focusedNodeIds = useMemo(() => {
    const ids = new Set<string>();

    if (activeLink) {
      ids.add(activeLink.source_note_id);
      ids.add(activeLink.target_note_id);
      return ids;
    }

    if (activeNode) {
      ids.add(activeNode.note_id);
      for (const link of adjacency.get(activeNode.note_id) ?? []) {
        ids.add(link.source_note_id);
        ids.add(link.target_note_id);
      }
    }

    return ids;
  }, [activeLink, activeNode, adjacency]);

  const focusedLinkKeys = useMemo(() => {
    const keys = new Set<string>();

    if (activeLink) {
      keys.add(activeLink.key);
      return keys;
    }

    if (activeNode) {
      for (const link of adjacency.get(activeNode.note_id) ?? []) {
        keys.add(link.key);
      }
    }

    return keys;
  }, [activeLink, activeNode, adjacency]);

  const connectedLinks = activeNode
    ? [...(adjacency.get(activeNode.note_id) ?? [])].sort((left, right) => right.strength - left.strength)
    : [];
  const themeNodeIds = useMemo(() => {
    if (!selectedTheme) {
      return new Set<string>();
    }

    return new Set(
      positionedNodes.filter((node) => node.primary_theme === selectedTheme).map((node) => node.note_id),
    );
  }, [positionedNodes, selectedTheme]);
  const themeLinkKeys = useMemo(() => {
    if (!selectedTheme) {
      return new Set<string>();
    }

    return new Set(
      positionedLinks
        .filter(
          (link) =>
            link.shared_themes.includes(selectedTheme) ||
            themeNodeIds.has(link.source_note_id) ||
            themeNodeIds.has(link.target_note_id),
        )
        .map((link) => link.key),
    );
  }, [positionedLinks, selectedTheme, themeNodeIds]);
  const themeContextNodeIds = useMemo(() => {
    if (!selectedTheme) {
      return new Set<string>();
    }

    const ids = new Set<string>(themeNodeIds);

    for (const link of positionedLinks) {
      if (
        link.shared_themes.includes(selectedTheme) ||
        themeNodeIds.has(link.source_note_id) ||
        themeNodeIds.has(link.target_note_id)
      ) {
        ids.add(link.source_note_id);
        ids.add(link.target_note_id);
      }
    }

    return ids;
  }, [positionedLinks, selectedTheme, themeNodeIds]);
  const earliestLabel =
    positionedNodes.length > 0
      ? formatDate(
          [...positionedNodes].sort((left, right) => toTimestamp(left.note_date) - toTimestamp(right.note_date))[0]
            .note_date,
          "short",
        )
      : "";
  const latestLabel =
    positionedNodes.length > 0
      ? formatDate(
          [...positionedNodes].sort((left, right) => toTimestamp(right.note_date) - toTimestamp(left.note_date))[0]
            .note_date,
          "short",
        )
      : "";
  const hasFocus = activeLink !== null || activeNode !== null;
  const hasThemeFocus = Boolean(selectedTheme);
  const hasGraphFocus = hasFocus || hasThemeFocus;
  const graphHeightClass = isFullscreen ? FULLSCREEN_GRAPH_HEIGHT_CLASS : GRAPH_HEIGHT_CLASSES[graphSize];
  const showInspector = selectedLinkKey !== null && activeLink !== null;
  const hasMovedViewport = viewport.x !== 0 || viewport.y !== 0 || viewport.scale !== 1;

  useEffect(() => {
    if (!isFullscreen) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isFullscreen]);

  function setZoom(nextScale: number, focusX = GRAPH_WIDTH / 2, focusY = GRAPH_HEIGHT / 2) {
    setViewport((current) => {
      const clampedScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const nextX = focusX - ((focusX - current.x) / current.scale) * clampedScale;
      const nextY = focusY - ((focusY - current.y) / current.scale) * clampedScale;
      return {
        x: nextX,
        y: nextY,
        scale: clampedScale,
      };
    });
  }

  function resetView() {
    setViewport({ x: 0, y: 0, scale: 1 });
  }

  function resetFocus() {
    setSelectedLinkKey(null);
    setSelectedNodeId(null);
    setHoveredLinkKey(null);
    setHoveredNodeId(null);
    setOpenNoteId(null);
    setNoteSheetError(null);
    setLoadingNoteId(null);
  }

  function openFullscreen() {
    previousGraphSizeRef.current = graphSize;
    setGraphSize("tall");
    setIsFullscreen(true);
  }

  function closeFullscreen() {
    setIsFullscreen(false);
    setGraphSize(previousGraphSizeRef.current);
  }

  async function openNoteSheet(noteId: string) {
    setSelectedLinkKey(null);
    setSelectedNodeId(noteId);
    setHoveredLinkKey(null);
    setHoveredNodeId(null);
    setOpenNoteId(noteId);
    setNoteSheetError(null);

    if (noteCache[noteId]) {
      setLoadingNoteId(null);
      return;
    }

    const requestId = requestCounterRef.current + 1;
    requestCounterRef.current = requestId;
    setLoadingNoteId(noteId);

    try {
      const detail = await fetchNoteDetail(noteId);
      if (requestCounterRef.current !== requestId) {
        return;
      }
      setNoteCache((current) => ({ ...current, [noteId]: detail }));
    } catch (error) {
      if (requestCounterRef.current !== requestId) {
        return;
      }
      setNoteSheetError(error instanceof Error ? error.message : "Could not open that note.");
    } finally {
      if (requestCounterRef.current === requestId) {
        setLoadingNoteId((current) => (current === noteId ? null : current));
      }
    }
  }

  function inspectLink(linkKey: string) {
    setSelectedNodeId(null);
    setSelectedLinkKey(linkKey);
    setHoveredNodeId(null);
    setHoveredLinkKey(null);
    setOpenNoteId(null);
    setNoteSheetError(null);
    setLoadingNoteId(null);
  }

  function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    const focusPoint = getGraphPoint(svgRef.current, event.clientX, event.clientY);
    const nextScale = viewport.scale * (event.deltaY > 0 ? 0.92 : 1.08);
    setZoom(nextScale, focusPoint.x, focusPoint.y);
  }

  function handleBackgroundPointerDown(event: ReactPointerEvent<SVGRectElement>) {
    if (event.button !== 0) {
      return;
    }
    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: viewport.x,
      originY: viewport.y,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || !svgRef.current) {
      return;
    }

    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }

    const deltaX = ((event.clientX - dragState.startClientX) / rect.width) * GRAPH_WIDTH;
    const deltaY = ((event.clientY - dragState.startClientY) / rect.height) * GRAPH_HEIGHT;

    setViewport((current) => ({
      ...current,
      x: dragState.originX + deltaX,
      y: dragState.originY + deltaY,
    }));
  }

  function endDrag() {
    dragStateRef.current = null;
    setIsDragging(false);
  }

  if (positionedNodes.length === 0) {
    return (
      <div className="rounded-3xl border border-border bg-panel-soft px-5 py-6 text-sm text-muted">
        Add a few more notes before the graph becomes useful.
      </div>
    );
  }

  return (
    <>
      {isFullscreen ? (
        <div
          className="fixed inset-0 z-[70] bg-[rgba(2,7,14,0.78)] backdrop-blur-sm"
          onClick={closeFullscreen}
        />
      ) : null}

      <div
        className={
          isFullscreen
            ? "fixed inset-4 z-[80] overflow-auto rounded-[32px] border border-border bg-[rgba(5,10,18,0.96)] p-4 shadow-[0_36px_120px_rgba(0,0,0,0.52)]"
            : ""
        }
      >
        <div
          className={`grid gap-4 ${
            isFullscreen && showInspector ? "h-full xl:grid-cols-[minmax(0,1fr)_320px]" : ""
          }`}
        >
      <div className="overflow-hidden rounded-lg border border-border bg-panel-strong">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="mono text-[11px] uppercase tracking-[0.22em] text-accent">Interactive map</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>{positionedNodes.length} notes</span>
              <span className="text-border">/</span>
              <span>{positionedLinks.length} links</span>
              {selectedTheme ? (
                <>
                  <span className="text-border">/</span>
                  <span className="truncate text-accent">{selectedTheme}</span>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {hasMovedViewport ? (
              <button
                type="button"
                onClick={resetView}
                className="rounded-full border border-border bg-panel-soft px-3 py-2 text-xs text-muted transition hover:border-accent/25 hover:text-foreground"
              >
                Reset
              </button>
            ) : null}
            {selectedLinkKey ? (
              <button
                type="button"
                onClick={resetFocus}
                className="rounded-full border border-border bg-panel-soft px-3 py-2 text-xs text-muted transition hover:border-accent/25 hover:text-foreground"
              >
                Clear
              </button>
            ) : null}
            <button
              type="button"
              onClick={isFullscreen ? closeFullscreen : openFullscreen}
              className="rounded-full border border-accent/30 bg-accent-soft px-4 py-2 text-sm font-semibold text-accent transition hover:border-accent/50 hover:bg-accent hover:text-background"
            >
              {isFullscreen ? "Exit fullscreen" : "Open fullscreen"}
            </button>
          </div>
        </div>

        <div className="subtle-grid relative overflow-hidden">
          <svg
            ref={svgRef}
            data-testid="memory-graph-canvas"
            viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
            className={`${graphHeightClass} w-full`}
            style={{ touchAction: "none", cursor: isDragging ? "grabbing" : "default" }}
            shapeRendering="geometricPrecision"
            textRendering="geometricPrecision"
            onWheel={handleWheel}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onPointerLeave={endDrag}
          >
            <defs>
              <filter id="memory-node-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.4" result="blurred" />
                <feMerge>
                  <feMergeNode in="blurred" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              {positionedLinks.map((link) => {
                const sourceTone = toneForTheme(link.source.primary_theme, themeMap);
                const targetTone = toneForTheme(link.target.primary_theme, themeMap);

                return (
                  <linearGradient
                    key={link.gradientId}
                    id={link.gradientId}
                    x1={link.source.x}
                    y1={link.source.y}
                    x2={link.target.x}
                    y2={link.target.y}
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0%" stopColor={sourceTone.base} />
                    <stop offset="100%" stopColor={targetTone.base} />
                  </linearGradient>
                );
              })}
            </defs>

            <rect x="0" y="0" width={GRAPH_WIDTH} height={GRAPH_HEIGHT} fill="rgba(10, 16, 29, 0.92)" />
            <rect
              x="0"
              y="0"
              width={GRAPH_WIDTH}
              height={GRAPH_HEIGHT}
              fill="transparent"
              onPointerDown={handleBackgroundPointerDown}
            />

            <text
              x="28"
              y="32"
              fill="rgba(190, 210, 232, 0.88)"
              fontSize="12"
              fontFamily="var(--font-plex-mono)"
            >
              earlier notes
            </text>
            <text
              x={GRAPH_WIDTH - 108}
              y="32"
              fill="rgba(190, 210, 232, 0.88)"
              fontSize="12"
              fontFamily="var(--font-plex-mono)"
            >
              recent notes
            </text>

            <g transform={`matrix(${viewport.scale} 0 0 ${viewport.scale} ${viewport.x} ${viewport.y})`}>
              {positionedNodes.map((node) => {
                const tone = toneForTheme(node.primary_theme, themeMap);
                return (
                  <line
                    key={`guide-${node.note_id}`}
                  x1={node.x}
                  y1="56"
                  x2={node.x}
                  y2={GRAPH_HEIGHT - 40}
                    stroke={tone.soft}
                    strokeOpacity={0.34}
                    strokeDasharray="4 12"
                  />
                );
              })}

              {positionedLinks.map((link) => {
                const isActive = focusedLinkKeys.has(link.key);
                const isThemeRelated = themeLinkKeys.has(link.key);
                const isHighlighted = hasFocus ? isActive : hasThemeFocus ? isThemeRelated : true;
                const isDimmed = hasGraphFocus && !isHighlighted;
                const { name: dominantTheme, tone } = dominantThemeForLink(link, themeMap);
                const visibleOpacity = !hasGraphFocus
                  ? 0.62 + link.strength * 0.18
                  : hasFocus
                    ? isActive
                      ? 0.96
                      : 0.14
                    : isThemeRelated
                      ? 0.88
                      : 0.08;
                const strokeWidth = !hasGraphFocus
                  ? 1.8 + link.strength * 2.8
                  : hasFocus
                    ? isActive
                      ? 3.2 + link.strength * 3.4
                      : 1.2
                    : isThemeRelated
                      ? 2.8 + link.strength * 3
                      : 1;

                return (
                  <g key={link.key}>
                    <path
                      d={link.path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={22}
                      role="button"
                      tabIndex={0}
                      aria-label={`Inspect link between ${link.source_title} and ${link.target_title}`}
                      onMouseEnter={() => setHoveredLinkKey(link.key)}
                      onMouseLeave={() => setHoveredLinkKey(null)}
                      onFocus={() => setHoveredLinkKey(link.key)}
                      onBlur={() => setHoveredLinkKey(null)}
                      onClick={() => inspectLink(link.key)}
                      onKeyDown={(event) => {
                        if (isActivationKey(event)) {
                          event.preventDefault();
                          inspectLink(link.key);
                        }
                      }}
                      className="cursor-pointer"
                    />
                    <path
                      d={link.path}
                      fill="none"
                      stroke={`url(#${link.gradientId})`}
                      strokeWidth={strokeWidth}
                      strokeOpacity={visibleOpacity}
                      strokeLinecap="round"
                      filter={isHighlighted ? "url(#memory-node-glow)" : undefined}
                    />
                    {!isDimmed && (isActive || (!hasFocus && isThemeRelated && link.strength >= 0.28)) ? (
                      <g transform={`translate(${link.midX}, ${link.midY - 18})`}>
                        <rect
                          x={-68}
                          y={-13}
                          width={136}
                          height={26}
                          rx={13}
                          fill="rgba(7, 12, 24, 0.98)"
                          stroke={tone.base}
                          strokeOpacity={0.45}
                        />
                        <text
                          x="0"
                          y="4"
                          textAnchor="middle"
                          fill="#f6fbff"
                          fontSize="12"
                          fontWeight="700"
                          fontFamily="var(--font-plex-mono)"
                        >
                          {Math.round(link.strength * 100)}% {dominantTheme ? dominantTheme : "match"}
                        </text>
                      </g>
                    ) : null}
                  </g>
                );
              })}

              {positionedNodes.map((node) => {
                const tone = toneForTheme(node.primary_theme, themeMap);
                const isEndpoint =
                  activeLink !== null &&
                  (activeLink.source_note_id === node.note_id || activeLink.target_note_id === node.note_id);
                const isActive = activeNode?.note_id === node.note_id || isEndpoint || openNoteId === node.note_id;
                const isRelated = focusedNodeIds.has(node.note_id) || openNoteId === node.note_id;
                const isThemePrimary = selectedTheme !== null && node.primary_theme === selectedTheme;
                const isThemeRelated = themeContextNodeIds.has(node.note_id);
                const isHighlighted = hasFocus ? isRelated : hasThemeFocus ? isThemeRelated : true;
                const isDimmed = hasGraphFocus && !isHighlighted;

                return (
                  <g
                    key={node.note_id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Inspect note ${node.title}`}
                    onMouseEnter={() => setHoveredNodeId(node.note_id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    onFocus={() => setHoveredNodeId(node.note_id)}
                    onBlur={() => setHoveredNodeId(null)}
                    onClick={() => {
                      void openNoteSheet(node.note_id);
                    }}
                    onKeyDown={(event) => {
                      if (isActivationKey(event)) {
                        event.preventDefault();
                        void openNoteSheet(node.note_id);
                      }
                    }}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.radius + 10}
                      fill={tone.soft}
                      opacity={
                        isActive
                          ? 0.34
                          : hasFocus
                            ? isRelated
                              ? 0.16
                              : isDimmed
                                ? 0.03
                                : 0.09
                            : isThemePrimary
                              ? 0.28
                              : isThemeRelated
                                ? 0.16
                                : isDimmed
                                  ? 0.03
                                  : 0.09
                      }
                      filter={isHighlighted ? "url(#memory-node-glow)" : undefined}
                    />
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.radius}
                      fill={isActive || isThemePrimary ? tone.base : "rgba(12, 19, 34, 0.98)"}
                      stroke={isActive || isThemePrimary ? tone.border : tone.base}
                      strokeWidth={isActive ? 2.6 : isThemePrimary ? 2.2 : 1.9}
                      opacity={isDimmed ? 0.24 : isThemeRelated ? 1 : 0.94}
                    />
                    <text
                      x={node.x}
                      y={node.y + 4}
                      textAnchor="middle"
                      fill={isActive || isThemePrimary ? tone.ink : "#f6fbff"}
                      fontSize="13"
                      fontWeight="700"
                      fontFamily="var(--font-plex-mono)"
                      opacity={isDimmed ? 0.5 : 1}
                    >
                      {node.degree}
                    </text>

                    <g transform={`translate(${node.x}, ${node.y - node.radius - 22})`} opacity={isDimmed ? 0.35 : 1}>
                      <rect
                        x={-76}
                        y={-14}
                        width={152}
                        height={28}
                        rx={14}
                        fill={isActive || isThemePrimary ? tone.panel : "rgba(8, 13, 25, 0.97)"}
                        stroke={isActive || isThemePrimary ? tone.base : "rgba(186, 204, 224, 0.2)"}
                      />
                      <text
                        x="0"
                        y="4"
                        textAnchor="middle"
                        fill="#f7fbff"
                        fontSize="12"
                        fontWeight="700"
                        fontFamily="var(--font-plex-mono)"
                      >
                        {shortenLabel(node.title, 20)}
                      </text>
                    </g>

                    {node.primary_theme ? (
                      <text
                        x={node.x}
                        y={node.y + node.radius + 19}
                        textAnchor="middle"
                        fill={tone.base}
                        fontSize="11"
                        fontWeight="600"
                        fontFamily="var(--font-plex-mono)"
                        opacity={isDimmed ? 0.24 : 0.98}
                      >
                        {shortenLabel(node.primary_theme, 18)}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          </svg>

          <div className="pointer-events-none absolute inset-x-4 bottom-3 flex items-center justify-between text-[11px] text-muted">
            <span className="mono">{earliestLabel}</span>
            <span className="mono">{latestLabel}</span>
          </div>

          <div
            className={`absolute inset-y-3 right-3 z-20 flex w-[calc(100%-1.5rem)] max-w-105 transition duration-300 ${
              openNoteId ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-[105%] opacity-0"
            }`}
          >
            <aside className="pointer-events-auto flex h-full w-full flex-col overflow-hidden rounded-3xl border border-border bg-[rgba(8,12,24,0.95)] shadow-[0_20px_55px_rgba(4,10,24,0.55)] backdrop-blur">
              <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
                <div>
                  <div className="mono text-[11px] uppercase tracking-[0.22em] text-accent">Note sheet</div>
                  <h3 className="mt-2 text-xl font-semibold text-foreground">
                    {openNote?.title ?? openNode?.title ?? "Opening note"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOpenNoteId(null);
                    setNoteSheetError(null);
                  }}
                  className="rounded-full border border-border bg-panel-soft px-3 py-1.5 text-xs text-muted transition hover:border-accent/25 hover:text-foreground"
                >
                  Close
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {loadingNoteId === openNoteId ? (
                  <div className="space-y-3">
                    <div className="h-4 w-32 rounded-full bg-white/8" />
                    <div className="h-24 rounded-[18px] bg-white/6" />
                    <div className="h-24 rounded-[18px] bg-white/6" />
                  </div>
                ) : noteSheetError ? (
                  <div className="rounded-[18px] border border-rose-500/25 bg-rose-500/10 px-4 py-4 text-sm text-rose-200">
                    <div>{noteSheetError}</div>
                    {openNoteId ? (
                      <button
                        type="button"
                        onClick={() => void openNoteSheet(openNoteId)}
                        className="mt-3 rounded-xl border border-rose-300/30 px-3 py-2 text-xs font-semibold transition hover:bg-rose-400/10"
                      >
                        Retry
                      </button>
                    ) : null}
                  </div>
                ) : openNote ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
                    {formatDate(openNote.note_date, "full")}
                      </span>
                      {openNode?.primary_theme ? (
                        <span
                          className="rounded-full border px-3 py-1 text-xs"
                          style={{
                            borderColor: toneForTheme(openNode.primary_theme, themeMap).soft,
                            backgroundColor: toneForTheme(openNode.primary_theme, themeMap).soft,
                            color: toneForTheme(openNode.primary_theme, themeMap).base,
                          }}
                        >
                          {openNode.primary_theme}
                        </span>
                      ) : null}
                      <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">
                        {openNode?.degree ?? 0} links
                      </span>
                    </div>

                    {openNote.source_path ? (
                      <div className="rounded-[18px] border border-border bg-panel-strong px-4 py-3 text-xs leading-6 text-muted">
                        {openNote.source_path}
                      </div>
                    ) : null}

                    <div className="rounded-[22px] border border-border bg-panel-strong px-4 py-4">
                      <div className="mono text-[11px] uppercase tracking-[0.18em] text-accent">Full note</div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground">{openNote.content}</p>
                    </div>

                    <div className="rounded-[22px] border border-border bg-panel-strong px-4 py-4">
                      <div className="mono text-[11px] uppercase tracking-[0.18em] text-accent">Connected notes</div>
                      {openNodeConnections.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {openNodeConnections.slice(0, 4).map((link) => {
                            const otherNode =
                              link.source_note_id === openNote.id ? link.target : link.source;
                            const tone = dominantThemeForLink(link, themeMap).tone;

                            return (
                              <button
                                key={`${openNote.id}-${link.key}`}
                                type="button"
                                onClick={() => inspectLink(link.key)}
                                className="w-full rounded-2xl border px-4 py-3 text-left transition hover:bg-white/5"
                                style={{
                                  borderColor: tone.soft,
                                  backgroundColor: "rgba(17, 24, 39, 0.68)",
                                }}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-medium text-foreground">{otherNode.title}</div>
                                    <div className="mt-1 text-xs uppercase tracking-[0.16em] text-muted">
                                      {formatDate(otherNode.note_date, "short")}
                                    </div>
                                  </div>
                                  <span
                                    className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                                    style={{
                                      backgroundColor: tone.soft,
                                      color: tone.base,
                                    }}
                                  >
                                    {Math.round(link.strength * 100)}%
                                  </span>
                                </div>
                                <p className="mt-2 text-sm leading-6 text-muted">{link.rationale}</p>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-3 rounded-2xl border border-border bg-panel px-4 py-3 text-sm text-muted">
                          No reusable links surfaced for this note yet.
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[18px] border border-border bg-panel-strong px-4 py-4 text-sm text-muted">
                    Pick a note in the graph to load it here.
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>

      {showInspector ? (
      <aside className="panel-soft rounded-lg p-5">
        <div className="mono text-[11px] uppercase tracking-[0.22em] text-accent">Inspector</div>

        {activeLink ? (
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="text-xl font-semibold text-foreground">Connection in focus</h3>
              <p className="mt-2 text-sm leading-7 text-muted">{activeLink.rationale}</p>
            </div>

            <div className="rounded-[18px] border border-border bg-panel-strong px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {activeLink.source_title} to {activeLink.target_title}
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-[0.16em] text-muted">
                    {formatDate(activeLink.source_date, "short")} and {formatDate(activeLink.target_date, "short")}
                  </div>
                </div>
                <span
                  className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: dominantThemeForLink(activeLink, themeMap).tone.soft,
                    color: dominantThemeForLink(activeLink, themeMap).tone.base,
                  }}
                >
                  {Math.round(activeLink.strength * 100)}%
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {activeLink.shared_themes.map((theme) => {
                  const tone = toneForTheme(theme, themeMap);
                  return (
                    <span
                      key={`${activeLink.key}-${theme}`}
                      className="rounded-full border px-3 py-1 text-xs"
                      style={{
                        borderColor: tone.soft,
                        backgroundColor: tone.soft,
                        color: tone.base,
                      }}
                    >
                      {theme}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Jump to an endpoint</div>
              <div className="grid gap-2">
                {[activeLink.source, activeLink.target].map((node) => (
                  <button
                    key={`${activeLink.key}-${node.note_id}`}
                    type="button"
                    onClick={() => void openNoteSheet(node.note_id)}
                    className="rounded-2xl border border-border bg-panel px-4 py-3 text-left transition hover:border-accent/25 hover:bg-panel-strong"
                  >
                    <div className="text-sm font-medium text-foreground">{node.title}</div>
                    <div className="mt-1 text-xs uppercase tracking-[0.16em] text-muted">
                      {formatDate(node.note_date, "short")}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : activeNode ? (
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="text-xl font-semibold text-foreground">{activeNode.title}</h3>
              <p className="mt-2 text-sm leading-7 text-muted">
                {connectedLinks.length > 0
                  ? `This note is linked to ${connectedLinks.length} nearby memories in the current graph slice.`
                  : "This note is not strongly linked to another visible note yet."}
              </p>
            </div>

            <div className="rounded-[18px] border border-border bg-panel-strong px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
                  {formatDate(activeNode.note_date, "short")}
                </span>
                <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">
                  degree {activeNode.degree}
                </span>
                {activeNode.primary_theme ? (
                  <span
                    className="rounded-full border px-3 py-1 text-xs"
                    style={{
                      borderColor: toneForTheme(activeNode.primary_theme, themeMap).soft,
                      backgroundColor: toneForTheme(activeNode.primary_theme, themeMap).soft,
                      color: toneForTheme(activeNode.primary_theme, themeMap).base,
                    }}
                  >
                    {activeNode.primary_theme}
                  </span>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void openNoteSheet(activeNode.note_id)}
              className="rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm font-semibold text-accent transition hover:bg-accent hover:text-background"
            >
              Open note sheet
            </button>

            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Connected notes</div>
              {connectedLinks.length > 0 ? (
                <div className="space-y-2">
                  {connectedLinks.slice(0, 4).map((link) => {
                    const otherNode =
                      link.source_note_id === activeNode.note_id ? link.target : link.source;
                    const tone = dominantThemeForLink(link, themeMap).tone;

                    return (
                      <button
                        key={`${activeNode.note_id}-${link.key}`}
                        type="button"
                        onClick={() => inspectLink(link.key)}
                        className="w-full rounded-2xl border px-4 py-3 text-left transition hover:bg-panel-strong"
                        style={{ borderColor: tone.soft, backgroundColor: "rgba(17, 24, 39, 0.68)" }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-medium text-foreground">{otherNode.title}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.16em] text-muted">
                              {formatDate(otherNode.note_date, "short")}
                            </div>
                          </div>
                          <span
                            className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                            style={{ backgroundColor: tone.soft, color: tone.base }}
                          >
                            {Math.round(link.strength * 100)}%
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-muted">{link.rationale}</p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-border bg-panel px-4 py-3 text-sm text-muted">
                  No reusable links surfaced for this note yet.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="text-xl font-semibold text-foreground">Trace a memory thread</h3>
              <p className="mt-2 text-sm leading-7 text-muted">
                Click any note to open the full entry, or start with one of the strongest reusable links.
              </p>
            </div>

            <div className="rounded-[18px] border border-border bg-panel-strong px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-foreground">Visible graph slice</div>
                <div className="text-xs uppercase tracking-[0.16em] text-muted">
                  {positionedNodes.length} notes / {positionedLinks.length} links
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {positionedNodes.slice(0, 4).map((node) => (
                  <button
                    key={`pill-${node.note_id}`}
                    type="button"
                    onClick={() => void openNoteSheet(node.note_id)}
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted transition hover:border-accent/25 hover:text-foreground"
                  >
                    {shortenLabel(node.title, 18)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Strongest reusable links</div>
              <div className="space-y-2">
                {strongestLinks.map((link) => {
                  const tone = dominantThemeForLink(link, themeMap).tone;

                  return (
                    <button
                      key={`strongest-${link.key}`}
                      type="button"
                      onClick={() => inspectLink(link.key)}
                      className="w-full rounded-2xl border px-4 py-3 text-left transition hover:bg-panel-strong"
                      style={{ borderColor: tone.soft, backgroundColor: "rgba(17, 24, 39, 0.68)" }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-foreground">
                            {link.source_title} to {link.target_title}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-muted">
                            {link.shared_themes.slice(0, 2).join(" / ") || "Shared context"}
                          </div>
                        </div>
                        <span
                          className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                          style={{ backgroundColor: tone.soft, color: tone.base }}
                        >
                          {Math.round(link.strength * 100)}%
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </aside>
      ) : null}
        </div>
      </div>
    </>
  );
}
