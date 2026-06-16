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

// Register the DOM-free provider exactly once, before any conversion. The
// provider is cheap + stateless (its canvas context is lazily memoized), so a
// single shared instance is all we need. (textMetrics.ts does NOT export its
// internal sharedProvider, so we construct our own here — the cleaner option.)
let providerInstalled = false;
const ensureProvider = (): void => {
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
const ensureWindowShim = (): void => {
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

type ExEl = {
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
const stabilize = (elements: ExEl[]): ExEl[] => {
  canonicalizeBoundTextIds(elements);
  for (const el of elements) {
    el.seed = 1;
    el.versionNonce = 1;
    el.version = 1;
    el.updated = 1;
  }
  return elements;
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

  const content = JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "@kindraw/client",
    elements: visible,
    appState: { viewBackgroundColor: "#ffffff", gridSize: null },
    files: {},
  });

  return { content, elementCount: visible.length };
};
