// The inverse of build.ts's toSkeleton: turn a serialized Excalidraw scene back
// into a typed DiagramSpec, so the typed graph — not the opaque .excalidraw blob
// — is the reviewable, diffable, git-committable source of truth.
//
// Pure + deterministic. Imports ONLY TYPES from spec.ts (erased at build), so it
// pulls in neither @excalidraw/element nor dagre — keeping the `@kindraw/client/
// scene/extract` app alias lean. Operates on plain serialized element shapes.
//
// Lossy boundaries are EXPLICIT (and reported as warnings): only
// rectangle/diamond/ellipse map to nodes; edges come only from arrows bound to
// two included nodes; non-default/valid colors and links survive; everything
// else is counted into an "omitted" warning. Generated ids are remapped to clean
// sequential ids (n0,n1…/g0,g1…) so the output ALWAYS passes validateDiagramSpec
// regardless of the opaque ids in the canvas.

import type {
  DiagramSpec,
  DiagramNode,
  DiagramEdge,
  DiagramGroup,
  NodeShape,
} from "./spec.js";

export type RawSceneElement = {
  id: string;
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  strokeColor?: string;
  backgroundColor?: string;
  strokeStyle?: string;
  link?: string | null;
  text?: string;
  /** The unwrapped source text — `text` carries display line-wrapping we must not keep. */
  originalText?: string;
  containerId?: string | null;
  startBinding?: { elementId?: string } | null;
  endBinding?: { elementId?: string } | null;
  frameId?: string | null;
  name?: string | null;
  customData?: Record<string, unknown> | null;
  isDeleted?: boolean;
};

export type ExtractWarning = {
  code:
    | "omitted-elements"
    | "invalid-color"
    | "invalid-link"
    | "free-arrow"
    | "label-truncated";
  message: string;
  count?: number;
};

export type ExtractDiagramSpecResult = {
  spec: DiagramSpec;
  warnings: ExtractWarning[];
};

// Excalidraw assigns these to every element even when our skeleton omitted them,
// so we drop them on the way back — a node without a spec color must round-trip
// to a node without a spec color (and identical rebuild). Sticky defaults are
// implied by shape:"sticky", so they're dropped too.
const DEFAULT_STROKE = "#1e1e1e";
const DEFAULT_BACKGROUND = "transparent";
const STICKY_BACKGROUND = "#ffec99";
const STICKY_STROKE = "transparent";

const MAX_LABEL_LEN = 2000;

const NODE_TYPES: ReadonlySet<string> = new Set([
  "rectangle",
  "diamond",
  "ellipse",
]);

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const isValidColor = (v: string): boolean =>
  v === "transparent" || HEX_COLOR_RE.test(v);

const KINDRAW_SECTION_LINK_RE =
  /^kindraw:\/\/section\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
const isValidNodeLink = (v: string): boolean => {
  if (v.startsWith("kindraw://section/")) {
    return KINDRAW_SECTION_LINK_RE.test(v);
  }
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Extract a typed DiagramSpec from serialized Excalidraw elements. Returns null
 * when no node-shaped element is present (nothing to describe). Deterministic:
 * ids are assigned in array order, so repeated exports of the same scene yield
 * identical specs.
 */
export const extractDiagramSpec = (
  elements: readonly RawSceneElement[],
): ExtractDiagramSpecResult | null => {
  const live = elements.filter((e) => !e.isDeleted);
  const warnings: ExtractWarning[] = [];

  // Bound text → its container's label. Prefer `originalText` (the unwrapped
  // source); `text` carries display line-wrapping convert inserts to fit the box.
  const labelByContainer = new Map<string, string>();
  for (const el of live) {
    if (el.type === "text" && typeof el.containerId === "string") {
      const label =
        typeof el.originalText === "string" ? el.originalText : el.text;
      if (typeof label === "string") {
        labelByContainer.set(el.containerId, label);
      }
    }
  }

  const nodeEls = live.filter((e) => NODE_TYPES.has(e.type));
  if (nodeEls.length === 0) {
    return null;
  }

  // Remap opaque element ids to clean, validateDiagramSpec-safe sequential ids.
  const nodeIdMap = new Map<string, string>();
  nodeEls.forEach((el, i) => nodeIdMap.set(el.id, `n${i}`));

  const frameEls = live.filter((e) => e.type === "frame");
  const groupIdMap = new Map<string, string>();
  frameEls.forEach((el, i) => groupIdMap.set(el.id, `g${i}`));
  const groups: DiagramGroup[] = frameEls.map((el, i) => {
    const g: DiagramGroup = { id: `g${i}` };
    if (typeof el.name === "string" && el.name.length > 0) {
      g.label = el.name;
    }
    return g;
  });

  let truncated = 0;
  let badColor = 0;
  let badLink = 0;

  const nodes: DiagramNode[] = nodeEls.map((el) => {
    const isSticky = el.customData?.kindrawStickyNote === true;
    const shape: NodeShape = isSticky ? "sticky" : (el.type as NodeShape);
    let label = labelByContainer.get(el.id) ?? "";
    if (label.length > MAX_LABEL_LEN) {
      label = label.slice(0, MAX_LABEL_LEN);
      truncated += 1;
    }
    const node: DiagramNode = { id: nodeIdMap.get(el.id)!, label, shape };

    if (typeof el.frameId === "string" && groupIdMap.has(el.frameId)) {
      node.group = groupIdMap.get(el.frameId)!;
    }

    // Colors: keep only valid, non-default ones (and skip a sticky's implied
    // defaults). Invalid colors are dropped with a warning, never serialized.
    const stickyStrokeDefault = isSticky && el.strokeColor === STICKY_STROKE;
    if (
      typeof el.strokeColor === "string" &&
      el.strokeColor !== DEFAULT_STROKE &&
      !stickyStrokeDefault
    ) {
      if (isValidColor(el.strokeColor)) {
        node.strokeColor = el.strokeColor;
      } else {
        badColor += 1;
      }
    }
    const stickyBgDefault =
      isSticky && el.backgroundColor === STICKY_BACKGROUND;
    if (
      typeof el.backgroundColor === "string" &&
      el.backgroundColor !== DEFAULT_BACKGROUND &&
      !stickyBgDefault
    ) {
      if (isValidColor(el.backgroundColor)) {
        node.backgroundColor = el.backgroundColor;
      } else {
        badColor += 1;
      }
    }

    if (typeof el.link === "string" && el.link.length > 0) {
      if (isValidNodeLink(el.link)) {
        node.link = el.link;
      } else {
        badLink += 1;
      }
    }

    return node;
  });

  // Edges: only arrows bound to TWO included nodes. Anything else is a free
  // arrow (v1 doesn't infer endpoints by proximity) → dropped with a warning.
  const edges: DiagramEdge[] = [];
  let freeArrows = 0;
  for (const el of live) {
    if (el.type !== "arrow") {
      continue;
    }
    const from = el.startBinding?.elementId;
    const to = el.endBinding?.elementId;
    if (!from || !to || !nodeIdMap.has(from) || !nodeIdMap.has(to)) {
      freeArrows += 1;
      continue;
    }
    const edge: DiagramEdge = {
      from: nodeIdMap.get(from)!,
      to: nodeIdMap.get(to)!,
    };
    let label = labelByContainer.get(el.id);
    if (typeof label === "string" && label.length > 0) {
      if (label.length > MAX_LABEL_LEN) {
        label = label.slice(0, MAX_LABEL_LEN);
        truncated += 1;
      }
      edge.label = label;
    }
    if (el.strokeStyle === "dashed" || el.strokeStyle === "dotted") {
      edge.style = el.strokeStyle;
    }
    edges.push(edge);
  }

  // Count anything with no spec equivalent: images, lines, freedraw,
  // embeddables/iframes, and standalone text (text with no container).
  let omitted = 0;
  for (const el of live) {
    if (NODE_TYPES.has(el.type) || el.type === "frame" || el.type === "arrow") {
      continue;
    }
    if (el.type === "text" && typeof el.containerId === "string") {
      continue; // a bound label — consumed above (or its container was dropped)
    }
    omitted += 1;
  }

  if (omitted > 0) {
    warnings.push({
      code: "omitted-elements",
      count: omitted,
      message:
        `${omitted} element(s) with no DiagramSpec equivalent ` +
        `(image/line/freedraw/embeddable/standalone text) were omitted.`,
    });
  }
  if (freeArrows > 0) {
    warnings.push({
      code: "free-arrow",
      count: freeArrows,
      message:
        `${freeArrows} arrow(s) not bound to two nodes were dropped ` +
        `(endpoint inference is not attempted in v1).`,
    });
  }
  if (badColor > 0) {
    warnings.push({
      code: "invalid-color",
      count: badColor,
      message: `${badColor} invalid color value(s) were dropped.`,
    });
  }
  if (badLink > 0) {
    warnings.push({
      code: "invalid-link",
      count: badLink,
      message: `${badLink} invalid link(s) were dropped.`,
    });
  }
  if (truncated > 0) {
    warnings.push({
      code: "label-truncated",
      count: truncated,
      message: `${truncated} label(s) were truncated to ${MAX_LABEL_LEN} chars.`,
    });
  }

  const spec: DiagramSpec = { nodes, edges };
  if (groups.length > 0) {
    spec.groups = groups;
  }
  return { spec, warnings };
};
