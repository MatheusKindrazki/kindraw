import { describe, expect, it } from "vitest";

import { buildFromSkeletons } from "./buildFromSkeletons";

describe("buildFromSkeletons", () => {
  it("serializes loose skeletons into an excalidraw envelope WITHOUT re-anchoring arrows", async () => {
    // Template-shaped input: an unbound arrow with explicit points (NOT a
    // {start:{id},end:{id}} binding). reanchorArrows would displace it — this
    // serializer must leave its points intact.
    const { content, elementCount } = await buildFromSkeletons([
      {
        type: "rectangle",
        id: "r1",
        x: 0,
        y: 0,
        width: 100,
        height: 60,
        label: { text: "Box" },
      },
      {
        type: "arrow",
        x: 120,
        y: 30,
        width: 80,
        height: 0,
        points: [
          [0, 0],
          [80, 0],
        ],
      },
    ]);
    const parsed = JSON.parse(content);
    expect(parsed.type).toBe("excalidraw");
    expect(parsed.source).toBe("@kindraw/client");
    const arrow = parsed.elements.find(
      (e: { type: string }) => e.type === "arrow",
    );
    // The explicit 2-point route is preserved as the arrow's OWN points (NOT
    // collapsed/rebound to node borders). convertToExcalidrawElements applies a
    // tiny deterministic endpoint inset (~1px) for the line cap, so we assert
    // the shape (2 points, near the original 0→80 horizontal segment) rather
    // than byte-identical coordinates — the point is it was never reanchored.
    expect(arrow.points).toHaveLength(2);
    expect(arrow.points[0]).toEqual([0, 0]);
    expect(arrow.points[1][0]).toBeGreaterThan(70);
    expect(arrow.points[1][1]).toBe(0);
    // Unbound: reanchorArrows would have set start/end bindings to node ids.
    expect(arrow.startBinding ?? null).toBeNull();
    expect(arrow.endBinding ?? null).toBeNull();
    expect(elementCount).toBeGreaterThanOrEqual(2);
  });

  it("namespaces ingested ids with a tpl- prefix to avoid collisions", async () => {
    const { content } = await buildFromSkeletons([
      { type: "rectangle", id: "r1", x: 0, y: 0, width: 10, height: 10 },
    ]);
    const ids = JSON.parse(content).elements.map((e: { id: string }) => e.id);
    expect(ids.some((id: string) => id.startsWith("tpl-"))).toBe(true);
  });

  it("is deterministic", async () => {
    const skel = [
      { type: "rectangle", id: "r1", x: 0, y: 0, width: 10, height: 10 },
    ];
    const a = await buildFromSkeletons(skel);
    const b = await buildFromSkeletons(skel);
    expect(a.content).toBe(b.content);
  });

  it("round-trips a real-template-shaped arrow with a multi-point route", async () => {
    // Mirrors the org-chart connector shape from workers/api/src/templates.ts:
    // an unbound arrow with a 4-point orthogonal route + endArrowhead.
    const { content } = await buildFromSkeletons([
      {
        type: "arrow",
        x: 400,
        y: 70,
        points: [
          [0, 0],
          [0, 55],
          [-200, 55],
          [-200, 110],
        ],
        endArrowhead: "arrow",
      },
    ]);
    const arrow = JSON.parse(content).elements.find(
      (e: { type: string }) => e.type === "arrow",
    );
    // The 4-point orthogonal route survives (no reanchor); the transform insets
    // the final cap ~1px so we assert the route shape, not exact coordinates.
    expect(arrow.points).toHaveLength(4);
    expect(arrow.points[0]).toEqual([0, 0]);
    // Mid waypoints keep the orthogonal turn (x stays 0 then jumps to -200).
    expect(arrow.points[1][0]).toBe(0);
    expect(arrow.points[2][0]).toBe(-200);
    expect(arrow.points[3][0]).toBe(-200);
    // The element's absolute anchor is preserved within ~1px (NOT recomputed
    // from node borders, which reanchor would do).
    expect(Math.abs(arrow.x - 400)).toBeLessThanOrEqual(1);
    expect(Math.abs(arrow.y - 70)).toBeLessThanOrEqual(1);
    expect(arrow.startBinding ?? null).toBeNull();
    expect(arrow.endBinding ?? null).toBeNull();
  });
});
