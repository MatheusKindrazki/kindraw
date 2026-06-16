// Shared 4-step hybrid orchestration, used by BOTH the MCP tool and the CLI so
// the flow lives in exactly one place. Steps (verified contracts):
//   0. POST /api/hybrid-items {title, folderId} -> {hybridId, docItemId, drawingItemId}
//   1. Re-parse the FINAL markdown with the SHARED parseHybridMarkdownSections to
//      get each section's EXACT id (never an independent per-heading slugify).
//   2. PUT /api/items/:docItemId/content  {content: markdown}
//   3. buildScene(diagram) with node.link resolved from linkToHeading; the
//      drawing JSON is JSON.parse-validated, then PUT to :drawingItemId/content.
//   4. return hybridUrl(hybridId) + a report.
//
// HTTP-free boundary: scene/ must not import the http client. We INJECT the
// client here (this module is the seam) and call buildScene from scene/.
//
// Partial failure: if step 0 succeeds but a PUT fails, we THROW a
// HybridPartialError carrying {hybridId, docItemId, drawingItemId, failedStep}
// so the caller retries idempotently (PUTs are idempotent) — we do NOT attempt
// cleanup (there is no verified delete-hybrid contract).

import type { KindrawClient } from "./client.js";
import { buildScene } from "./scene/build.js";
import type { DiagramEdge, DiagramGroup, DiagramNode } from "./scene/spec.js";
import {
  buildKindrawSectionLink,
  parseHybridMarkdownSections,
} from "./sections/index.js";

export type HybridDiagramNode = DiagramNode & {
  /** Exact heading text to deep-link this node to its parsed doc section. */
  linkToHeading?: string;
};

export type HybridDiagram = {
  nodes: HybridDiagramNode[];
  edges: DiagramEdge[];
  groups?: DiagramGroup[];
  direction?: "TB" | "BT" | "LR" | "RL";
  engine?: "dagre" | "elk";
};

export type ComposeHybridInput = {
  title: string;
  markdown: string;
  folderId?: string | null;
  diagram: HybridDiagram;
};

export type ComposeHybridResult = {
  hybridId: string;
  docItemId: string;
  drawingItemId: string;
  url: string;
  linksWired: number;
  unmatchedHeadings: string[];
  elementCount: number;
};

export class HybridPartialError extends Error {
  constructor(
    message: string,
    public hybridId: string,
    public docItemId: string,
    public drawingItemId: string,
    public failedStep: "doc" | "drawing",
  ) {
    super(message);
    this.name = "HybridPartialError";
  }
}

export const composeHybrid = async (
  client: KindrawClient,
  input: ComposeHybridInput,
): Promise<ComposeHybridResult> => {
  // Step 0: seed the hybrid (doc + empty drawing).
  const { hybridId, docItemId, drawingItemId } = await client.createHybrid({
    title: input.title,
    folderId: input.folderId ?? null,
  });

  // Step 1: parse the FINAL markdown -> heading text -> section id map. The id
  // is whatever the SHARED parser assigns (dedup suffixes, accent stripping,
  // depth nesting) — the exact id the app will resolve against.
  const sections = parseHybridMarkdownSections(input.markdown);
  const idByTitle = new Map<string, string>();
  for (const section of sections) {
    // First occurrence of a title wins. Duplicate titles get dedup suffixes
    // (-2, -3); the first stays addressable by its bare heading text, which is
    // the most predictable behavior for the agent composing the diagram.
    if (!idByTitle.has(section.title)) {
      idByTitle.set(section.title, section.id);
    }
  }

  // Resolve linkToHeading -> kindraw:// link; collect any that match nothing.
  const unmatchedHeadings: string[] = [];
  let linksWired = 0;
  const nodes: DiagramNode[] = input.diagram.nodes.map((node) => {
    const { linkToHeading, ...rest } = node;
    if (!linkToHeading) {
      return rest;
    }
    const sectionId = idByTitle.get(linkToHeading);
    if (!sectionId) {
      unmatchedHeadings.push(linkToHeading);
      return rest;
    }
    linksWired += 1;
    return { ...rest, link: buildKindrawSectionLink(hybridId, sectionId) };
  });

  // Step 2: populate the doc with the FULL markdown verbatim.
  try {
    await client.updateHybridDoc(docItemId, input.markdown);
  } catch (err) {
    throw new HybridPartialError(
      `Hybrid ${hybridId} seeded but doc content PUT failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      hybridId,
      docItemId,
      drawingItemId,
      "doc",
    );
  }

  // Step 3: build + populate the canvas. buildScene already validates node.link.
  const { content, elementCount } = await buildScene({
    nodes,
    edges: input.diagram.edges,
    groups: input.diagram.groups,
    direction: input.diagram.direction,
    engine: input.diagram.engine,
  });
  // Defensive: the server does NOT validate the JSON it stores, so we guarantee
  // ours parses before the PUT. buildScene already JSON.stringifies, so this is
  // a belt-and-suspenders check that can only fail on a builder regression.
  JSON.parse(content);
  try {
    await client.updateHybridDrawing(drawingItemId, content);
  } catch (err) {
    throw new HybridPartialError(
      `Hybrid ${hybridId} doc set but drawing content PUT failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      hybridId,
      docItemId,
      drawingItemId,
      "drawing",
    );
  }

  return {
    hybridId,
    docItemId,
    drawingItemId,
    url: client.hybridUrl(hybridId),
    linksWired,
    unmatchedHeadings,
    elementCount,
  };
};
