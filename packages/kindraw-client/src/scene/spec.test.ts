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
});
