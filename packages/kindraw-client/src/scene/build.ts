// The deterministic scene builder. Pipeline:
//   spec → validate/normalize → layout (dagre/elk) → skeleton →
//   convertToExcalidrawElements → reanchor arrows → serialize.
//
// DOM-free: we register a custom text metrics provider so
// convertToExcalidrawElements never reaches for document.createElement.
//
// NOTE: setCustomTextMetricsProvider sets a module-level singleton inside
// @excalidraw/element. In the MCP/CLI process this is single-purpose and fine.
// If @kindraw/client/generate (mermaid) and this module ran in the SAME
// process, our DOM-free provider would also serve mermaid's conversion —
// which is strictly better than jsdom's text shim, so it's harmless.

import {
  convertToExcalidrawElements,
  setCustomTextMetricsProvider,
} from "@excalidraw/element";

import { reanchorArrows } from "../reanchor.js";
import { layoutNodesAsync, type PlacedNode } from "./layout.js";
import { NodeTextMetricsProvider } from "./textMetrics.js";
import {
  validateDiagramSpec,
  type DiagramSpec,
  type NormalizedSpec,
} from "./spec.js";

export type BuildResult = {
  /** Serialized .excalidraw JSON string (the same envelope createDrawing accepts). */
  content: string;
  /** Number of visible elements in the scene. */
  elementCount: number;
};

// Additive, optional inputs that let a scene carry template background elements
// and embedded icon images without changing the default (back-compat) behavior.
export type BuildSceneExtras = {
  /**
   * Pre-serialized template elements to PREPEND (already excalidraw elements,
   * e.g. from buildFromSkeletons). They render BEHIND the laid-out scene.
   */
  templateElements?: ExEl[];
  /**
   * Image skeletons (icons, from composeIconImages) to APPEND. They are
   * converted alongside the scene — no layout, no reanchor — then stabilized.
   */
  iconImages?: Array<Record<string, unknown>>;
  /** Files map to merge into the envelope (icon dataURLs). */
  files?: Record<string, unknown>;
};

// Register the DOM-free provider exactly once, before any conversion. The
// provider is cheap + stateless (its canvas context is lazily memoized), so a
// single shared instance is all we need. (textMetrics.ts does NOT export its
// internal sharedProvider, so we construct our own here — the cleaner option.)
let providerInstalled = false;
export const ensureProvider = (): void => {
  if (!providerInstalled) {
    setCustomTextMetricsProvider(new NodeTextMetricsProvider());
    providerInstalled = true;
  }
};

// convertToExcalidrawElements builds a temporary Scene, whose index validation
// reads `window?.DEBUG_FRACTIONAL_INDICES`. In plain Node `window` is undeclared
// (not just undefined), so that bare reference throws a ReferenceError — the `?.`
// only guards null/undefined *values*, not an undeclared identifier. We define a
// MINIMAL window object exposing only DEBUG_FRACTIONAL_INDICES — deliberately NOT
// `globalThis`, which would make `typeof window !== "undefined"` true and flip
// browser-only branches in bundled modules (e.g. colors.ts allocates a browser
// cache). This is the DOM-free counterpart to what jsdom provides on the mermaid
// path; it does not pull in jsdom. Idempotent + non-destructive (never clobbers a
// real window in jsdom/electron/browser).
export const ensureWindowShim = (): void => {
  const g = globalThis as { window?: unknown };
  if (typeof g.window === "undefined") {
    g.window = { DEBUG_FRACTIONAL_INDICES: false };
  }
};

const LABEL_FONT_SIZE = 20;

// Map our edge style to Excalidraw strokeStyle (identity for the values we
// accept; "solid" is Excalidraw's default so we omit it).
const STROKE_STYLE = {
  solid: "solid",
  dashed: "dashed",
  dotted: "dotted",
} as const;

const toSkeleton = (
  placed: PlacedNode[],
  spec: NormalizedSpec,
): Array<Record<string, unknown>> => {
  const skeleton: Array<Record<string, unknown>> = [];

  for (const node of placed) {
    skeleton.push({
      type: node.shape,
      id: node.id, // stable id → deterministic, and arrows bind by id
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      label: { text: node.label, fontSize: LABEL_FONT_SIZE },
      ...(node.strokeColor ? { strokeColor: node.strokeColor } : {}),
      ...(node.backgroundColor
        ? { backgroundColor: node.backgroundColor }
        : {}),
      // Conditional spread so link-less nodes serialize identically to before
      // (determinism). Validated in validateDiagramSpec; passes through
      // convertToExcalidrawElements untouched (newElement({...element})).
      ...(node.link ? { link: node.link } : {}),
      roundness: node.shape === "rectangle" ? { type: 3 } : null,
    });
  }

  spec.edges.forEach((edge, i) => {
    skeleton.push({
      type: "arrow",
      id: `arrow-${i}`,
      x: 0,
      y: 0,
      start: { id: edge.from },
      end: { id: edge.to },
      ...(edge.label ? { label: { text: edge.label } } : {}),
      ...(edge.style && edge.style !== "solid"
        ? { strokeStyle: STROKE_STYLE[edge.style] }
        : {}),
    });
  });

  return skeleton;
};

export type ExEl = {
  id: string;
  type: string;
  containerId?: string | null;
  boundElements?: Array<{ id: string; type: string }> | null;
  [key: string]: unknown;
};

// Bound text elements are created internally by convertToExcalidrawElements
// with random ids (randomId()), even under regenerateIds:false. Those random
// ids surface in the text element's `id`/`containerId` and the container's
// `boundElements`, breaking determinism. We rename each such text id to a
// stable, content-derived id (`text-<containerId>`) and rewrite every
// reference so identical specs serialize identically.
const canonicalizeBoundTextIds = (elements: ExEl[]): void => {
  const idMap = new Map<string, string>();
  for (const el of elements) {
    if (el.type === "text" && typeof el.containerId === "string") {
      const stable = `text-${el.containerId}`;
      idMap.set(el.id, stable);
      el.id = stable;
    }
  }
  if (idMap.size === 0) {
    return;
  }
  for (const el of elements) {
    if (Array.isArray(el.boundElements)) {
      for (const bound of el.boundElements) {
        const mapped = idMap.get(bound.id);
        if (mapped) {
          bound.id = mapped;
        }
      }
    }
  }
};

// Strip non-deterministic metadata so identical specs serialize identically.
// These fields are recomputed by Excalidraw on load, so zeroing them is safe.
export const stabilize = (elements: ExEl[]): ExEl[] => {
  canonicalizeBoundTextIds(elements);
  for (const el of elements) {
    el.seed = 1;
    el.versionNonce = 1;
    el.version = 1;
    el.updated = 1;
  }
  return elements;
};

// Largest (y + height) across a set of serialized Excalidraw elements, i.e. the
// content's bottom edge. Used to place an icon grid BELOW existing content so
// node-less icons never render on top of the diagram (BizLogic MEDIUM-1).
// Pure + deterministic + HTTP-free: callers JSON.parse a built scene's
// `elements` (or pass already-parsed elements) and feed them here. Returns 0 for
// an empty set, so an icon-only canvas still starts its grid at the origin.
export const sceneMaxY = (
  elements: Array<{ y?: unknown; height?: unknown }>,
): number => {
  let maxY = 0;
  for (const el of elements) {
    const y = typeof el.y === "number" ? el.y : 0;
    const h = typeof el.height === "number" ? el.height : 0;
    const bottom = y + h;
    if (bottom > maxY) {
      maxY = bottom;
    }
  }
  return maxY;
};

/**
 * Build a complete Excalidraw scene from a structured DiagramSpec.
 *
 * Validates + normalizes the spec, lays it out with real spacing (dagre by
 * default, elk when requested), converts to Excalidraw elements DOM-free,
 * re-anchors bound arrows border-to-border, and serializes to the .excalidraw
 * envelope. Deterministic: the same spec always yields identical content.
 */
export const buildScene = async (
  rawSpec: DiagramSpec,
  extras?: BuildSceneExtras,
): Promise<BuildResult> => {
  // MUST come first: removes the document.createElement("canvas") dependency.
  ensureProvider();
  // Make the Scene's index validation safe in plain Node (no `window`).
  ensureWindowShim();

  const spec = validateDiagramSpec(rawSpec);

  const placed = await layoutNodesAsync(spec);
  const skeleton = toSkeleton(placed, spec);

  const elements = convertToExcalidrawElements(skeleton, {
    regenerateIds: false,
  });

  // Deterministically connect arrows border-to-border using real positions.
  reanchorArrows(elements as unknown as Parameters<typeof reanchorArrows>[0]);

  const visible = elements.filter((el) => !el.isDeleted);
  stabilize(visible as unknown as ExEl[]);

  // Convert icon image skeletons SEPARATELY (no layout, no reanchor) and
  // stabilize them too, so the whole scene stays deterministic. Their ids use a
  // collision-free "icon-" prefix; the reciprocal guarantee that USER spec ids
  // can't start with "icon-" is enforced by RESERVED_ID_PREFIX_RE in spec.ts
  // (which reserves text-/arrow-/tpl-/icon-, BizLogic LOW-1).
  let iconEls: ExEl[] = [];
  if (extras?.iconImages?.length) {
    const converted = convertToExcalidrawElements(extras.iconImages as never, {
      regenerateIds: false,
    });
    iconEls = (converted as unknown as ExEl[]).filter(
      (el) => !(el as { isDeleted?: boolean }).isDeleted,
    );
    stabilize(iconEls);
  }

  // Template elements are already serialized (from buildFromSkeletons) — just
  // drop any deleted ones and PREPEND so they render behind the scene.
  const templateEls = (extras?.templateElements ?? []).filter(
    (el) => !(el as { isDeleted?: boolean }).isDeleted,
  );

  const allElements = [
    ...templateEls,
    ...(visible as unknown as ExEl[]),
    ...iconEls,
  ];

  const content = JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "@kindraw/client",
    elements: allElements,
    appState: { viewBackgroundColor: "#ffffff", gridSize: null },
    // Spread of `{}` when no files given keeps the back-compat `files:{}` shape.
    files: { ...(extras?.files ?? {}) },
  });

  return { content, elementCount: allElements.length };
};
