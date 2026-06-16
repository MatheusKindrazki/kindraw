import { requireClient } from "../client.js";

import { readSource } from "./generate.js";

// `kindraw templates list [--category C] [--json]`
export const templatesList = async (args: {
  category?: string;
  json?: boolean;
}): Promise<void> => {
  const client = requireClient();
  const { templates } = await client.listTemplates();
  const filtered = args.category
    ? templates.filter((t) => t.category === args.category)
    : templates;
  if (args.json) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }
  if (!filtered.length) {
    console.log("No templates.");
    return;
  }
  for (const t of filtered) {
    console.log(`${t.id}\t${t.title}${t.category ? `\t[${t.category}]` : ""}`);
  }
};

// `kindraw templates apply <id> [--title T] [--spec extra.json] [--hybrid-drawing <id>] [--json]`
// Instantiates a template (reanchor-free). With --spec, the extra {nodes,edges}
// are laid out and merged beside the template. Writes to a NEW drawing, or PUTs
// into an existing hybrid canvas when --hybrid-drawing is given.
export const templatesApply = async (args: {
  id?: string;
  title?: string;
  spec?: string;
  hybridDrawing?: string;
  json?: boolean;
}): Promise<void> => {
  if (!args.id) {
    throw new Error(
      "Usage: kindraw templates apply <id> [--title T] [--spec extra.json] [--hybrid-drawing <id>]",
    );
  }
  const client = requireClient();
  const tpl = await client.getTemplate(args.id);
  const { buildFromSkeletons, buildScene } = await import(
    "@kindraw/client/scene"
  );
  const { elements: templateElements } = await buildFromSkeletons(tpl.elements);

  let content: string;
  let elementCount: number;
  if (args.spec) {
    let extra: { nodes?: unknown[]; edges?: unknown[] };
    try {
      extra = JSON.parse(readSource(args.spec));
    } catch {
      throw new Error("--spec must be valid JSON ({nodes,edges}).");
    }
    ({ content, elementCount } = await buildScene(
      {
        nodes: (extra.nodes ?? []) as never,
        edges: (extra.edges ?? []) as never,
      },
      { templateElements },
    ));
  } else {
    ({ content, elementCount } = await buildFromSkeletons(tpl.elements));
  }

  if (args.hybridDrawing) {
    JSON.parse(content); // defensive (PUT does not validate)
    await client.updateHybridDrawing(args.hybridDrawing, content);
    console.log(
      `Applied "${tpl.title}" to hybrid canvas ${args.hybridDrawing} (${elementCount} elements).`,
    );
    return;
  }
  const result = await client.createDrawing({
    title: args.title || tpl.title,
    content,
  });
  if (args.json) {
    console.log(JSON.stringify({ url: result.url, elementCount }));
    return;
  }
  console.log(
    `Created "${args.title || tpl.title}" (${elementCount} elements)`,
  );
  console.log(result.url);
};
