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
