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

import { composeIconImages, type IconPlacement } from "./icons.js";
import { buildScene, sceneMaxY } from "./scene/build.js";
import { validateDiagramSpec } from "./scene/spec.js";

import {
  buildKindrawSectionLink,
  parseHybridMarkdownSections,
} from "./sections/index.js";

import type { DiagramEdge, DiagramGroup, DiagramNode } from "./scene/spec.js";
import type { KindrawClient } from "./client.js";

// Vertical gap between the diagram's bottom edge and the start of the auto-placed
// icon grid, so grid-placed icons clear the diagram. (BizLogic MEDIUM-1.)
const ICON_GRID_GAP = 40;

export type HybridDiagramNode = DiagramNode & {
  /**
   * Exact heading text to deep-link this node to its parsed doc section.
   *
   * Matching is by the heading's literal text. Limitations:
   * - The synthetic intro (no leading heading) is NOT addressable — its
   *   hardcoded title "Visao geral" never resolves here.
   * - If two headings share the exact same text, only the FIRST occurrence is
   *   deep-linkable by the bare title; later duplicates (which the parser gives
   *   dedup-suffixed ids like `base-2`) can't be targeted by title alone.
   * Unmatched headings are reported in `unmatchedHeadings`, not an error.
   */
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
  /**
   * Optional Iconify icons to embed as images on the canvas (grid-placed in a
   * band BELOW the diagram so they don't overlap it). The SVG is fetched via the
   * injected client.getIconSvg and embedded; a failed fetch is
   * skipped-with-warning (see iconWarnings).
   */
  icons?: IconPlacement[];
};

export type ComposeHybridResult = {
  hybridId: string;
  docItemId: string;
  drawingItemId: string;
  url: string;
  linksWired: number;
  unmatchedHeadings: string[];
  elementCount: number;
  /** iconIds that could not be fetched and were skipped (not fatal). */
  iconWarnings: string[];
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
  // Fail-fast: validate the diagram BEFORE seeding anything. The CLI has no zod
  // schema, so a malformed/over-cap diagram would otherwise POST the hybrid and
  // PUT the doc, then throw inside buildScene — leaving a half-built orphan
  // hybrid behind. Validating here (it throws on any structural problem) makes
  // both CLI and MCP fail with NO side effects. buildScene re-validates later
  // (cheap, idempotent). (Security M2.) The linkToHeading field is stripped per
  // node below, so validate the plain DiagramNode view of each node.
  validateDiagramSpec({
    nodes: input.diagram.nodes.map(({ linkToHeading, ...rest }) => rest),
    edges: input.diagram.edges,
    groups: input.diagram.groups,
    direction: input.diagram.direction,
    engine: input.diagram.engine,
  });

  // Fail-fast on a malformed icon id too: getIconSvg would throw mid-flow (after
  // seeding) and orphan the hybrid. Validate the SAME shape it requires here, so
  // a bad id fails with NO side effects. (A 404 on a well-formed id is still a
  // non-fatal skip-with-warning inside composeIconImages — that's different.)
  if (input.icons?.length) {
    for (const icon of input.icons) {
      if (!/^[a-z0-9-]+:[a-z0-9-]+$/i.test(icon.iconId)) {
        throw new Error(
          `Invalid icon id "${icon.iconId}" (expected "prefix:name").`,
        );
      }
    }
  }

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
    // Skip the synthetic intro: it isn't an addressable heading (its hardcoded
    // title "Visao geral" would otherwise shadow a real heading of that text and
    // let a node "deep-link" to a non-heading). First occurrence of a real title
    // wins; duplicate titles get dedup suffixes (-2, -3) and only the first stays
    // addressable by its bare heading text — the most predictable behavior for
    // the agent composing the diagram. (Code M2 / BizLogic LOW-2.)
    if (!section.isIntro && !idByTitle.has(section.title)) {
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
  const sceneSpec = {
    nodes,
    edges: input.diagram.edges,
    groups: input.diagram.groups,
    direction: input.diagram.direction,
    engine: input.diagram.engine,
  };

  // Compose any requested icons into image skeletons + a files map. FETCH-FREE
  // composer: we INJECT client.getIconSvg so scene/icons stays HTTP-free. A
  // failed icon fetch is skipped-with-warning, never fatal to the hybrid.
  //
  // Node-less icons are GRID-placed; we must start that grid BELOW the diagram or
  // it renders on top of the laid-out nodes (the scene normalizes its top-left
  // node to (20,20), so a grid at y=0 overlaps). To get the diagram's bottom
  // edge deterministically, build the scene ONCE without icons and measure its
  // maxY — icons are additive (converted/appended separately, no layout effect),
  // so the node positions are identical in the final build. (BizLogic MEDIUM-1.)
  let imageSkeletons: Array<Record<string, unknown>> = [];
  let files: Record<string, unknown> = {};
  let iconWarnings: string[] = [];
  if (input.icons?.length) {
    const probe = await buildScene(sceneSpec);
    const originY = sceneMaxY(JSON.parse(probe.content).elements) + ICON_GRID_GAP;
    ({
      imageSkeletons,
      files,
      warnings: iconWarnings,
    } = await composeIconImages(
      input.icons,
      (id, color) => client.getIconSvg(id, color),
      { originY },
    ));
  }

  const { content, elementCount } = await buildScene(sceneSpec, {
    iconImages: imageSkeletons,
    files,
  });
  // Defensive: the server does NOT validate the JSON it stores, so we guarantee
  // ours parses before the PUT. buildScene already JSON.stringifies, so this can
  // only fail on a builder regression — but if it ever emits non-JSON, surface
  // it as a drawing-step partial failure (steps 0+2 already succeeded) instead
  // of a raw SyntaxError that bypasses the HybridPartialError contract.
  // (Security M1 / Code M3.)
  try {
    JSON.parse(content);
  } catch (err) {
    throw new HybridPartialError(
      `Hybrid ${hybridId} doc set but built drawing JSON is invalid: ${
        err instanceof Error ? err.message : String(err)
      }`,
      hybridId,
      docItemId,
      drawingItemId,
      "drawing",
    );
  }
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
    iconWarnings,
  };
};
