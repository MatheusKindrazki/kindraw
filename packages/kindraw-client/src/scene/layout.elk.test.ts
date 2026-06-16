import { describe, expect, it } from "vitest";

import { layoutNodesAsync } from "./layout";
import { validateDiagramSpec } from "./spec";

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

describe("layoutNodesAsync (elk engine)", () => {
  it("produces non-overlapping positioned nodes via elk", async () => {
    const spec = validateDiagramSpec({
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "a", to: "c" },
      ],
      engine: "elk",
    });
    const placed = await layoutNodesAsync(spec);
    expect(placed).toHaveLength(3);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(overlaps(placed[i], placed[j])).toBe(false);
      }
    }
  });

  it("falls back to dagre when engine is dagre", async () => {
    const spec = validateDiagramSpec({
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "a", to: "b" }],
      engine: "dagre",
    });
    const placed = await layoutNodesAsync(spec);
    expect(placed).toHaveLength(2);
  });

  // FIX 7 (Code M1) — elk output is origin-normalized to the same fixed margin
  // as dagre so switching engines doesn't shift the diagram.
  it("normalizes origin so min x and min y are the fixed margin (20)", async () => {
    const spec = validateDiagramSpec({
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "a", to: "c" },
      ],
      engine: "elk",
    });
    const placed = await layoutNodesAsync(spec);
    const minX = Math.min(...placed.map((p) => p.x));
    const minY = Math.min(...placed.map((p) => p.y));
    expect(minX).toBe(20);
    expect(minY).toBe(20);
  });
});
