// Re-anchor arrows deterministically.
//
// In Node, mermaid's edge geometry is computed from getBBox(), which jsdom only
// approximates — so arrows from the conversion can land on wrong points. But
// each arrow carries startBinding/endBinding with the ids of the nodes it
// connects. We rewrite every bound arrow as a straight line between the real
// borders of those two nodes, ignoring mermaid's (approximate) points. The
// connection is then always correct, regardless of SVG layout in jsdom.

type Pt = [number, number];

type AnyEl = {
  id: string;
  type: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: Pt[];
  startBinding?: { elementId?: string } | null;
  endBinding?: { elementId?: string } | null;
  isDeleted?: boolean;
};

const NODE_TYPES = new Set([
  "rectangle",
  "diamond",
  "ellipse",
  "image",
  "text",
]);

const center = (n: AnyEl): Pt => [
  n.x + (n.width ?? 0) / 2,
  n.y + (n.height ?? 0) / 2,
];

// Point on the border of node `n`'s bounding box along the ray from the node
// center toward `toward`. Treats every node as its bounding rectangle, which is
// a good, stable approximation (incl. diamonds/ellipses) for connector anchors.
const borderPoint = (n: AnyEl, toward: Pt): Pt => {
  const [cx, cy] = center(n);
  const halfW = (n.width ?? 0) / 2;
  const halfH = (n.height ?? 0) / 2;
  let dx = toward[0] - cx;
  let dy = toward[1] - cy;
  if (dx === 0 && dy === 0) {
    return [cx, cy];
  }
  // Scale the direction so it just touches the rectangle edge.
  const scaleX = halfW > 0 ? Math.abs(dx) / halfW : Infinity;
  const scaleY = halfH > 0 ? Math.abs(dy) / halfH : Infinity;
  const scale = Math.max(scaleX, scaleY);
  if (scale === 0 || !isFinite(scale)) {
    return [cx, cy];
  }
  dx /= scale;
  dy /= scale;
  return [cx + dx, cy + dy];
};

/**
 * Rewrite bound arrows to connect the real borders of their start/end nodes.
 * Mutates and returns the same array. Arrows without two resolvable endpoints
 * are left untouched.
 */
export const reanchorArrows = <T extends AnyEl>(elements: T[]): T[] => {
  const byId = new Map<string, AnyEl>();
  for (const el of elements) {
    if (el.id && NODE_TYPES.has(el.type)) {
      byId.set(el.id, el);
    }
  }

  for (const el of elements) {
    if (el.type !== "arrow" && el.type !== "line") {
      continue;
    }
    const startId = el.startBinding?.elementId;
    const endId = el.endBinding?.elementId;
    if (!startId || !endId) {
      continue; // free-floating arrow: leave as-is
    }
    const startNode = byId.get(startId);
    const endNode = byId.get(endId);
    if (!startNode || !endNode) {
      continue;
    }

    const start = borderPoint(startNode, center(endNode));
    const end = borderPoint(endNode, center(startNode));

    // Excalidraw stores points relative to the element's x/y.
    el.x = start[0];
    el.y = start[1];
    el.points = [
      [0, 0],
      [end[0] - start[0], end[1] - start[1]],
    ];
    el.width = Math.abs(end[0] - start[0]);
    el.height = Math.abs(end[1] - start[1]);
  }

  return elements;
};
