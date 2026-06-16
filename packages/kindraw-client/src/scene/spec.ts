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
const VALID_EDGE_STYLES: ReadonlySet<string> = new Set([
  "solid",
  "dashed",
  "dotted",
]);

// Hard resource caps. The spec is attacker-controllable input (composed by an
// LLM and/or relayed over the wire), so we bound it to keep layout + element
// generation from exploding into a DoS. (Security C1.)
const MAX_NODES = 500;
const MAX_EDGES = 2000;
const MAX_GROUPS = 200;
const MAX_LABEL_LEN = 2000;
// Ids (nodes, groups, edge endpoints) are unbounded user input that ends up in
// element ids and lookup keys. Cap them so a single huge id can't bloat the
// scene or the serialized output. The MCP/CLI boundaries also cap, but this is
// the defense-in-depth backstop the builder always enforces. (Security H2.)
const MAX_ID_LEN = 200;

// Generated elements (bound text, arrows) live in the SAME id namespace as user
// node ids. We derive their ids as `text-<containerId>` and `arrow-<i>`, so a
// user id like "text-b" or "arrow-0" would collide → a duplicate element id or
// a silently dropped arrow. Reject any user id that starts with a reserved
// generated-element prefix. (Code H1+H2 — silent data loss.)
const RESERVED_ID_PREFIX_RE = /^(text|arrow)-/;

// Ids that collide with Object.prototype keys. Allowing these as ids (which end
// up as keys in lookup objects/Sets elsewhere) invites prototype-pollution and
// subtle resolution bugs, so we reject them outright. (Security H1.)
const RESERVED_IDS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "hasOwnProperty",
  "valueOf",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  "toString",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
]);

// Hex (#rgb / #rrggbb) or the literal "transparent". Keeps us from feeding
// arbitrary CSS into the canvas. (BizLogic MEDIUM-4.)
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const isValidColor = (value: string): boolean =>
  value === "transparent" || HEX_COLOR_RE.test(value);

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

  // Resource caps first, before any per-element work. (Security C1.)
  if (spec.nodes.length > MAX_NODES) {
    throw new Error(`Too many nodes: ${spec.nodes.length}. Max is ${MAX_NODES}.`);
  }
  if (spec.edges.length > MAX_EDGES) {
    throw new Error(`Too many edges: ${spec.edges.length}. Max is ${MAX_EDGES}.`);
  }
  const rawGroups = Array.isArray(spec.groups) ? spec.groups : [];
  if (rawGroups.length > MAX_GROUPS) {
    throw new Error(`Too many groups: ${rawGroups.length}. Max is ${MAX_GROUPS}.`);
  }

  // Validate groups first so node.group references can be resolved. (MEDIUM-1.)
  const groupIds = new Set<string>();
  for (const group of rawGroups) {
    if (!group || typeof group.id !== "string" || group.id.trim().length === 0) {
      throw new Error("Every group must have a non-empty string id.");
    }
    if (group.id !== group.id.trim()) {
      throw new Error(
        `Group id "${group.id}" must not have leading or trailing whitespace.`,
      );
    }
    if (group.id.length > MAX_ID_LEN) {
      throw new Error(
        `Group id is too long: ${group.id.length}. Max is ${MAX_ID_LEN}.`,
      );
    }
    if (RESERVED_IDS.has(group.id)) {
      throw new Error(`Group id "${group.id}" is reserved and not allowed.`);
    }
    if (RESERVED_ID_PREFIX_RE.test(group.id)) {
      throw new Error(
        `Group id "${group.id}" must not start with "text-" or "arrow-" ` +
          `(reserved for generated elements).`,
      );
    }
    if (groupIds.has(group.id)) {
      throw new Error(`Duplicate group id: "${group.id}".`);
    }
    groupIds.add(group.id);
    if (group.label !== undefined && typeof group.label !== "string") {
      throw new Error(`Group "${group.id}" label must be a string.`);
    }
  }

  const ids = new Set<string>();
  for (const node of spec.nodes) {
    if (!node || typeof node.id !== "string" || node.id.trim().length === 0) {
      throw new Error("Every node must have a non-empty string id.");
    }
    // Reject ids that are non-empty but padded; trimming-and-keeping would make
    // edge resolution ("a" vs " a ") ambiguous. (BizLogic HIGH-1.)
    if (node.id !== node.id.trim()) {
      throw new Error(
        `Node id "${node.id}" must not have leading or trailing whitespace.`,
      );
    }
    if (node.id.length > MAX_ID_LEN) {
      throw new Error(
        `Node id is too long: ${node.id.length}. Max is ${MAX_ID_LEN}.`,
      );
    }
    if (RESERVED_IDS.has(node.id)) {
      throw new Error(`Node id "${node.id}" is reserved and not allowed.`);
    }
    if (RESERVED_ID_PREFIX_RE.test(node.id)) {
      throw new Error(
        `Node id "${node.id}" must not start with "text-" or "arrow-" ` +
          `(reserved for generated elements).`,
      );
    }
    if (ids.has(node.id)) {
      throw new Error(`Duplicate node id: "${node.id}".`);
    }
    ids.add(node.id);
    if (typeof node.label !== "string") {
      throw new Error(`Node "${node.id}" must have a string label.`);
    }
    if (node.label.length > MAX_LABEL_LEN) {
      throw new Error(
        `Node "${node.id}" label is too long: ${node.label.length}. ` +
          `Max is ${MAX_LABEL_LEN}.`,
      );
    }
    if (node.shape !== undefined && !VALID_SHAPES.has(node.shape)) {
      throw new Error(
        `Node "${node.id}" has invalid shape "${node.shape}". ` +
          `Allowed: rectangle, diamond, ellipse.`,
      );
    }
    if (node.group !== undefined) {
      if (typeof node.group !== "string" || node.group.length === 0) {
        throw new Error(`Node "${node.id}" group must be a non-empty string.`);
      }
      if (!groupIds.has(node.group)) {
        throw new Error(
          `Node "${node.id}" references unknown group "${node.group}".`,
        );
      }
    }
    if (node.strokeColor !== undefined) {
      if (typeof node.strokeColor !== "string" || !isValidColor(node.strokeColor)) {
        throw new Error(
          `Node "${node.id}" has invalid color "${node.strokeColor}".`,
        );
      }
    }
    if (node.backgroundColor !== undefined) {
      if (
        typeof node.backgroundColor !== "string" ||
        !isValidColor(node.backgroundColor)
      ) {
        throw new Error(
          `Node "${node.id}" has invalid color "${node.backgroundColor}".`,
        );
      }
    }
  }

  for (const edge of spec.edges) {
    if (!edge || typeof edge.from !== "string" || typeof edge.to !== "string") {
      throw new Error("Every edge must have string `from` and `to`.");
    }
    // Reject padded endpoints for the same reason node ids are rejected: the
    // id Set holds trimmed ids, so " a " would spuriously look "unknown".
    if (edge.from !== edge.from.trim() || edge.to !== edge.to.trim()) {
      throw new Error(
        `Edge endpoints "${edge.from}" -> "${edge.to}" must not have ` +
          `leading or trailing whitespace.`,
      );
    }
    if (edge.from.length > MAX_ID_LEN || edge.to.length > MAX_ID_LEN) {
      throw new Error(
        `Edge endpoint id is too long. Max is ${MAX_ID_LEN}.`,
      );
    }
    if (!ids.has(edge.from)) {
      throw new Error(`Edge references unknown node "${edge.from}".`);
    }
    if (!ids.has(edge.to)) {
      throw new Error(`Edge references unknown node "${edge.to}".`);
    }
    // Self-loops (from === to) are allowed: dagre/elk both handle them, and a
    // node pointing at itself is a legitimate diagram shape. (BizLogic MEDIUM-2.)
    if (edge.style !== undefined && !VALID_EDGE_STYLES.has(edge.style)) {
      throw new Error(
        `Edge "${edge.from}" -> "${edge.to}" has invalid style "${edge.style}". ` +
          `Allowed: solid, dashed, dotted.`,
      );
    }
    if (edge.label !== undefined) {
      if (typeof edge.label !== "string") {
        throw new Error(
          `Edge "${edge.from}" -> "${edge.to}" label must be a string.`,
        );
      }
      if (edge.label.length > MAX_LABEL_LEN) {
        throw new Error(
          `Edge "${edge.from}" -> "${edge.to}" label is too long: ` +
            `${edge.label.length}. Max is ${MAX_LABEL_LEN}.`,
        );
      }
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

  // Drop exact-duplicate edges (same from|to|label|style) so the canvas doesn't
  // get stacked connectors. First occurrence wins; order is otherwise stable.
  // (BizLogic MEDIUM-2.)
  const seenEdges = new Set<string>();
  const dedupedEdges: DiagramEdge[] = [];
  for (const edge of spec.edges) {
    const key = `${edge.from} ${edge.to} ${edge.label ?? ""} ${
      edge.style ?? ""
    }`;
    if (seenEdges.has(key)) {
      continue;
    }
    seenEdges.add(key);
    dedupedEdges.push(edge);
  }

  return {
    direction: spec.direction ?? "TB",
    engine: spec.engine ?? "dagre",
    nodes: spec.nodes.map((n) => ({
      ...n,
      shape: n.shape ?? "rectangle",
    })),
    edges: dedupedEdges,
    groups: rawGroups,
  };
};
