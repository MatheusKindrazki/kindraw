import { MIME_TYPES, viewportCoordsToSceneCoords } from "@excalidraw/common";
import { normalizeSVG } from "@excalidraw/element";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import {
  SVGStringToFile,
  generateIdFromFile,
  getDataURL,
} from "@excalidraw/excalidraw/data/blob";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { fetchIconSvg } from "./iconsApi";

const DEFAULT_ICON_SIZE = 100;

/**
 * Reads the intrinsic dimensions a normalized SVG advertises (normalizeSVG
 * guarantees a width/height/viewBox). Falls back to a square if parsing fails.
 */
const getSvgDimensions = (svgString: string) => {
  try {
    const doc = new DOMParser().parseFromString(svgString, MIME_TYPES.svg);
    const svg = doc.querySelector("svg");
    const width = Number.parseFloat(svg?.getAttribute("width") || "");
    const height = Number.parseFloat(svg?.getAttribute("height") || "");
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0) {
      const ratio = height / width;
      return {
        width: DEFAULT_ICON_SIZE,
        height: Math.round(DEFAULT_ICON_SIZE * ratio) || DEFAULT_ICON_SIZE,
      };
    }
  } catch {
    // fall through to default
  }
  return { width: DEFAULT_ICON_SIZE, height: DEFAULT_ICON_SIZE };
};

/**
 * Inserts an icon (identified by its `prefix:name` id) onto the canvas as an
 * SVG image element near the current viewport center.
 *
 * Insertion goes entirely through the public imperative API:
 *  - `excalidrawAPI.addFiles(...)` registers the SVG BinaryFileData
 *  - `convertToExcalidrawElements(...)` builds a valid image element skeleton
 *  - `excalidrawAPI.updateScene(...)` commits + the element references the file
 */
export const insertIconAsImage = async (
  excalidrawAPI: ExcalidrawImperativeAPI,
  iconId: string,
  options?: { signal?: AbortSignal },
) => {
  const rawSvg = await fetchIconSvg(iconId, { signal: options?.signal });
  const normalizedSvg = normalizeSVG(rawSvg);

  const file = SVGStringToFile(normalizedSvg, `${iconId}.svg`);
  const fileId = await generateIdFromFile(file);
  const dataURL = await getDataURL(file);

  const appState = excalidrawAPI.getAppState();
  const { x: centerX, y: centerY } = viewportCoordsToSceneCoords(
    {
      clientX: appState.width / 2 + appState.offsetLeft,
      clientY: appState.height / 2 + appState.offsetTop,
    },
    appState,
  );

  const { width, height } = getSvgDimensions(normalizedSvg);

  excalidrawAPI.addFiles([
    {
      id: fileId,
      mimeType: MIME_TYPES.svg,
      dataURL,
      created: Date.now(),
    },
  ]);

  const [imageElement] = convertToExcalidrawElements([
    {
      type: "image",
      fileId,
      status: "saved",
      x: centerX - width / 2,
      y: centerY - height / 2,
      width,
      height,
    },
  ]);

  excalidrawAPI.updateScene({
    elements: [...excalidrawAPI.getSceneElements(), imageElement],
    appState: {
      selectedElementIds: { [imageElement.id]: true },
    },
  });

  return imageElement;
};
