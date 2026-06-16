import { requireClient } from "../client.js";
import { MAX_TITLE_LEN, readSource } from "./generate.js";

const USAGE =
  "Usage: kindraw hybrid create --title <T> [--md <file|->] [--spec <file|->] [--folder <id>]";

// `kindraw hybrid create --title T [--md <file|->] [--spec <file|->] [--folder ID]`
// --md   markdown body (default "# {title}\n\n" if omitted)
// --spec a HybridDiagram JSON (nodes/edges + optional linkToHeading)
// Orchestrates seed + doc + drawing + section links via the shared composeHybrid
// and prints the canonical /hybrid/<id> URL (built client-side).
export const hybridCreate = async (args: {
  title?: string;
  md?: string;
  spec?: string;
  folder?: string;
}): Promise<void> => {
  if (!args.title) {
    throw new Error(`Provide --title.\n${USAGE}`);
  }
  const title =
    args.title.length > MAX_TITLE_LEN
      ? args.title.slice(0, MAX_TITLE_LEN)
      : args.title;

  const markdown = args.md ? readSource(args.md) : `# ${title}\n\n`;

  let diagram: { nodes: unknown[]; edges: unknown[] } = {
    nodes: [],
    edges: [],
  };
  if (args.spec) {
    try {
      diagram = JSON.parse(readSource(args.spec));
    } catch {
      throw new Error("--spec must be valid JSON (a HybridDiagram).");
    }
  }
  if (!Array.isArray(diagram.nodes) || diagram.nodes.length === 0) {
    throw new Error("--spec must contain at least one node (nodes[]).");
  }
  if (!Array.isArray(diagram.edges)) {
    diagram.edges = [];
  }

  const client = requireClient();
  const { composeHybrid } = await import("@kindraw/client/hybrid");
  const res = await composeHybrid(client, {
    title,
    markdown,
    folderId: args.folder ?? null,
    diagram: diagram as Parameters<typeof composeHybrid>[1]["diagram"],
  });

  console.log(
    `Created hybrid "${title}" (${res.elementCount} elements, ${res.linksWired} links)`,
  );
  if (res.unmatchedHeadings.length) {
    console.log(
      `WARNING: unmatched linkToHeading: ${res.unmatchedHeadings.join(", ")}`,
    );
  }
  console.log(res.url);
};
