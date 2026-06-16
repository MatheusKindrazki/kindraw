import fs from "node:fs";

import { KindrawClient } from "@kindraw/client";

import { requireClient } from "../client.js";

const USAGE =
  "Usage: kindraw generate (--mermaid <file|-> | --spec <file|->) [--title <title>]";

// Read a source from a file path or stdin ("-").
const readSource = (location: string): string =>
  location === "-"
    ? fs.readFileSync(0, "utf8")
    : fs.readFileSync(location, "utf8");

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

  const title = args.title || "Untitled drawing";
  const result = await client.createDrawing({ title, content });

  console.log(`Created "${title}" (${elementCount} elements)`);
  console.log(result.url);
};
