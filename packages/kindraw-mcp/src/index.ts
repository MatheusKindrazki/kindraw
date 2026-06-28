import os from "node:os";
import path from "node:path";
import fs from "node:fs";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  KindrawClient,
  KindrawApiError,
  DEFAULT_API_BASE_URL,
} from "@kindraw/client";
import { z } from "zod";

// Resolve the token from env, falling back to the CLI's saved config so a user
// who ran `kindraw login` doesn't have to re-paste a token for the MCP server.
const resolveCredentials = (): {
  token: string;
  baseUrl: string;
  appOrigin?: string;
} => {
  let token = process.env.KINDRAW_TOKEN;
  let baseUrl = process.env.KINDRAW_API_BASE_URL;
  let appOrigin = process.env.KINDRAW_APP_ORIGIN;

  if (!token) {
    try {
      const configPath = process.env.XDG_CONFIG_HOME
        ? path.join(process.env.XDG_CONFIG_HOME, "kindraw", "config.json")
        : path.join(os.homedir(), ".config", "kindraw", "config.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
        token?: string;
        baseUrl?: string;
        appOrigin?: string;
      };
      token = config.token;
      baseUrl = baseUrl || config.baseUrl;
      appOrigin = appOrigin || config.appOrigin;
    } catch {
      // no config file
    }
  }

  if (!token) {
    throw new Error(
      "No Kindraw token found. Set KINDRAW_TOKEN or run `kindraw login` first.",
    );
  }
  return { token, baseUrl: baseUrl || DEFAULT_API_BASE_URL, appOrigin };
};

const formatError = (error: unknown): string => {
  if (error instanceof KindrawApiError) {
    return `Kindraw API error (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
};

const text = (value: string) => ({
  content: [{ type: "text" as const, text: value }],
});

const main = async () => {
  const { token, baseUrl, appOrigin } = resolveCredentials();
  const client = new KindrawClient({ token, baseUrl, appOrigin });

  const server = new McpServer({
    name: "kindraw",
    version: "0.1.0",
  });

  server.registerTool(
    "kindraw_create_diagram",
    {
      description:
        "Create a drawing in the user's Kindraw workspace from a Mermaid diagram " +
        "definition (flowchart, sequence, class, ER, etc). Returns the drawing URL.",
      inputSchema: {
        mermaid: z
          .string()
          .describe(
            "A valid Mermaid diagram definition, e.g. 'graph TD; A-->B'",
          ),
        title: z
          .string()
          .max(500)
          .optional()
          .describe("Title for the new drawing"),
      },
    },
    async ({ mermaid, title }) => {
      try {
        const { generateExcalidrawFromMermaid } = await import(
          "@kindraw/client/generate"
        );
        const { content, elementCount } = await generateExcalidrawFromMermaid(
          mermaid,
        );
        const result = await client.createDrawing({
          title: title || "Untitled drawing",
          content,
        });
        return text(
          `Created drawing "${
            title || "Untitled drawing"
          }" (${elementCount} elements).\n${result.url}`,
        );
      } catch (error) {
        return { ...text(formatError(error)), isError: true };
      }
    },
  );

  // Shared DiagramSpec input shape (mirrors create_scene's inline schema), reused
  // by kindraw_sync_scene so create + regenerate stay in lockstep.
  const sceneSpecShape = {
    nodes: z
      .array(
        z.object({
          id: z
            .string()
            .max(200)
            .describe("Unique node id, referenced by edges"),
          label: z.string().max(2000).describe("Text shown inside the node"),
          shape: z
            .enum(["rectangle", "diamond", "ellipse", "sticky"])
            .optional()
            .describe(
              "Node shape (default rectangle). `sticky` = a whiteboard post-it " +
                "(yellow with a drop shadow) — for brainstorm/board-style nodes.",
            ),
          group: z
            .string()
            .max(200)
            .optional()
            .describe(
              "Optional id of a group this node belongs to; the group renders as " +
                "a labeled frame boundary (C4 boundary / swimlane). Must match an " +
                "entry in `groups`.",
            ),
          strokeColor: z
            .string()
            .max(64)
            .optional()
            .describe("Stroke color hex, e.g. #1971c2"),
          backgroundColor: z
            .string()
            .max(64)
            .optional()
            .describe("Fill color hex, e.g. #a5d8ff"),
        }),
      )
      .min(1)
      .max(500)
      .describe("The diagram nodes (1-500)"),
    edges: z
      .array(
        z.object({
          from: z.string().max(200).describe("Source node id"),
          to: z.string().max(200).describe("Target node id"),
          label: z
            .string()
            .max(2000)
            .optional()
            .describe("Optional edge label"),
          style: z
            .enum(["solid", "dashed", "dotted"])
            .optional()
            .describe("Connector style (default solid)"),
        }),
      )
      .max(2000)
      .describe("The directed edges between nodes (up to 2000)"),
    groups: z
      .array(
        z.object({
          id: z.string().max(200).describe("Unique group id"),
          label: z
            .string()
            .max(2000)
            .optional()
            .describe("Optional group label, shown as the frame title"),
        }),
      )
      .max(200)
      .optional()
      .describe(
        "Optional groups: each renders as a labeled frame (boundary/container) " +
          "wrapping the nodes that reference its id via `group` — for C4 " +
          "boundaries, bounded contexts, or swimlanes (up to 200).",
      ),
    direction: z
      .enum(["TB", "BT", "LR", "RL"])
      .optional()
      .describe("Layout direction (default TB, top-to-bottom)"),
    engine: z
      .enum(["dagre", "elk"])
      .optional()
      .describe(
        "Layout engine: dagre (default, fast) or elk (orthogonal routing)",
      ),
  };

  server.registerTool(
    "kindraw_create_scene",
    {
      description:
        "Create a high-quality diagram in the user's Kindraw workspace from a " +
        "STRUCTURED spec of nodes and edges. Prefer this over Mermaid for rich " +
        "layouts: you compose the node/edge graph and Kindraw runs real graph " +
        "layout (dagre by default) so nodes are well-spaced and arrows connect " +
        "borders cleanly — no cramped or mis-anchored canvases. Provide nodes " +
        "with ids + labels, edges referencing those ids, optional shape per node " +
        "(rectangle/diamond/ellipse), optional hex colors, direction (TB/LR/...), " +
        "and engine (dagre, or elk for orthogonal routing). Group nodes (give each " +
        "a `group` id + a matching entry in `groups`) to draw labeled frame " +
        "boundaries around them — ideal for C4 context/container diagrams, bounded " +
        "contexts, and swimlanes. Returns the drawing URL.",
      inputSchema: {
        title: z
          .string()
          .max(500)
          .optional()
          .describe("Title for the new drawing"),
        nodes: z
          .array(
            z.object({
              id: z
                .string()
                .max(200)
                .describe("Unique node id, referenced by edges"),
              label: z
                .string()
                .max(2000)
                .describe("Text shown inside the node"),
              shape: z
                .enum(["rectangle", "diamond", "ellipse", "sticky"])
                .optional()
                .describe(
                  "Node shape (default rectangle). `sticky` = a whiteboard " +
                    "post-it (yellow with a drop shadow) — use for brainstorm/" +
                    "board-style nodes.",
                ),
              group: z
                .string()
                .max(200)
                .optional()
                .describe(
                  "Optional id of a group this node belongs to; the group renders " +
                    "as a labeled frame boundary around its members (C4 boundary / " +
                    "swimlane). Must match an entry in `groups`.",
                ),
              strokeColor: z
                .string()
                .max(64)
                .optional()
                .describe("Stroke color hex, e.g. #1971c2"),
              backgroundColor: z
                .string()
                .max(64)
                .optional()
                .describe("Fill color hex, e.g. #a5d8ff"),
            }),
          )
          .min(1)
          .max(500)
          .describe("The diagram nodes (1-500)"),
        edges: z
          .array(
            z.object({
              from: z.string().max(200).describe("Source node id"),
              to: z.string().max(200).describe("Target node id"),
              label: z
                .string()
                .max(2000)
                .optional()
                .describe("Optional edge label"),
              style: z
                .enum(["solid", "dashed", "dotted"])
                .optional()
                .describe("Connector style (default solid)"),
            }),
          )
          .max(2000)
          .describe("The directed edges between nodes (up to 2000)"),
        groups: z
          .array(
            z.object({
              id: z.string().max(200).describe("Unique group id"),
              label: z
                .string()
                .max(2000)
                .optional()
                .describe("Optional group label, shown as the frame title"),
            }),
          )
          .max(200)
          .optional()
          .describe(
            "Optional groups: each renders as a labeled frame (boundary/container) " +
              "wrapping the nodes that reference its id via `group` — use for C4 " +
              "boundaries, bounded contexts, or swimlanes (up to 200).",
          ),
        direction: z
          .enum(["TB", "BT", "LR", "RL"])
          .optional()
          .describe("Layout direction (default TB, top-to-bottom)"),
        engine: z
          .enum(["dagre", "elk"])
          .optional()
          .describe(
            "Layout engine: dagre (default, fast) or elk (orthogonal routing)",
          ),
      },
    },
    async ({ title, nodes, edges, groups, direction, engine }) => {
      try {
        const { buildScene } = await import("@kindraw/client/scene");
        const { content, elementCount } = await buildScene({
          nodes,
          edges,
          groups,
          direction,
          engine,
        });
        const result = await client.createDrawing({
          title: title || "Untitled diagram",
          content,
        });
        return text(
          `Created diagram "${
            title || "Untitled diagram"
          }" (${elementCount} elements).\n${result.url}`,
        );
      } catch (error) {
        return { ...text(formatError(error)), isError: true };
      }
    },
  );

  server.registerTool(
    "kindraw_sync_scene",
    {
      description:
        "Regenerate an EXISTING drawing canvas from a structured DiagramSpec — " +
        "the docs-as-code primitive for diagrams. Deterministic layout makes the " +
        "result byte-stable, so an agent (or CI) keeps an architecture diagram in " +
        "lockstep with the code and it stops rotting. Pass `check: true` to DETECT " +
        "drift (a stale diagram) WITHOUT writing — the CI gate. WARNING: a " +
        "non-check sync OVERWRITES the live canvas (the spec is the source of " +
        "truth), including manual edits. Same node/edge/group/direction/engine " +
        "shape as kindraw_create_scene.",
      inputSchema: {
        itemId: z
          .string()
          .max(200)
          .describe(
            "Id of the existing drawing to regenerate (for a hybrid, its drawing " +
              "item id)",
          ),
        check: z
          .boolean()
          .optional()
          .describe("Detect drift only — never writes (use as a CI gate)"),
        ...sceneSpecShape,
      },
    },
    async ({ itemId, check, nodes, edges, groups, direction, engine }) => {
      try {
        const { syncScene } = await import("@kindraw/client/scene");
        const res = await syncScene(client, {
          itemId,
          spec: { nodes, edges, groups, direction, engine },
          check,
        });
        if (check) {
          return text(
            res.unchanged
              ? `In sync: "${itemId}" already matches the spec (${res.elementCount} elements).`
              : `DRIFT: "${itemId}" differs from the spec (would regenerate ` +
                  `${res.elementCount} elements). Run without check to update.`,
          );
        }
        return text(
          res.unchanged
            ? `No change: "${itemId}" already matches the spec (${res.elementCount} elements).`
            : `Regenerated "${itemId}" from the spec (${res.elementCount} elements).`,
        );
      } catch (error) {
        return { ...text(formatError(error)), isError: true };
      }
    },
  );

  server.registerTool(
    "kindraw_create_doc",
    {
      description:
        "Create a markdown document in the user's Kindraw workspace. Provide " +
        "the FULL markdown (GFM: headings, lists, tables, code). Returns the " +
        "doc URL (/doc/<id>). Use this for prose/notes; use kindraw_create_scene " +
        "for canvas diagrams, or kindraw_create_hybrid for a doc beside a canvas.",
      inputSchema: {
        title: z.string().max(500).describe("Title for the new doc"),
        markdown: z
          .string()
          .max(500_000)
          .describe("The full document body as GitHub-Flavored Markdown"),
        folderId: z
          .string()
          .max(200)
          .nullish()
          .describe("Optional folder id to place the doc in"),
      },
    },
    async ({ title, markdown, folderId }) => {
      try {
        const result = await client.createDoc({
          title,
          content: markdown,
          folderId,
        });
        return text(`Created doc "${title}".\n${result.url}`);
      } catch (error) {
        return { ...text(formatError(error)), isError: true };
      }
    },
  );

  server.registerTool(
    "kindraw_create_hybrid",
    {
      description:
        "Create a hybrid item: a live markdown doc BESIDE an Excalidraw canvas, " +
        "wired together with clickable section links. Provide the full markdown " +
        "AND a diagram in ONE call. Each diagram node may carry linkToHeading " +
        "(exact heading text) to deep-link that node to its doc section. " +
        "IMPORTANT: section links attach to TOP-LEVEL headings ONLY (markdown " +
        "`#`). The doc parser nests deeper headings (`##` and below) into their " +
        "parent, so a `## Sub` is NOT linkable — structure each section you want " +
        "to link as a top-level `#`. (A title `#` plus `#` sections all become " +
        "top-level and are all linkable; for a non-linkable lead-in, put prose " +
        "BEFORE the first `#`.) Returns the /hybrid/<id> URL plus a report of how " +
        "many links were wired and any linkToHeading that matched no top-level " +
        "section (with the list of headings you CAN link to, so you can retry).",
      inputSchema: {
        title: z.string().max(500).describe("Title for the hybrid item"),
        markdown: z
          .string()
          .max(500_000)
          .describe("Full doc body (GFM). Headings become linkable sections."),
        folderId: z.string().max(200).nullish().describe("Optional folder id"),
        diagram: z
          .object({
            nodes: z
              .array(
                z.object({
                  id: z.string().max(200),
                  label: z.string().max(2000),
                  shape: z
                    .enum(["rectangle", "diamond", "ellipse", "sticky"])
                    .optional(),
                  group: z
                    .string()
                    .max(200)
                    .optional()
                    .describe(
                      "Optional group id; renders as a labeled frame boundary " +
                        "around members. Must match a `groups` entry.",
                    ),
                  strokeColor: z.string().max(64).optional(),
                  backgroundColor: z.string().max(64).optional(),
                  linkToHeading: z
                    .string()
                    .max(500)
                    .optional()
                    .describe(
                      "Exact text of a TOP-LEVEL heading (markdown `#`) to " +
                        "deep-link this node to its doc section. Section links " +
                        "attach to top-level sections only — a `##`/deeper " +
                        "heading is nested into its parent and is NOT linkable; " +
                        "promote it to a `#` to link it.",
                    ),
                }),
              )
              .min(1)
              .max(500),
            edges: z
              .array(
                z.object({
                  from: z.string().max(200),
                  to: z.string().max(200),
                  label: z.string().max(2000).optional(),
                  style: z.enum(["solid", "dashed", "dotted"]).optional(),
                }),
              )
              .max(2000),
            groups: z
              .array(
                z.object({
                  id: z.string().max(200),
                  label: z.string().max(2000).optional(),
                }),
              )
              .max(200)
              .optional()
              .describe(
                "Optional groups: each renders as a labeled frame wrapping its " +
                  "member nodes (C4 boundary / swimlane).",
              ),
            direction: z.enum(["TB", "BT", "LR", "RL"]).optional(),
            engine: z.enum(["dagre", "elk"]).optional(),
          })
          .describe("The canvas graph beside the doc"),
        icons: z
          .array(
            z.object({
              iconId: z
                .string()
                .max(200)
                .describe("Iconify id 'prefix:name' from kindraw_search_icons"),
              color: z
                .string()
                .max(64)
                .optional()
                .describe("Optional hex color for the icon"),
            }),
          )
          .max(100)
          .optional()
          .describe(
            "Icons to embed as images on the canvas (SVG fetched + embedded " +
              "for you). Grid-placed in a band below the diagram.",
          ),
      },
    },
    async ({ title, markdown, folderId, diagram, icons }) => {
      try {
        const { composeHybrid, HybridPartialError } = await import(
          "@kindraw/client/hybrid"
        );
        try {
          const res = await composeHybrid(client, {
            title,
            markdown,
            folderId,
            diagram: diagram as Parameters<typeof composeHybrid>[1]["diagram"],
            icons,
          });
          const warn = res.unmatchedHeadings.length
            ? `\n⚠️ ${res.unmatchedHeadings.length} linkToHeading value(s) ` +
              `didn't match a top-level section: ` +
              `${res.unmatchedHeadings.join(", ")}. ` +
              `Section links attach to TOP-LEVEL headings (markdown \`#\`) only. ` +
              `Linkable headings in this doc: ` +
              `${
                res.linkableHeadings.length
                  ? res.linkableHeadings.join(", ")
                  : "(none — the doc has no top-level `#` headings)"
              }. ` +
              `To link a node to a subsection, promote that heading to a ` +
              `top-level \`#\` in the markdown, or set linkToHeading to one of ` +
              `the linkable headings above.`
            : "";
          const iconWarn = res.iconWarnings.length
            ? `\nWARNING: ${res.iconWarnings.length} icon(s) could not be ` +
              `fetched and were skipped: ${res.iconWarnings.join(", ")}.`
            : "";
          return text(
            `Created hybrid "${title}" (${res.elementCount} canvas elements, ` +
              `${res.linksWired} section link(s) wired).\n${res.url}${warn}${iconWarn}`,
          );
        } catch (err) {
          if (err instanceof HybridPartialError) {
            return {
              ...text(
                `Hybrid partially created (step "${err.failedStep}" failed): ${err.message}\n` +
                  `hybridId=${err.hybridId} docItemId=${err.docItemId} ` +
                  `drawingItemId=${err.drawingItemId}. PUTs are idempotent — retry the ` +
                  `failed content write rather than re-creating.`,
              ),
              isError: true,
            };
          }
          throw err;
        }
      } catch (error) {
        return { ...text(formatError(error)), isError: true };
      }
    },
  );

  server.registerTool(
    "kindraw_create_board",
    {
      description:
        "Generate a complete ENGINEERING board (doc + linked canvas) from a typed " +
        "payload — the 'describe a board, it materializes' tool. Pick a `type` and " +
        "fill its fields; Kindraw emits a hybrid where every diagram node deep-links " +
        "to its doc section (no doc↔canvas drift, by construction). Types: `adr` " +
        "(Architecture Decision Record: context→decision→consequences + " +
        "alternatives), `c4-context` (a system, its users and external systems in a " +
        "labeled boundary frame), `sequence` (participants + ordered interactions). " +
        "Use kindraw_list_boards to see them. Returns the hybrid URL.",
      inputSchema: {
        board: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("adr"),
            title: z.string().max(500).describe("ADR title"),
            status: z
              .string()
              .max(100)
              .optional()
              .describe("e.g. Proposed / Accepted / Superseded"),
            context: z.string().max(20000).describe("The forces at play"),
            decision: z.string().max(20000).describe("What was decided"),
            consequences: z
              .string()
              .max(20000)
              .describe("Resulting trade-offs"),
            alternatives: z
              .array(
                z.object({
                  name: z.string().max(200),
                  note: z.string().max(5000).optional(),
                }),
              )
              .max(20)
              .optional()
              .describe("Options considered but not chosen"),
          }),
          z.object({
            type: z.literal("c4-context"),
            title: z.string().max(500),
            system: z.object({
              name: z.string().max(200),
              description: z.string().max(5000).optional(),
            }),
            users: z
              .array(
                z.object({
                  name: z.string().max(200),
                  note: z.string().max(2000).optional(),
                }),
              )
              .max(50)
              .optional(),
            externalSystems: z
              .array(
                z.object({
                  name: z.string().max(200),
                  note: z.string().max(2000).optional(),
                }),
              )
              .max(50)
              .optional(),
          }),
          z.object({
            type: z.literal("sequence"),
            title: z.string().max(500),
            summary: z.string().max(5000).optional(),
            participants: z
              .array(
                z.object({
                  name: z.string().max(200),
                  note: z.string().max(2000).optional(),
                }),
              )
              .min(1)
              .max(50),
            steps: z
              .array(
                z.object({
                  from: z.string().max(200),
                  to: z.string().max(200),
                  label: z.string().max(500),
                }),
              )
              .max(200),
          }),
        ]),
        folderId: z
          .string()
          .max(200)
          .nullish()
          .describe("Optional folder id to place the board in"),
      },
    },
    async ({ board, folderId }) => {
      try {
        const { composeBoard } = await import("@kindraw/client/boards");
        const { type, ...payload } = board;
        const res = await composeBoard(client, { type, payload, folderId });
        const drift = res.unmatchedHeadings.length
          ? `\n⚠ Unmatched headings: ${res.unmatchedHeadings.join(", ")} ` +
            `(linkable: ${res.linkableHeadings.join(", ")})`
          : "";
        return text(
          `Created ${type} board "${board.title}" (${res.elementCount} elements, ` +
            `${res.linksWired} section links wired).\n${res.url}${drift}`,
        );
      } catch (error) {
        return { ...text(formatError(error)), isError: true };
      }
    },
  );

  server.registerTool(
    "kindraw_list_boards",
    {
      description:
        "List the available engineering board recipes for kindraw_create_board " +
        "(type, title, and what each produces).",
      inputSchema: {},
    },
    async () => {
      try {
        const { listBoards } = await import("@kindraw/client/boards");
        const lines = listBoards()
          .map((b) => `- ${b.type}: ${b.title} — ${b.summary}`)
          .join("\n");
        return text(`Available boards:\n${lines}`);
      } catch (error) {
        return { ...text(formatError(error)), isError: true };
      }
    },
  );

  server.registerTool(
    "kindraw_list_templates",
    {
      description:
        "List the built-in Kindraw templates (id, title, category). Template ids " +
        "are opaque — list them first, then pass an id to kindraw_apply_template.",
      inputSchema: {
        category: z
          .string()
          .max(100)
          .optional()
          .describe("Optional client-side category filter"),
      },
    },
    async ({ category }) => {
      try {
        const { templates } = await client.listTemplates();
        const filtered = category
          ? templates.filter((t) => t.category === category)
          : templates;
        if (!filtered.length) {
          return text("No templates found.");
        }
        return text(
          filtered
            .map(
              (t) =>
                `- ${t.id} — ${t.title}${t.category ? ` [${t.category}]` : ""}`,
            )
            .join("\n"),
        );
      } catch (error) {
        return { ...text(formatError(error)), isError: true };
      }
    },
  );

  server.registerTool(
    "kindraw_apply_template",
    {
      description:
        "Instantiate a built-in template by id into a NEW drawing, or — if " +
        "hybridDrawingItemId is set — write it into an existing hybrid canvas. " +
        "Optionally add extraNodes/extraEdges (laid out and merged beside the " +
        "template) and icons[] (Iconify ids from kindraw_search_icons, embedded " +
        "as images). List ids first with kindraw_list_templates.",
      inputSchema: {
        templateId: z.string().max(200).describe("Template id to instantiate"),
        title: z
          .string()
          .max(500)
          .optional()
          .describe(
            "Title for the new drawing (ignored when writing to a hybrid)",
          ),
        hybridDrawingItemId: z
          .string()
          .max(200)
          .optional()
          .describe(
            "If set, PUT into this existing hybrid canvas instead of a new drawing",
          ),
        extraNodes: z
          .array(
            z.object({
              id: z.string().max(200),
              label: z.string().max(2000),
              shape: z
                .enum(["rectangle", "diamond", "ellipse", "sticky"])
                .optional(),
            }),
          )
          .max(500)
          .optional()
          .describe("Extra nodes to add beside the template"),
        extraEdges: z
          .array(
            z.object({ from: z.string().max(200), to: z.string().max(200) }),
          )
          .max(2000)
          .optional(),
        icons: z
          .array(
            z.object({
              iconId: z
                .string()
                .max(200)
                .describe("Iconify id 'prefix:name' from kindraw_search_icons"),
              color: z
                .string()
                .max(64)
                .optional()
                .describe("Optional hex color for the icon"),
            }),
          )
          .max(100)
          .optional()
          .describe(
            "Icons to embed as images (SVG fetched + embedded for you). " +
              "Grid-placed in a band below the canvas content.",
          ),
      },
    },
    async ({
      templateId,
      title,
      hybridDrawingItemId,
      extraNodes,
      extraEdges,
      icons,
    }) => {
      try {
        const tpl = await client.getTemplate(templateId);
        const { buildScene, buildFromSkeletons, sceneMaxY } = await import(
          "@kindraw/client/scene"
        );
        const { composeIconImages } = await import("@kindraw/client");

        // Gap between the canvas content's bottom edge and the icon grid, so
        // grid-placed icons clear the template/extra nodes instead of landing on
        // top of them. (BizLogic MEDIUM-1.)
        const ICON_GRID_GAP = 40;

        let content: string;
        let elementCount: number;
        let warnings: string[] = [];
        if (extraNodes?.length) {
          // Extra nodes need real layout, so serialize the template
          // (reanchor-free) into elements and merge them + any icons via
          // buildScene's additive extras.
          const { elements: templateElements } = await buildFromSkeletons(
            tpl.elements,
          );
          // Measure the content's bottom edge (template + laid-out extra nodes)
          // BEFORE composing icons, so the icon grid starts below it. Build the
          // node scene once without icons to get deterministic extra-node
          // positions; icons are additive and don't shift them.
          let imageSkeletons: Array<Record<string, unknown>> = [];
          let files: Record<string, unknown> = {};
          if (icons?.length) {
            const probe = await buildScene(
              { nodes: extraNodes, edges: extraEdges ?? [] },
              { templateElements },
            );
            const originY =
              sceneMaxY(JSON.parse(probe.content).elements) + ICON_GRID_GAP;
            ({ imageSkeletons, files, warnings } = await composeIconImages(
              icons,
              (id, color) => client.getIconSvg(id, color),
              { originY },
            ));
          }
          ({ content, elementCount } = await buildScene(
            { nodes: extraNodes, edges: extraEdges ?? [] },
            { templateElements, iconImages: imageSkeletons, files },
          ));
        } else {
          // No extra nodes: serialize the template (plus any icon image
          // skeletons, grid-placed) directly — no layout needed. Icon skeletons
          // are valid convertToExcalidrawElements input, so they ride along. The
          // template elements carry absolute positions, so grid icons must start
          // below the template's bottom edge to avoid overlapping it.
          let imageSkeletons: Array<Record<string, unknown>> = [];
          let files: Record<string, unknown> = {};
          if (icons?.length) {
            const originY = sceneMaxY(tpl.elements) + ICON_GRID_GAP;
            ({ imageSkeletons, files, warnings } = await composeIconImages(
              icons,
              (id, color) => client.getIconSvg(id, color),
              { originY },
            ));
          }
          const built = await buildFromSkeletons(
            [...tpl.elements, ...imageSkeletons],
            { files },
          );
          content = built.content;
          elementCount = built.elementCount;
        }

        const warn = warnings.length
          ? `\nWARNING: ${warnings.length} icon(s) could not be fetched and ` +
            `were skipped: ${warnings.join(", ")}.`
          : "";

        if (hybridDrawingItemId) {
          JSON.parse(content); // defensive (PUT does not validate)
          await client.updateHybridDrawing(hybridDrawingItemId, content);
          return text(
            `Applied template "${tpl.title}" to hybrid canvas ${hybridDrawingItemId} ` +
              `(${elementCount} elements).${warn}`,
          );
        }

        const result = await client.createDrawing({
          title: title || tpl.title,
          content,
        });
        return text(
          `Created drawing "${title || tpl.title}" from template ` +
            `(${elementCount} elements).\n${result.url}${warn}`,
        );
      } catch (error) {
        return { ...text(formatError(error)), isError: true };
      }
    },
  );

  server.registerTool(
    "kindraw_search_icons",
    {
      description:
        "Search the Iconify icon set (returns id + set/name). Pick ids from here, " +
        "then pass them as icons[] to kindraw_apply_template — the SVG is " +
        "embedded for you. (No raw-SVG tool: SVG strings waste tokens.)",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .max(200)
          .describe("Search term, e.g. 'database'"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(96)
          .optional()
          .describe("Max results (default 48)"),
      },
    },
    async ({ query, limit }) => {
      try {
        const { icons } = await client.searchIcons(query, limit ?? 48);
        if (!icons.length) {
          return text(`No icons found for "${query}".`);
        }
        return text(
          icons.map((i) => `${i.id} — ${i.set}/${i.name}`).join("\n"),
        );
      } catch (error) {
        return { ...text(formatError(error)), isError: true };
      }
    },
  );

  server.registerTool(
    "kindraw_create_drawing",
    {
      description:
        "Create a drawing from pre-serialized Excalidraw JSON content. Use " +
        "kindraw_create_diagram for Mermaid; use this only if you already have " +
        "valid .excalidraw content.",
      inputSchema: {
        title: z.string().describe("Title for the new drawing"),
        content: z.string().describe("Serialized Excalidraw JSON content"),
      },
    },
    async ({ title, content }) => {
      try {
        const result = await client.createDrawing({ title, content });
        return text(`Created drawing "${title}".\n${result.url}`);
      } catch (error) {
        return { ...text(formatError(error)), isError: true };
      }
    },
  );

  server.registerTool(
    "kindraw_list_items",
    {
      description:
        "List the drawings and docs in the user's Kindraw workspace.",
      inputSchema: {},
    },
    async () => {
      try {
        const { items } = await client.listItems();
        if (!items.length) {
          return text("No items in the workspace yet.");
        }
        return text(
          items
            .map((item) => `- [${item.kind}] ${item.title} (${item.id})`)
            .join("\n"),
        );
      } catch (error) {
        return { ...text(formatError(error)), isError: true };
      }
    },
  );

  server.registerTool(
    "kindraw_get_item",
    {
      description:
        "Fetch one item (drawing or doc) by id, including its content.",
      inputSchema: { id: z.string().describe("The item id") },
    },
    async ({ id }) => {
      try {
        const { item, content } = await client.getItem(id);
        return text(`${item.title} (${item.kind}, ${item.id})\n\n${content}`);
      } catch (error) {
        return { ...text(formatError(error)), isError: true };
      }
    },
  );

  server.registerTool(
    "kindraw_delete_item",
    {
      description:
        "Delete an item by id. This is permanent. Handles drawings, docs, AND " +
        "hybrids: a hybrid is removed via its dedicated route and its backing " +
        "doc + drawing items are cleaned up too (otherwise they'd be orphaned " +
        "as loose items). The kind is auto-detected from the workspace.",
      inputSchema: { id: z.string().describe("The item id to delete") },
    },
    async ({ id }) => {
      try {
        const kind = await client.deleteAny(id);
        return text(`Deleted ${kind} ${id}.`);
      } catch (error) {
        return { ...text(formatError(error)), isError: true };
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error("kindraw-mcp server running on stdio");
};

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(
    `kindraw-mcp failed to start: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
});
