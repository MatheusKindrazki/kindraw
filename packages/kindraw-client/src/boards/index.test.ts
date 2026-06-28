import { describe, expect, it } from "vitest";

import { parseHybridMarkdownSections } from "../sections/index";
import { validateDiagramSpec } from "../scene/spec";

import {
  BOARD_RECIPES,
  DocBuilder,
  composeBoard,
  listBoards,
  type BoardType,
} from "./index";

const RESERVED_PREFIX = /^(text|arrow|tpl|icon|meta)-/;

// Representative payloads per recipe — exercise every branch (alternatives,
// users + external systems, multi-step flow).
const SAMPLES: Record<BoardType, unknown> = {
  adr: {
    title: "Use Postgres",
    status: "Accepted",
    context: "We need a relational store.",
    decision: "Adopt Postgres.",
    consequences: "Ops must run it.",
    alternatives: [
      { name: "DynamoDB", note: "Serverless but key-value." },
      { name: "SQLite", note: "Too small for our scale." },
    ],
  },
  "c4-context": {
    title: "Billing context",
    system: { name: "Billing Service", description: "Charges customers." },
    users: [{ name: "Customer" }, { name: "Finance Admin" }],
    externalSystems: [{ name: "Stripe" }],
  },
  sequence: {
    title: "Checkout flow",
    summary: "How a checkout proceeds.",
    participants: [{ name: "Browser" }, { name: "API" }, { name: "Stripe" }],
    steps: [
      { from: "Browser", to: "API", label: "POST /checkout" },
      { from: "API", to: "Stripe", label: "charge" },
    ],
  },
};

// The TOP-LEVEL, linkable heading set the SHARED parser would resolve against.
const linkableSet = (markdown: string): Set<string> => {
  const sections = parseHybridMarkdownSections(markdown) as Array<{
    title: string;
    isIntro?: boolean;
  }>;
  return new Set(sections.filter((s) => !s.isIntro).map((s) => s.title));
};

describe("board recipes", () => {
  for (const type of Object.keys(BOARD_RECIPES) as BoardType[]) {
    describe(type, () => {
      const out = BOARD_RECIPES[type].build(SAMPLES[type] as never);

      it("links every node to a real top-level heading (no doc↔canvas drift)", () => {
        const linkable = linkableSet(out.markdown);
        for (const node of out.diagram.nodes) {
          if (node.linkToHeading) {
            expect(linkable.has(node.linkToHeading)).toBe(true);
          }
        }
      });

      it("produces a diagram that passes validateDiagramSpec", () => {
        // composeHybrid strips linkToHeading before validating — mirror that.
        expect(() =>
          validateDiagramSpec({
            nodes: out.diagram.nodes.map(({ linkToHeading, ...rest }) => rest),
            edges: out.diagram.edges,
            groups: out.diagram.groups,
            direction: out.diagram.direction,
            engine: out.diagram.engine,
          }),
        ).not.toThrow();
      });

      it("uses no reserved generated-id prefixes", () => {
        for (const node of out.diagram.nodes) {
          expect(RESERVED_PREFIX.test(node.id)).toBe(false);
        }
        for (const group of out.diagram.groups ?? []) {
          expect(RESERVED_PREFIX.test(group.id)).toBe(false);
        }
      });
    });
  }

  it("c4-context emits a labeled boundary group (→ frame)", () => {
    const out = BOARD_RECIPES["c4-context"].build(
      SAMPLES["c4-context"] as never,
    );
    expect(out.diagram.groups?.length).toBe(1);
    expect(
      out.diagram.nodes.some((n) => n.group === out.diagram.groups![0].id),
    ).toBe(true);
  });

  it("lists the available board types", () => {
    expect(
      listBoards()
        .map((b) => b.type)
        .sort(),
    ).toEqual(["adr", "c4-context", "sequence"]);
  });
});

describe("DocBuilder", () => {
  it("returns the canonical heading used as the link (heading === link)", () => {
    const doc = new DocBuilder();
    const h = doc.section("  Some\nTitle  ", "body");
    expect(h).toBe("Some Title");
    expect(doc.markdown()).toContain("# Some Title");
  });

  it("throws on a duplicate section title", () => {
    const doc = new DocBuilder();
    doc.section("Context", "a");
    expect(() => doc.section("Context", "b")).toThrow(/duplicate/i);
  });
});

describe("composeBoard", () => {
  it("rejects an unknown board type", async () => {
    await expect(
      composeBoard({} as never, { type: "nope" as BoardType, payload: {} }),
    ).rejects.toThrow(/unknown board type/i);
  });
});
