import { describe, expect, it } from "vitest";

import { layoutNodes } from "./layout";
import { validateDiagramSpec } from "./spec";

// Two boxes overlap if they intersect on BOTH axes.
const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

const chainSpec = (n: number) =>
  validateDiagramSpec({
    nodes: Array.from({ length: n }, (_, i) => ({
      id: `n${i}`,
      label: `Node ${i}`,
    })),
    edges: Array.from({ length: n - 1 }, (_, i) => ({
      from: `n${i}`,
      to: `n${i + 1}`,
    })),
  });

describe("layoutNodes (dagre)", () => {
  it("produces no overlapping nodes", () => {
    const spec = chainSpec(5);
    const placed = layoutNodes(spec);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(overlaps(placed[i], placed[j])).toBe(false);
      }
    }
  });

  it("separates ranks vertically for direction TB", () => {
    const spec = chainSpec(3);
    const placed = layoutNodes(spec);
    const byId = new Map(placed.map((p) => [p.id, p]));
    // In TB, each downstream node sits strictly below its predecessor.
    expect(byId.get("n1")!.y).toBeGreaterThan(byId.get("n0")!.y);
    expect(byId.get("n2")!.y).toBeGreaterThan(byId.get("n1")!.y);
  });

  it("lays out left-to-right for direction LR", () => {
    const spec = validateDiagramSpec({
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "a", to: "b" }],
      direction: "LR",
    });
    const placed = layoutNodes(spec);
    const byId = new Map(placed.map((p) => [p.id, p]));
    expect(byId.get("b")!.x).toBeGreaterThan(byId.get("a")!.x);
  });

  it("is deterministic: same spec → identical positions", () => {
    const spec = chainSpec(4);
    const a = layoutNodes(spec);
    const b = layoutNodes(spec);
    expect(a).toEqual(b);
  });

  it("gives every node a measured non-trivial size", () => {
    const spec = chainSpec(2);
    const placed = layoutNodes(spec);
    for (const p of placed) {
      expect(p.width).toBeGreaterThanOrEqual(60);
      expect(p.height).toBeGreaterThanOrEqual(40);
    }
  });

  // FIX 7 (Code M1) — origin normalization: top-left-most node sits at the
  // fixed margin so switching engines doesn't shift the whole diagram.
  it("normalizes origin so min x and min y are the fixed margin (20)", () => {
    const spec = chainSpec(4);
    const placed = layoutNodes(spec);
    const minX = Math.min(...placed.map((p) => p.x));
    const minY = Math.min(...placed.map((p) => p.y));
    expect(minX).toBe(20);
    expect(minY).toBe(20);
  });
});
