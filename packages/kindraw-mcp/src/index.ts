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
        const { content, elementCount } =
          await generateExcalidrawFromMermaid(mermaid);
        const result = await client.createDrawing({
          title: title || "Untitled drawing",
          content,
        });
        return text(
          `Created drawing "${title || "Untitled drawing"}" (${elementCount} elements).\n${result.url}`,
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
          `Created diagram "${title || "Untitled diagram"}" (${elementCount} elements).\n${result.url}`,
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
        "for canvas diagrams.",
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
      description: "List the drawings and docs in the user's Kindraw workspace.",
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
    `kindraw-mcp failed to start: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
