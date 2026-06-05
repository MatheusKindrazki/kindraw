import fs from "node:fs";

import { KindrawClient } from "@kindraw/client";

import { requireClient } from "../client.js";

// `kindraw generate --mermaid <file|-> [--title T]`
// Reads Mermaid (from a file or stdin), converts it locally, and creates a
// drawing in the user's Kindraw workspace.
export const generate = async (args: {
  mermaid?: string;
  title?: string;
}): Promise<void> => {
  const client: KindrawClient = requireClient();

  if (!args.mermaid) {
    throw new Error(
      "Usage: kindraw generate --mermaid <file|-> [--title <title>]",
    );
  }

  const mermaid =
    args.mermaid === "-"
      ? fs.readFileSync(0, "utf8")
      : fs.readFileSync(args.mermaid, "utf8");

  // Heavy generation is opt-in (mermaid + jsdom + canvas) — loaded only here.
  const { generateExcalidrawFromMermaid } = await import(
    "@kindraw/client/generate"
  );
  const { content, elementCount } = await generateExcalidrawFromMermaid(mermaid);
  const title = args.title || "Untitled drawing";
  const result = await client.createDrawing({ title, content });

  console.log(`Created "${title}" (${elementCount} elements)`);
  console.log(result.url);
};
