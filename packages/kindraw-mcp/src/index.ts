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
        "and engine (dagre, or elk for orthogonal routing). Returns the drawing URL.",
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
                .enum(["rectangle", "diamond", "ellipse"])
                .optional()
                .describe("Node shape (default rectangle)"),
              group: z
                .string()
                .max(200)
                .optional()
                .describe("Optional group id (reserved for grouping)"),
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
                .describe("Optional group label"),
            }),
          )
          .max(200)
          .optional()
          .describe("Optional node groups (up to 200)"),
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
        "(exact heading text) to deep-link that node to its doc section. Returns " +
        "the /hybrid/<id> URL plus a report of how many links were wired and any " +
        "linkToHeading that matched NO heading (fix the heading text and retry).",
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
                  shape: z.enum(["rectangle", "diamond", "ellipse"]).optional(),
                  group: z.string().max(200).optional(),
                  strokeColor: z.string().max(64).optional(),
                  backgroundColor: z.string().max(64).optional(),
                  linkToHeading: z
                    .string()
                    .max(500)
                    .optional()
                    .describe(
                      "Exact heading text to deep-link this node to its section",
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
              .optional(),
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
              "for you). Grid-placed at the canvas origin.",
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
            ? `\nWARNING: ${res.unmatchedHeadings.length} linkToHeading value(s) ` +
              `matched no heading: ${res.unmatchedHeadings.join(", ")}. ` +
              `Fix the heading text and retry.`
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
              shape: z.enum(["rectangle", "diamond", "ellipse"]).optional(),
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
              "Placed on a grid at the canvas origin.",
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
        const { buildScene, buildFromSkeletons } = await import(
          "@kindraw/client/scene"
        );
        const { composeIconImages } = await import("@kindraw/client");

        // Compose any requested icons up-front (fetch-free composer; we inject
        // the client's getIconSvg). Skipped icons return as warnings.
        const { imageSkeletons, files, warnings } = icons?.length
          ? await composeIconImages(icons, (id, color) =>
              client.getIconSvg(id, color),
            )
          : { imageSkeletons: [], files: {}, warnings: [] as string[] };

        let content: string;
        let elementCount: number;
        if (extraNodes?.length) {
          // Extra nodes need real layout, so serialize the template
          // (reanchor-free) into elements and merge them + any icons via
          // buildScene's additive extras.
          const { elements: templateElements } = await buildFromSkeletons(
            tpl.elements,
          );
          ({ content, elementCount } = await buildScene(
            { nodes: extraNodes, edges: extraEdges ?? [] },
            { templateElements, iconImages: imageSkeletons, files },
          ));
        } else {
          // No extra nodes: serialize the template (plus any icon image
          // skeletons, grid-placed) directly — no layout needed. Icon skeletons
          // are valid convertToExcalidrawElements input, so they ride along.
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
        return text(icons.map((i) => `${i.id} — ${i.set}/${i.name}`).join("\n"));
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
      description: "Delete an item (drawing or doc) by id. This is permanent.",
      inputSchema: { id: z.string().describe("The item id to delete") },
    },
    async ({ id }) => {
      try {
        await client.deleteItem(id);
        return text(`Deleted ${id}.`);
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
