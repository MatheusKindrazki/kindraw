// Idempotent regenerate of an existing drawing canvas from a DiagramSpec — the
// "docs-as-code for diagrams" primitive. An agent (or CI) re-runs the
// deterministic builder against a spec and PUTs the result, so the architecture
// diagram stays in lockstep with the code and stops rotting.
//
// Because buildScene is deterministic, the regenerated canvas is byte-stable and
// diffable; `check` mode detects drift (a rotted diagram) WITHOUT writing, which
// is the CI gate. Decoupled from the HTTP client via a structural interface (the
// real KindrawClient satisfies it), mirroring how composeHybrid takes a client.

import { buildScene } from "./build.js";

import type { DiagramSpec } from "./spec.js";

// Minimal structural surface syncScene needs — KindrawClient satisfies it
// (getItem → { item: { kind }, content }; updateContent(itemId, content)).
export type SceneSyncClient = {
  getItem(itemId: string): Promise<{ item: { kind: string }; content: string }>;
  updateContent(itemId: string, content: string): Promise<void>;
};

export type SyncSceneInput = {
  itemId: string;
  spec: DiagramSpec;
  /** Detect drift only: never writes; sets a non-zero exit upstream. */
  check?: boolean;
};

export type SyncSceneResult = {
  itemId: string;
  /** The freshly built, deterministic scene content. */
  content: string;
  elementCount: number;
  /** The live canvas already byte-matches the spec output (no write needed). */
  unchanged: boolean;
  /** A PUT happened (false in check mode or when unchanged). */
  wrote: boolean;
};

export const syncScene = async (
  client: SceneSyncClient,
  { itemId, spec, check = false }: SyncSceneInput,
): Promise<SyncSceneResult> => {
  const { item, content: existing } = await client.getItem(itemId);

  // Kind guard: never clobber a doc. A hybrid id 404s on the item endpoint —
  // callers pass the hybrid's drawing item id, which resolves as a drawing.
  if (item.kind !== "drawing") {
    throw new Error(
      `kindraw_sync_scene targets a drawing canvas, but item "${itemId}" is a ` +
        `"${item.kind}". Pass a drawing id (for a hybrid, its drawing item id).`,
    );
  }

  // buildScene validates the spec and throws BEFORE any write, so an invalid
  // spec can never produce a partial/corrupt canvas. Deterministic output makes
  // the byte-equality check below a reliable idempotency signal.
  const built = await buildScene(spec);
  const unchanged = existing === built.content;

  let wrote = false;
  if (!check && !unchanged) {
    // POLICY: the spec is the source of truth — a non-check sync OVERWRITES the
    // live canvas, including any manual edits. Use check mode to detect drift
    // without writing (the safe CI adoption path).
    await client.updateContent(itemId, built.content);
    wrote = true;
  }

  return {
    itemId,
    content: built.content,
    elementCount: built.elementCount,
    unchanged,
    wrote,
  };
};
