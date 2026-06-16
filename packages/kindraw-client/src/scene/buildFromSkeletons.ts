// Serialize convertToExcalidrawElements INPUT skeletons (e.g. server templates)
// into the .excalidraw envelope — WITHOUT reanchorArrows. Template arrows are
// intentionally UNBOUND: they carry explicit absolute x/y + relative points[]
// and NO start/end bindings (verified against workers/api/src/templates.ts).
// reanchorArrows assumes BOUND arrows and would displace them, so we skip it.
//
// We namespace ingested ids with a "tpl-" prefix (collision-free:
// RESERVED_ID_PREFIX_RE forbids text-/arrow- but NOT tpl-, verified C8) so
// template ids never clash with user nodes or generated icon ids. Arrow
// skeletons have no id, so they are left untouched by the namespacer.
//
// Output is deterministic (same skeletons -> identical content) via stabilize.

import { convertToExcalidrawElements } from "@excalidraw/element";

import {
  ensureProvider,
  ensureWindowShim,
  stabilize,
  type ExEl,
} from "./build.js";

export type BuildFromSkeletonsResult = {
  /** Serialized .excalidraw JSON string (the envelope createDrawing accepts). */
  content: string;
  /** Number of visible elements in the scene. */
  elementCount: number;
  /** The serialized element objects (for merging into a larger scene). */
  elements: ExEl[];
};

// Prefix string ids with "tpl-". Skeletons without an id (e.g. template arrows)
// pass through unchanged.
const namespaceIds = (
  skeletons: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> =>
  skeletons.map((s) => ({
    ...s,
    ...(typeof s.id === "string" ? { id: `tpl-${s.id}` } : {}),
  }));

export const buildFromSkeletons = async (
  skeletons: Array<Record<string, unknown>>,
  opts?: { files?: Record<string, unknown> },
): Promise<BuildFromSkeletonsResult> => {
  // MUST come first: removes the document.createElement("canvas") dependency.
  ensureProvider();
  // Make the Scene's index validation safe in plain Node (no `window`).
  ensureWindowShim();

  const elements = convertToExcalidrawElements(
    namespaceIds(skeletons) as never,
    { regenerateIds: false },
  );
  // NO reanchorArrows here — template arrows are explicit/unbound.
  const visible = (elements as unknown as ExEl[]).filter(
    (el) => !(el as { isDeleted?: boolean }).isDeleted,
  );
  stabilize(visible);

  const content = JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "@kindraw/client",
    elements: visible,
    appState: { viewBackgroundColor: "#ffffff", gridSize: null },
    files: opts?.files ?? {},
  });

  return { content, elementCount: visible.length, elements: visible };
};
