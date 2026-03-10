import { serializeAsJSON } from "@excalidraw/excalidraw";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";

import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";

import type { KindrawItemKind } from "./types";

const EMPTY_DRAWING_CONTENT = serializeAsJSON(
  [],
  getDefaultAppState(),
  {},
  "local",
);
const EMPTY_DRAWING_DATA = JSON.parse(
  EMPTY_DRAWING_CONTENT,
) as ExcalidrawInitialDataState;

export const createInitialItemContent = (
  kind: KindrawItemKind,
  title: string,
) => (kind === "drawing" ? EMPTY_DRAWING_CONTENT : `# ${title}\n\n`);

export const parseDrawingContent = (
  content: string,
): ExcalidrawInitialDataState => {
  if (!content.trim()) {
    return EMPTY_DRAWING_DATA;
  }

  try {
    const parsed = JSON.parse(content) as ExcalidrawInitialDataState;
    return {
      elements: parsed.elements || EMPTY_DRAWING_DATA.elements,
      appState: parsed.appState || EMPTY_DRAWING_DATA.appState,
      files: parsed.files || {},
    };
  } catch (error) {
    console.warn("Failed to parse Kindraw drawing content:", error);
    return EMPTY_DRAWING_DATA;
  }
};
