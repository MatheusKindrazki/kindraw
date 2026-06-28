import { requireClient } from "../client.js";

import { readSource } from "./generate.js";

import type { KindrawClient } from "@kindraw/client";

const USAGE = "Usage: kindraw sync <itemId> --spec <file|-> [--check] [--json]";

// `kindraw sync <itemId> --spec <file|-> [--check] [--json]`
//
// Regenerate an existing drawing canvas from a DiagramSpec (docs-as-code for
// diagrams). Deterministic layout → byte-stable output, so this is safe to run
// in CI. `--check` detects drift (a rotted diagram) and exits non-zero WITHOUT
// writing — the CI gate. A non-check sync OVERWRITES the live canvas.
export const sync = async (args: {
  itemId?: string;
  spec?: string;
  check?: boolean;
  json?: boolean;
}): Promise<void> => {
  if (!args.itemId) {
    throw new Error(`Provide the drawing id.\n${USAGE}`);
  }
  if (!args.spec) {
    throw new Error(`Provide --spec <file|->.\n${USAGE}`);
  }

  const client: KindrawClient = requireClient();
  const raw = readSource(args.spec);
  let spec: unknown;
  try {
    spec = JSON.parse(raw);
  } catch {
    throw new Error("--spec must be valid JSON (a DiagramSpec).");
  }

  // Opt-in scene path (bundles @excalidraw/element + dagre) — loaded only here.
  const { syncScene } = await import("@kindraw/client/scene");
  const res = await syncScene(client, {
    itemId: args.itemId,
    spec: spec as Parameters<typeof syncScene>[1]["spec"],
    check: args.check,
  });

  if (args.json) {
    console.log(
      JSON.stringify({
        itemId: res.itemId,
        elementCount: res.elementCount,
        unchanged: res.unchanged,
        wrote: res.wrote,
        check: !!args.check,
      }),
    );
  } else if (args.check) {
    console.log(
      res.unchanged
        ? `In sync: "${res.itemId}" matches the spec (${res.elementCount} elements).`
        : `DRIFT: "${res.itemId}" differs from the spec (${res.elementCount} elements).`,
    );
  } else {
    console.log(
      res.unchanged
        ? `No change: "${res.itemId}" already matches the spec (${res.elementCount} elements).`
        : `Regenerated "${res.itemId}" (${res.elementCount} elements).`,
    );
  }

  // CI gate: drift detected in check mode → non-zero exit, no throw (a clean
  // drift signal, not an error). main() resolves and Node exits with this code.
  if (args.check && !res.unchanged) {
    process.exitCode = 1;
  }
};
