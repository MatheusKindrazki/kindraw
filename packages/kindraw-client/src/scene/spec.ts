// The structured diagram contract. This is the PRIMARY input format for the
// scene builder: a graph of nodes + edges (+ optional groups), independent of
// Excalidraw's internal element shape. Claude (the MCP client) composes one of
// these; the builder turns it into a laid-out Excalidraw scene.

export type NodeShape = "rectangle" | "diamond" | "ellipse";

export type Direction = "TB" | "BT" | "LR" | "RL";

export type DiagramNode = {
  id: string;
  label: string;
  shape?: NodeShape;
  /** Group/frame id this node belongs to (optional). */
  group?: string;
  /** Excalidraw stroke color, e.g. "#1971c2". */
  strokeColor?: string;
  /** Excalidraw fill color, e.g. "#a5d8ff". */
  backgroundColor?: string;
};

export type DiagramEdge = {
  from: string;
  to: string;
  label?: string;
  /** Visual style of the connector. */
  style?: "solid" | "dashed" | "dotted";
};

export type DiagramGroup = {
  id: string;
  label?: string;
};

export type DiagramSpec = {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups?: DiagramGroup[];
  /** Layout direction. Default "TB" (top-to-bottom). */
  direction?: Direction;
  /** Layout engine. "dagre" (default, fast/sync) or "elk" (orthogonal routing). */
  engine?: "dagre" | "elk";
};

// A spec with all defaults applied. The builder works on this normalized form.
export type NormalizedSpec = Required<
  Pick<DiagramSpec, "direction" | "engine">
> & {
  nodes: Array<Required<Pick<DiagramNode, "id" | "label" | "shape">> & DiagramNode>;
  edges: DiagramEdge[];
  groups: DiagramGroup[];
};

const VALID_SHAPES: ReadonlySet<string> = new Set([
  "rectangle",
  "diamond",
  "ellipse",
]);
const VALID_DIRECTIONS: ReadonlySet<string> = new Set([
  "TB",
  "BT",
  "LR",
  "RL",
]);

/**
 * Validate and normalize a raw DiagramSpec. Throws a descriptive Error on any
 * structural problem. Returns a NormalizedSpec with defaults applied.
 */
export const validateDiagramSpec = (raw: unknown): NormalizedSpec => {
  if (!raw || typeof raw !== "object") {
    throw new Error("DiagramSpec must be an object.");
  }
  const spec = raw as DiagramSpec;

  if (!Array.isArray(spec.nodes) || spec.nodes.length === 0) {
    throw new Error("DiagramSpec must have at least one node.");
  }
  if (!Array.isArray(spec.edges)) {
    throw new Error("DiagramSpec.edges must be an array.");
  }

  const ids = new Set<string>();
  for (const node of spec.nodes) {
    if (!node || typeof node.id !== "string" || node.id.length === 0) {
      throw new Error("Every node must have a non-empty string id.");
    }
    if (ids.has(node.id)) {
      throw new Error(`Duplicate node id: "${node.id}".`);
    }
    ids.add(node.id);
    if (typeof node.label !== "string") {
      throw new Error(`Node "${node.id}" must have a string label.`);
    }
    if (node.shape !== undefined && !VALID_SHAPES.has(node.shape)) {
      throw new Error(
        `Node "${node.id}" has invalid shape "${node.shape}". ` +
          `Allowed: rectangle, diamond, ellipse.`,
      );
    }
  }

  for (const edge of spec.edges) {
    if (!edge || typeof edge.from !== "string" || typeof edge.to !== "string") {
      throw new Error("Every edge must have string `from` and `to`.");
    }
    if (!ids.has(edge.from)) {
      throw new Error(`Edge references unknown node "${edge.from}".`);
    }
    if (!ids.has(edge.to)) {
      throw new Error(`Edge references unknown node "${edge.to}".`);
    }
  }

  if (
    spec.direction !== undefined &&
    !VALID_DIRECTIONS.has(spec.direction)
  ) {
    throw new Error(
      `Invalid direction "${spec.direction}". Allowed: TB, BT, LR, RL.`,
    );
  }
  if (spec.engine !== undefined && spec.engine !== "dagre" && spec.engine !== "elk") {
    throw new Error(`Invalid engine "${spec.engine}". Allowed: dagre, elk.`);
  }

  return {
    direction: spec.direction ?? "TB",
    engine: spec.engine ?? "dagre",
    nodes: spec.nodes.map((n) => ({
      ...n,
      shape: n.shape ?? "rectangle",
    })),
    edges: spec.edges,
    groups: spec.groups ?? [],
  };
};
