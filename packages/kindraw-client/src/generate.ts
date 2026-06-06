// Opt-in heavy entrypoint: converts Mermaid text into serialized Excalidraw
// content, in Node. Pulls in mermaid + jsdom + canvas + Excalidraw's element
// transform, so it lives in a separate subpath and is only imported when a
// caller actually needs to generate (not for plain CRUD).

import { ensureDom } from "./dom.js";
import { reanchorArrows } from "./reanchor.js";

export type GenerateResult = {
  content: string; // serialized .excalidraw JSON string
  elementCount: number;
};

/**
 * Convert a Mermaid definition into serialized Excalidraw content.
 * Mirrors the browser pipeline in excalidraw-app/kindraw/MarkdownPreview.tsx.
 */
export const generateExcalidrawFromMermaid = async (
  mermaid: string,
): Promise<GenerateResult> => {
  await ensureDom();

  // Imported after DOM bootstrap. Bundled by esbuild (see build.mjs).
  const { parseMermaidToExcalidraw } = await import(
    "@excalidraw/mermaid-to-excalidraw"
  );
  const { convertToExcalidrawElements } = await import("@excalidraw/element");

  const definition = mermaid.trim();
  let parsed;
  try {
    parsed = await parseMermaidToExcalidraw(definition);
  } catch {
    // Browser pipeline retries with double->single quotes; mirror that.
    parsed = await parseMermaidToExcalidraw(
      definition.replace(/"/g, "'"),
    );
  }

  const elements = convertToExcalidrawElements(parsed.elements, {
    regenerateIds: true,
  });

  // Deterministically connect arrows border-to-border using the real node
  // positions (jsdom's approximate getBBox leaves mermaid's edge points off).
  reanchorArrows(elements as unknown as Parameters<typeof reanchorArrows>[0]);

  const visible = elements.filter(
    (element: { isDeleted?: boolean }) => !element.isDeleted,
  );

  const content = JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "@kindraw/client",
    elements: visible,
    appState: { viewBackgroundColor: "#ffffff", gridSize: null },
    files: parsed.files || {},
  });

  return { content, elementCount: visible.length };
};
