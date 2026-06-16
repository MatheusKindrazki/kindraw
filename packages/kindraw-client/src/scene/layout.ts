// Layout engine: turns a NormalizedSpec into positioned nodes with real
// spacing. dagre is the default (synchronous, no DOM). elk is opt-in (added
// in a later task) for orthogonal routing on complex architecture diagrams.

import dagre from "dagre";

import { measureLabel } from "./textMetrics.js";
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
};

// Default font size used to measure labels. Matches Excalidraw's medium size.
const LABEL_FONT_SIZE = 20;

// Generous separations so the canvas never looks cramped (the whole point).
const RANK_SEP = 80; // distance between ranks (along layout direction)
const NODE_SEP = 60; // distance between nodes in the same rank
const EDGE_SEP = 40;

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

  const sized = new Map<string, { width: number; height: number }>();
  for (const node of spec.nodes) {
    const { width, height } = measureLabel(node.label, LABEL_FONT_SIZE);
    sized.set(node.id, { width, height });
    g.setNode(node.id, { width, height });
  }
  spec.edges.forEach((edge, i) => {
    // Unique name keeps multigraph edges distinct & deterministic.
    g.setEdge(edge.from, edge.to, {}, `e${i}`);
  });

  dagre.layout(g);

  return spec.nodes.map((node) => {
    const pos = g.node(node.id);
    const size = sized.get(node.id)!;
    return {
      id: node.id,
      label: node.label,
      shape: node.shape,
      // dagre pos.x/pos.y are centers; convert to top-left.
      x: Math.round(pos.x - size.width / 2),
      y: Math.round(pos.y - size.height / 2),
      width: size.width,
      height: size.height,
      strokeColor: node.strokeColor,
      backgroundColor: node.backgroundColor,
      group: node.group,
    };
  });
};

/**
 * Public layout entry. Dispatches to the configured engine. (elk added later.)
 */
export const layoutNodes = (spec: NormalizedSpec): PlacedNode[] => {
  // elk is async + opt-in; for the sync API we only support dagre here. The
  // async elk path is exposed separately (layoutNodesAsync) in a later task.
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

  const sized = new Map<string, { width: number; height: number }>();
  const children = spec.nodes.map((node) => {
    const { width, height } = measureLabel(node.label, LABEL_FONT_SIZE);
    sized.set(node.id, { width, height });
    return { id: node.id, width, height };
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

  const laid = (await elk.layout(graph)) as {
    children?: Array<{ id: string; x?: number; y?: number }>;
  };
  const posById = new Map(
    (laid.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]),
  );

  return spec.nodes.map((node) => {
    const size = sized.get(node.id)!;
    const pos = posById.get(node.id) ?? { x: 0, y: 0 };
    return {
      id: node.id,
      label: node.label,
      shape: node.shape,
      x: Math.round(pos.x), // elk already returns top-left corners
      y: Math.round(pos.y),
      width: size.width,
      height: size.height,
      strokeColor: node.strokeColor,
      backgroundColor: node.backgroundColor,
      group: node.group,
    };
  });
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
