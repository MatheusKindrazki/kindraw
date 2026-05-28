import { viewportCoordsToSceneCoords } from "@excalidraw/common";
import {
  convertToExcalidrawElements,
  getCommonBounds,
} from "@excalidraw/excalidraw";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { getTemplate } from "./templatesApi";

/**
 * Inserts a diagram template (a set of Excalidraw element skeletons served by
 * the worker) onto the canvas, centered on the current viewport.
 *
 * Insertion goes through the public imperative API:
 *  - `getTemplate(...)` fetches the element skeletons
 *  - `convertToExcalidrawElements(...)` builds full elements AND wires every
 *    binding (arrow <-> shape, container <-> bound text)
 *  - a single uniform (dx, dy) offset is applied to ALL elements, which keeps
 *    those bindings intact because they are positioned relative to one another
 *  - `excalidrawAPI.updateScene(...)` commits + selects the new elements
 *
 * NOTE: `addElementsFromPasteOrLibrary` (which would handle centering + id
 * regeneration) is NOT exposed on `ExcalidrawImperativeAPI`, so we replicate
 * the relevant parts here.
 */
export const insertTemplate = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  templateId: string,
  options?: { signal?: AbortSignal },
) => {
  const template = await getTemplate(templateId, { signal: options?.signal });

  const elements = convertToExcalidrawElements(
    template.elements as Parameters<typeof convertToExcalidrawElements>[0],
  );

  if (elements.length === 0) {
    return [] as ExcalidrawElement[];
  }

  const appState = excalidrawAPI.getAppState();
  const { x: centerX, y: centerY } = viewportCoordsToSceneCoords(
    {
      clientX: appState.width / 2 + appState.offsetLeft,
      clientY: appState.height / 2 + appState.offsetTop,
    },
    appState,
  );

  const [minX, minY, maxX, maxY] = getCommonBounds(elements);
  const groupCenterX = (minX + maxX) / 2;
  const groupCenterY = (minY + maxY) / 2;

  const dx = centerX - groupCenterX;
  const dy = centerY - groupCenterY;

  const translated = elements.map((element) => ({
    ...element,
    x: element.x + dx,
    y: element.y + dy,
  })) as ExcalidrawElement[];

  const selectedElementIds = translated.reduce<Record<string, true>>(
    (acc, element) => {
      acc[element.id] = true;
      return acc;
    },
    {},
  );

  excalidrawAPI.updateScene({
    elements: [...excalidrawAPI.getSceneElements(), ...translated],
    appState: {
      selectedElementIds,
    },
  });

  return translated;
};
