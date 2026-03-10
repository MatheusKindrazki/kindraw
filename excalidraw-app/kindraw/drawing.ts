import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { loadFromBlob } from "@excalidraw/excalidraw/data/blob";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";

import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

const EMPTY_DRAWING_CONTENT = serializeAsJSON(
  [],
  getDefaultAppState(),
  {},
  "local",
);

export const createEmptyDrawingContent = () => EMPTY_DRAWING_CONTENT;

export const parseDrawingContent = async (
  content: string,
): Promise<ExcalidrawInitialDataState | null> => {
  if (!content.trim()) {
    return null;
  }

  try {
    return await loadFromBlob(
      new Blob([content], {
        type: "application/vnd.excalidraw+json",
      }),
      null,
      null,
    );
  } catch {
    return null;
  }
};

export const serializeDrawingContent = (
  elements: readonly OrderedExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
) => serializeAsJSON(elements, appState, files, "local");
