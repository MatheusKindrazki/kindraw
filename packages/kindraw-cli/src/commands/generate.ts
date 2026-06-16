import fs from "node:fs";

import { KindrawClient } from "@kindraw/client";

import { requireClient } from "../client.js";

const USAGE =
  "Usage: kindraw generate (--mermaid <file|-> | --spec <file|->) [--title <title>]";

// Cap the input we read (file or stdin) before parsing. Inputs are local but
// can be arbitrarily large (a generated file, a piped stream), and we'd
// otherwise buffer the whole thing into memory before any spec-level cap
// applies — a trivial local OOM. (Security H1.)
export const MAX_SPEC_BYTES = 5 * 1024 * 1024;

// Titles are forwarded verbatim to createDrawing; cap them so an oversized
// --title can't bloat the request. (Security H2.)
export const MAX_TITLE_LEN = 500;

// Read a source from a file path or stdin ("-"), bounded to MAX_SPEC_BYTES.
// Raw fs errors are suppressed so absolute paths aren't echoed back to the
// caller; only the size-cap message is surfaced as-is. (Security H1 + M1.)
export const readSource = (location: string): string => {
  try {
    if (location === "-") {
      const buf = fs.readFileSync(0);
      if (buf.byteLength > MAX_SPEC_BYTES) {
        throw new Error(
          `Input too large: ${buf.byteLength} bytes (max ${MAX_SPEC_BYTES}).`,
        );
      }
      return buf.toString("utf8");
    }
    const { size } = fs.statSync(location);
    if (size > MAX_SPEC_BYTES) {
      throw new Error(
        `Input file too large: ${size} bytes (max ${MAX_SPEC_BYTES}).`,
      );
    }
    return fs.readFileSync(location, "utf8");
  } catch (err) {
    if (err instanceof Error && /too large/.test(err.message)) {
      throw err;
    }
    throw new Error(
      location === "-"
        ? "Could not read input from stdin."
        : "Could not read the input file.",
    );
  }
};

// `kindraw generate (--mermaid <file|-> | --spec <file|->) [--title T]`
//
// Two input modes (exactly one required):
//   --mermaid  Mermaid text → Excalidraw (heavy: mermaid + jsdom + canvas).
//   --spec     A structured DiagramSpec JSON → laid-out Excalidraw scene
//              (dagre/elk, DOM-free). Preferred for rich, well-spaced diagrams.
export const generate = async (args: {
  mermaid?: string;
  spec?: string;
  title?: string;
}): Promise<void> => {
  const client: KindrawClient = requireClient();

  if (args.mermaid && args.spec) {
    throw new Error(
      `Provide only one of --mermaid or --spec, not both.\n${USAGE}`,
    );
  }
  if (!args.mermaid && !args.spec) {
    throw new Error(`Provide --mermaid or --spec.\n${USAGE}`);
  }

  let content: string;
  let elementCount: number;

  if (args.spec) {
    const raw = readSource(args.spec);
    let spec: unknown;
    try {
      spec = JSON.parse(raw);
    } catch {
      throw new Error("--spec must be valid JSON (a DiagramSpec).");
    }
    // Opt-in scene path (bundles @excalidraw/element + dagre) — loaded only here.
    const { buildScene } = await import("@kindraw/client/scene");
    ({ content, elementCount } = await buildScene(
      spec as Parameters<typeof buildScene>[0],
    ));
  } else {
    const mermaid = readSource(args.mermaid!);
    // Heavy generation is opt-in (mermaid + jsdom + canvas) — loaded only here.
    const { generateExcalidrawFromMermaid } = await import(
      "@kindraw/client/generate"
    );
    ({ content, elementCount } = await generateExcalidrawFromMermaid(mermaid));
  }

  const rawTitle = args.title || "Untitled drawing";
  // Cap the title length before it reaches createDrawing. (Security H2.)
  const title =
    rawTitle.length > MAX_TITLE_LEN ? rawTitle.slice(0, MAX_TITLE_LEN) : rawTitle;
  const result = await client.createDrawing({ title, content });

  console.log(`Created "${title}" (${elementCount} elements)`);
  console.log(result.url);
};
