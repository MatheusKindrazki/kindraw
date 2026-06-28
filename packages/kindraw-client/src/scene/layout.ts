// Layout engine: turns a NormalizedSpec into positioned nodes with real
// spacing. dagre is the default (synchronous, no DOM). elk is opt-in for
// orthogonal routing on complex architecture diagrams.

import dagre from "dagre";

import { measureLabel, measureSticky } from "./textMetrics.js";
import type { NormalizedSpec } from "./spec.js";

export type PlacedNode = {
  id: string;
  label: string;
  shape: NormalizedSpec["nodes"][number]["shape"];
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
  group?: string;
  link?: string;
};

type Size = { width: number; height: number };

// Default font size used to measure labels. Matches Excalidraw's medium size.
const LABEL_FONT_SIZE = 20;

// Generous separations so the canvas never looks cramped (the whole point).
const RANK_SEP = 80; // distance between ranks (along layout direction)
const NODE_SEP = 60; // distance between nodes in the same rank
const EDGE_SEP = 40;

// Fixed margin: after layout, the top-left-most node is translated to sit here.
// Both engines normalize to this so switching engine doesn't shift the diagram.
const ORIGIN_MARGIN = 20;

/**
 * Measure every node's box once. Shared by both layout engines so sizing stays
 * identical regardless of engine. (Code M2.)
 */
const measureAll = (spec: NormalizedSpec): Map<string, Size> => {
  const sized = new Map<string, Size>();
  for (const node of spec.nodes) {
    sized.set(
      node.id,
      node.shape === "sticky"
        ? measureSticky(node.label, LABEL_FONT_SIZE)
        : measureLabel(node.label, LABEL_FONT_SIZE),
    );
  }
  return sized;
};

/**
 * Build a PlacedNode from a spec node + its measured size + a top-left (x, y).
 * Coordinates are rounded for stable, integer output. (Code M2.)
 */
const toPlacedNode = (
  node: NormalizedSpec["nodes"][number],
  size: Size,
  x: number,
  y: number,
): PlacedNode => ({
  id: node.id,
  label: node.label,
  shape: node.shape,
  x: Math.round(x),
  y: Math.round(y),
  width: size.width,
  height: size.height,
  strokeColor: node.strokeColor,
  backgroundColor: node.backgroundColor,
  group: node.group,
  link: node.link,
});

/**
 * Translate all nodes so the top-left-most one sits at (ORIGIN_MARGIN,
 * ORIGIN_MARGIN). Keeps diagrams in a consistent, positive coordinate space and
 * makes the two engines produce the same origin. (Code M1.)
 */
const normalizeOrigin = (nodes: PlacedNode[]): PlacedNode[] => {
  if (nodes.length === 0) {
    return nodes;
  }
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  const dx = ORIGIN_MARGIN - minX;
  const dy = ORIGIN_MARGIN - minY;
  return nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy }));
};

/**
 * Run dagre and return positioned nodes. Node x/y are TOP-LEFT corners (dagre
 * gives centers; we convert). Deterministic for a given spec.
 */
export const layoutWithDagre = (spec: NormalizedSpec): PlacedNode[] => {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: spec.direction,
    ranksep: RANK_SEP,
    nodesep: NODE_SEP,
    edgesep: EDGE_SEP,
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const sized = measureAll(spec);
  for (const node of spec.nodes) {
    const size = sized.get(node.id)!;
    g.setNode(node.id, { width: size.width, height: size.height });
  }
  spec.edges.forEach((edge, i) => {
    // Unique name keeps multigraph edges distinct & deterministic.
    g.setEdge(edge.from, edge.to, {}, `e${i}`);
  });

  try {
    dagre.layout(g);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error("Layout failed: " + msg);
  }

  const placed = spec.nodes.map((node) => {
    const pos = g.node(node.id);
    const size = sized.get(node.id)!;
    if (!pos) {
      throw new Error(`Layout failed to place node "${node.id}".`);
    }
    // dagre pos.x/pos.y are centers; convert to top-left.
    return toPlacedNode(
      node,
      size,
      pos.x - size.width / 2,
      pos.y - size.height / 2,
    );
  });

  return normalizeOrigin(placed);
};

/**
 * Public layout entry. Dispatches to the configured engine. (elk is async, see
 * layoutNodesAsync.)
 */
export const layoutNodes = (spec: NormalizedSpec): PlacedNode[] => {
  // elk is async + opt-in; for the sync API we only support dagre here. The
  // async elk path is exposed separately (layoutNodesAsync).
  return layoutWithDagre(spec);
};

/**
 * elk layout (async). Orthogonal-friendly routing for complex diagrams.
 * Opt-in via spec.engine === "elk". Returns the same PlacedNode[] contract.
 */
export const layoutWithElk = async (
  spec: NormalizedSpec,
): Promise<PlacedNode[]> => {
  // elkjs is heavy; import it lazily so dagre-only callers don't pay for it.
  const ELK = (await import("elkjs")).default;
  const elk = new ELK();

  const sized = measureAll(spec);
  const children = spec.nodes.map((node) => {
    const size = sized.get(node.id)!;
    return { id: node.id, width: size.width, height: size.height };
  });

  const elkDirection =
    spec.direction === "LR"
      ? "RIGHT"
      : spec.direction === "RL"
      ? "LEFT"
      : spec.direction === "BT"
      ? "UP"
      : "DOWN";

  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": elkDirection,
      "elk.layered.spacing.nodeNodeBetweenLayers": String(RANK_SEP),
      "elk.spacing.nodeNode": String(NODE_SEP),
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children,
    edges: spec.edges.map((edge, i) => ({
      id: `e${i}`,
      sources: [edge.from],
      targets: [edge.to],
    })),
  };

  let laid: {
    children?: Array<{ id: string; x?: number; y?: number }>;
  };
  try {
    laid = (await elk.layout(graph)) as {
      children?: Array<{ id: string; x?: number; y?: number }>;
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error("Layout failed: " + msg);
  }

  const posById = new Map(
    (laid.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]),
  );

  const placed = spec.nodes.map((node) => {
    const size = sized.get(node.id)!;
    const pos = posById.get(node.id) ?? { x: 0, y: 0 };
    // elk already returns top-left corners.
    return toPlacedNode(node, size, pos.x, pos.y);
  });

  return normalizeOrigin(placed);
};

/**
 * Async layout entry: dispatches to elk when requested, else dagre.
 */
export const layoutNodesAsync = async (
  spec: NormalizedSpec,
): Promise<PlacedNode[]> => {
  if (spec.engine === "elk") {
    return layoutWithElk(spec);
  }
  return layoutWithDagre(spec);
};
