import { isArrowElement, isTextElement } from "@excalidraw/element";

import type {
  ExcalidrawElement,
  NonDeletedExcalidrawElement,
} from "@excalidraw/element/types";

type MermaidNode = {
  elementId: ExcalidrawElement["id"];
  mermaidId: string;
  center: { x: number; y: number };
  definition: string;
  hasLabel: boolean;
};

type MermaidEdge = {
  from: ExcalidrawElement["id"];
  to: ExcalidrawElement["id"];
  label: string | null;
};

const DEFAULT_EXPORT_NAME = "kindraw-diagram";

const EXCLUDED_NODE_TYPES = new Set([
  "arrow",
  "line",
  "freedraw",
  "draw",
  "image",
  "frame",
  "magicframe",
  "embeddable",
  "iframe",
]);

const textEncoder = new TextEncoder();

const getLabelFromText = (text: string | null | undefined) =>
  (text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("<br/>");

const escapeMermaidLabel = (text: string) =>
  text.replace(/"/g, "'").replace(/[<>]/g, (token) => {
    if (token === "<") {
      return "&lt;";
    }
    return "&gt;";
  });

const getElementCenter = (
  element: Pick<ExcalidrawElement, "x" | "y" | "width" | "height">,
) => ({
  x: element.x + element.width / 2,
  y: element.y + element.height / 2,
});

const getNodeShape = (element: NonDeletedExcalidrawElement, label: string) => {
  const safeLabel = escapeMermaidLabel(label || "Untitled");

  switch (element.type) {
    case "diamond":
      return `{"${safeLabel}"}`;
    case "ellipse":
      return `("${safeLabel}")`;
    default:
      return `["${safeLabel}"]`;
  }
};

const getArrowEndpoint = (
  element: Extract<
    NonDeletedExcalidrawElement,
    { points: readonly [number, number][] }
  >,
  index: 0 | -1,
) => {
  const point =
    index === 0 ? element.points[0] : element.points[element.points.length - 1];

  return {
    x: element.x + (point?.[0] || 0),
    y: element.y + (point?.[1] || 0),
  };
};

const getDistance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.hypot(a.x - b.x, a.y - b.y);

const inferNodeIdFromPoint = (
  point: { x: number; y: number },
  nodes: MermaidNode[],
  excludeId?: ExcalidrawElement["id"],
) => {
  let closest: MermaidNode | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const node of nodes) {
    if (node.elementId === excludeId) {
      continue;
    }

    const distance = getDistance(point, node.center);
    if (distance < closestDistance) {
      closest = node;
      closestDistance = distance;
    }
  }

  return closestDistance <= 240 ? closest?.elementId || null : null;
};

const inferDirection = (nodes: MermaidNode[]) => {
  if (nodes.length < 2) {
    return "TD";
  }

  const centers = nodes.map((node) => node.center);
  const minX = Math.min(...centers.map((center) => center.x));
  const maxX = Math.max(...centers.map((center) => center.x));
  const minY = Math.min(...centers.map((center) => center.y));
  const maxY = Math.max(...centers.map((center) => center.y));

  return maxX - minX > (maxY - minY) * 1.35 ? "LR" : "TD";
};

export const getTechnicalExportBaseName = (title?: string | null) => {
  const normalized = (title || DEFAULT_EXPORT_NAME)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || DEFAULT_EXPORT_NAME;
};

export const buildDrawIoMermaidUrl = (
  mermaid: string,
  title?: string | null,
) => {
  const create = encodeURIComponent(
    JSON.stringify({
      type: "mermaid",
      data: mermaid,
    }),
  );

  return `https://app.diagrams.net/?create=${create}&title=${encodeURIComponent(
    `${getTechnicalExportBaseName(title)}.drawio`,
  )}`;
};

export const downloadTextFile = (text: string, filename: string) => {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
};

export const copyText = async (text: string) => {
  await navigator.clipboard.writeText(text);
};

export const exportSceneToMermaid = (
  elements: readonly NonDeletedExcalidrawElement[],
) => {
  const boundText = new Map<ExcalidrawElement["id"], string>();

  for (const element of elements) {
    if (isTextElement(element) && element.containerId) {
      const label = getLabelFromText(element.text);
      if (label) {
        boundText.set(element.containerId, label);
      }
    }
  }

  const nodes: MermaidNode[] = [];
  const nodeById = new Map<ExcalidrawElement["id"], MermaidNode>();

  for (const element of elements) {
    if (isTextElement(element) && element.containerId) {
      continue;
    }

    if (EXCLUDED_NODE_TYPES.has(element.type)) {
      continue;
    }

    const label = isTextElement(element)
      ? getLabelFromText(element.text)
      : boundText.get(element.id) || "";
    const mermaidId = `N${nodes.length}`;
    const node: MermaidNode = {
      elementId: element.id,
      mermaidId,
      center: getElementCenter(element),
      definition: `${mermaidId}${getNodeShape(element, label || element.type)}`,
      hasLabel: Boolean(label),
    };

    nodes.push(node);
    nodeById.set(element.id, node);
  }

  const edges: MermaidEdge[] = [];

  for (const element of elements) {
    if (!isArrowElement(element)) {
      continue;
    }

    const fallbackStart = getArrowEndpoint(element, 0);
    const fallbackEnd = getArrowEndpoint(element, -1);

    const startId =
      element.startBinding?.elementId ||
      inferNodeIdFromPoint(fallbackStart, nodes, element.endBinding?.elementId);
    const endId =
      element.endBinding?.elementId ||
      inferNodeIdFromPoint(fallbackEnd, nodes, element.startBinding?.elementId);

    if (!startId || !endId || startId === endId) {
      continue;
    }

    if (!nodeById.has(startId) || !nodeById.has(endId)) {
      continue;
    }

    edges.push({
      from: startId,
      to: endId,
      label: boundText.get(element.id) || null,
    });
  }

  const referencedNodeIds = new Set<ExcalidrawElement["id"]>();
  for (const edge of edges) {
    referencedNodeIds.add(edge.from);
    referencedNodeIds.add(edge.to);
  }

  const includedNodes = nodes.filter(
    (node) => referencedNodeIds.has(node.elementId) || node.hasLabel,
  );

  if (!includedNodes.length) {
    return null;
  }

  const edgeSignatures = new Set<string>();
  const lines = [`flowchart ${inferDirection(includedNodes)}`];

  for (const node of includedNodes) {
    lines.push(`  ${node.definition}`);
  }

  for (const edge of edges) {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);

    if (!from || !to) {
      continue;
    }

    const label = edge.label ? escapeMermaidLabel(edge.label) : null;
    const connector = label ? `-->|"${label}"|` : "-->";
    const signature = `${from.mermaidId}:${connector}:${to.mermaidId}`;

    if (edgeSignatures.has(signature)) {
      continue;
    }
    edgeSignatures.add(signature);

    lines.push(`  ${from.mermaidId} ${connector} ${to.mermaidId}`);
  }

  return lines.join("\n");
};

export const getMermaidExportSize = (mermaid: string) =>
  textEncoder.encode(mermaid).byteLength;
