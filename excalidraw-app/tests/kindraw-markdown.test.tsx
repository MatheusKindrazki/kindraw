import { describe, expect, it } from "vitest";

import { parseMarkdownBlocks } from "../kindraw/MarkdownPreview";

describe("Kindraw markdown preview parser", () => {
  it("parses headings, paragraphs and code fences", () => {
    const tokens = parseMarkdownBlocks(
      "# Titulo\n\nTexto comum.\n\n```ts\nconst a = 1;\n```",
    ).filter((token) => token.type !== "space");

    expect(tokens.map((token) => token.type)).toEqual([
      "heading",
      "paragraph",
      "code",
    ]);
    expect(tokens[0]).toMatchObject({
      depth: 1,
      text: "Titulo",
    });
    expect(tokens[2]).toMatchObject({
      lang: "ts",
      text: "const a = 1;",
    });
  });

  it("detects mermaid blocks and lists", () => {
    const tokens = parseMarkdownBlocks(
      "```mermaid\nflowchart LR\nA-->B\n```\n\n- item 1\n- item 2",
    ).filter((token) => token.type !== "space");

    expect(tokens.map((token) => token.type)).toEqual(["code", "list"]);
    expect(tokens[0]).toMatchObject({
      lang: "mermaid",
      text: "flowchart LR\nA-->B",
    });
    expect(tokens[1]).toMatchObject({
      ordered: false,
      items: expect.arrayContaining([
        expect.objectContaining({
          text: "item 1",
        }),
      ]),
    });
  });
});
