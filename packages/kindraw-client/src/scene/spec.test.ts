import { describe, expect, it } from "vitest";

import { validateDiagramSpec } from "./spec";

describe("validateDiagramSpec", () => {
  it("accepts a minimal valid spec", () => {
    const spec = {
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "a", to: "b" }],
    };
    expect(() => validateDiagramSpec(spec)).not.toThrow();
  });

  it("rejects a spec with no nodes", () => {
    expect(() => validateDiagramSpec({ nodes: [], edges: [] })).toThrow(
      /at least one node/i,
    );
  });

  it("rejects duplicate node ids", () => {
    expect(() =>
      validateDiagramSpec({
        nodes: [
          { id: "x", label: "X" },
          { id: "x", label: "X2" },
        ],
        edges: [],
      }),
    ).toThrow(/duplicate node id/i);
  });

  it("rejects an edge referencing an unknown node", () => {
    expect(() =>
      validateDiagramSpec({
        nodes: [{ id: "a", label: "A" }],
        edges: [{ from: "a", to: "ghost" }],
      }),
    ).toThrow(/unknown node/i);
  });

  it("rejects an invalid shape", () => {
    expect(() =>
      validateDiagramSpec({
        nodes: [{ id: "a", label: "A", shape: "octagon" }],
        edges: [],
      }),
    ).toThrow(/shape/i);
  });

  it("returns a normalized spec with defaults applied", () => {
    const out = validateDiagramSpec({
      nodes: [{ id: "a", label: "A" }],
      edges: [],
    });
    expect(out.direction).toBe("TB");
    expect(out.nodes[0].shape).toBe("rectangle");
  });

  // FIX 1 (Security C1) — resource caps
  describe("resource caps", () => {
    it("rejects a spec with too many nodes (501)", () => {
      const nodes = Array.from({ length: 501 }, (_, i) => ({
        id: `n${i}`,
        label: `N${i}`,
      }));
      expect(() => validateDiagramSpec({ nodes, edges: [] })).toThrow(
        /too many nodes/i,
      );
    });

    it("rejects a spec with too many edges (2001)", () => {
      const edges = Array.from({ length: 2001 }, () => ({
        from: "a",
        to: "b",
      }));
      expect(() =>
        validateDiagramSpec({
          nodes: [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
          ],
          edges,
        }),
      ).toThrow(/too many edges/i);
    });

    it("rejects a spec with too many groups (201)", () => {
      const groups = Array.from({ length: 201 }, (_, i) => ({ id: `g${i}` }));
      expect(() =>
        validateDiagramSpec({
          nodes: [{ id: "a", label: "A" }],
          edges: [],
          groups,
        }),
      ).toThrow(/too many groups/i);
    });

    it("rejects a node label longer than the max length", () => {
      const label = "x".repeat(2001);
      expect(() =>
        validateDiagramSpec({
          nodes: [{ id: "a", label }],
          edges: [],
        }),
      ).toThrow(/label/i);
    });
  });

  // FIX 2 (Security H1) — reserved ids
  describe("reserved ids", () => {
    it("rejects a node id that is a reserved prototype key", () => {
      expect(() =>
        validateDiagramSpec({
          nodes: [
            { id: "a", label: "A" },
            { id: "__proto__", label: "P" },
          ],
          edges: [{ from: "a", to: "__proto__" }],
        }),
      ).toThrow(/reserved/i);
    });

    it("rejects a reserved group id", () => {
      expect(() =>
        validateDiagramSpec({
          nodes: [{ id: "a", label: "A" }],
          edges: [],
          groups: [{ id: "constructor" }],
        }),
      ).toThrow(/reserved/i);
    });
  });

  // FIX A (Code H1+H2) — reserved generated-element id prefixes
  describe("reserved id prefixes", () => {
    it('rejects a node id starting with "text-" (collides with bound-text ids)', () => {
      expect(() =>
        validateDiagramSpec({
          nodes: [
            { id: "text-b", label: "X" },
            { id: "b", label: "Y" },
          ],
          edges: [],
        }),
      ).toThrow(/reserved/i);
    });

    it('rejects a node id starting with "arrow-" (collides with generated arrow ids)', () => {
      expect(() =>
        validateDiagramSpec({
          nodes: [
            { id: "arrow-0", label: "X" },
            { id: "b", label: "Y" },
          ],
          edges: [{ from: "arrow-0", to: "b" }],
        }),
      ).toThrow(/reserved/i);
    });

    it('rejects a group id starting with a reserved prefix', () => {
      expect(() =>
        validateDiagramSpec({
          nodes: [{ id: "a", label: "A" }],
          edges: [],
          groups: [{ id: "text-g" }],
        }),
      ).toThrow(/reserved/i);
    });
  });

  // FIX C (Security H2) — id length cap (defense in depth)
  describe("id length cap", () => {
    it("rejects a node id longer than the max length (201 chars)", () => {
      const id = "n".repeat(201);
      expect(() =>
        validateDiagramSpec({
          nodes: [{ id, label: "A" }],
          edges: [],
        }),
      ).toThrow(/too long|id/i);
    });

    it("rejects a group id longer than the max length", () => {
      const id = "g".repeat(201);
      expect(() =>
        validateDiagramSpec({
          nodes: [{ id: "a", label: "A" }],
          edges: [],
          groups: [{ id }],
        }),
      ).toThrow(/too long|id/i);
    });

    it("rejects an edge endpoint longer than the max length", () => {
      const id = "z".repeat(201);
      expect(() =>
        validateDiagramSpec({
          nodes: [{ id: "a", label: "A" }],
          edges: [{ from: "a", to: id }],
        }),
      ).toThrow(/too long|id|unknown/i);
    });
  });

  // FIX 3 (BizLogic HIGH-1) — trim/whitespace ids
  describe("whitespace ids", () => {
    it("rejects a node id that is whitespace-only", () => {
      expect(() =>
        validateDiagramSpec({
          nodes: [{ id: "  ", label: "A" }],
          edges: [],
        }),
      ).toThrow(/non-empty string id/i);
    });

    it("rejects a node id with leading/trailing whitespace", () => {
      expect(() =>
        validateDiagramSpec({
          nodes: [{ id: " a ", label: "A" }],
          edges: [],
        }),
      ).toThrow();
    });

    it("rejects an edge endpoint with surrounding whitespace", () => {
      expect(() =>
        validateDiagramSpec({
          nodes: [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
          ],
          edges: [{ from: " a ", to: "b" }],
        }),
      ).toThrow();
    });
  });

  // FIX 4 (BizLogic MEDIUM-1 + H2 + MEDIUM-4) — groups, edges, colors
  describe("groups, edges, colors", () => {
    it("rejects a node referencing an unknown group", () => {
      expect(() =>
        validateDiagramSpec({
          nodes: [{ id: "a", label: "A", group: "ghost" }],
          edges: [],
        }),
      ).toThrow(/unknown group/i);
    });

    it("accepts a node referencing a declared group", () => {
      expect(() =>
        validateDiagramSpec({
          nodes: [{ id: "a", label: "A", group: "g1" }],
          edges: [],
          groups: [{ id: "g1", label: "Group 1" }],
        }),
      ).not.toThrow();
    });

    it("rejects duplicate group ids", () => {
      expect(() =>
        validateDiagramSpec({
          nodes: [{ id: "a", label: "A" }],
          edges: [],
          groups: [{ id: "g1" }, { id: "g1" }],
        }),
      ).toThrow(/duplicate group id/i);
    });

    it("rejects an invalid edge style", () => {
      expect(() =>
        validateDiagramSpec({
          nodes: [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
          ],
          edges: [{ from: "a", to: "b", style: "wavy" }],
        }),
      ).toThrow(/style/i);
    });

    it("rejects an invalid node color", () => {
      expect(() =>
        validateDiagramSpec({
          nodes: [{ id: "a", label: "A", strokeColor: "red" }],
          edges: [],
        }),
      ).toThrow(/invalid color/i);
    });

    it("accepts valid hex colors and transparent", () => {
      expect(() =>
        validateDiagramSpec({
          nodes: [
            { id: "a", label: "A", strokeColor: "#1971c2" },
            { id: "b", label: "B", backgroundColor: "transparent" },
            { id: "c", label: "C", strokeColor: "#fff" },
          ],
          edges: [],
        }),
      ).not.toThrow();
    });
  });

  // FIX 5 (BizLogic MEDIUM-2) — dedup edges
  describe("edge de-duplication", () => {
    it("drops exact-duplicate edges (same from|to|label|style)", () => {
      const out = validateDiagramSpec({
        nodes: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        edges: [
          { from: "a", to: "b" },
          { from: "a", to: "b" },
        ],
      });
      expect(out.edges).toHaveLength(1);
    });

    it("keeps edges that differ by label or style", () => {
      const out = validateDiagramSpec({
        nodes: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        edges: [
          { from: "a", to: "b" },
          { from: "a", to: "b", label: "x" },
          { from: "a", to: "b", style: "dashed" },
        ],
      });
      expect(out.edges).toHaveLength(3);
    });

    it("allows self-loops (from === to)", () => {
      expect(() =>
        validateDiagramSpec({
          nodes: [{ id: "a", label: "A" }],
          edges: [{ from: "a", to: "a" }],
        }),
      ).not.toThrow();
    });
  });
});
