import { describe, expect, it } from "vitest";

import { reanchorArrows } from "./reanchor";

// Helper: is point p on (within 1px of) the border of node n?
const onBorder = (
  p: [number, number],
  n: { x: number; y: number; width: number; height: number },
) => {
  const l = n.x;
  const r = n.x + n.width;
  const t = n.y;
  const b = n.y + n.height;
  const nearV = (Math.abs(p[0] - l) < 1 || Math.abs(p[0] - r) < 1) &&
    p[1] >= t - 1 &&
    p[1] <= b + 1;
  const nearH = (Math.abs(p[1] - t) < 1 || Math.abs(p[1] - b) < 1) &&
    p[0] >= l - 1 &&
    p[0] <= r + 1;
  return nearV || nearH;
};

describe("reanchorArrows", () => {
  it("rewrites a bound arrow to connect the borders of its two nodes", () => {
    const elements = [
      { id: "n1", type: "rectangle", x: 0, y: 0, width: 100, height: 50 },
      { id: "n2", type: "rectangle", x: 0, y: 200, width: 100, height: 50 },
      {
        id: "a1",
        type: "arrow",
        x: 999,
        y: 999, // intentionally wrong starting point
        width: 0,
        height: 0,
        points: [
          [0, 0],
          [10, 10],
        ] as [number, number][],
        startBinding: { elementId: "n1" },
        endBinding: { elementId: "n2" },
      },
    ];

    reanchorArrows(elements);

    const arrow = elements.find((e) => e.id === "a1")!;
    const n1 = elements[0];
    const n2 = elements[1];
    const start: [number, number] = [
      arrow.x + arrow.points![0][0],
      arrow.y + arrow.points![0][1],
    ];
    const end: [number, number] = [
      arrow.x + arrow.points!.at(-1)![0],
      arrow.y + arrow.points!.at(-1)![1],
    ];

    // n1 is above n2, so the arrow should leave n1's bottom and hit n2's top.
    expect(onBorder(start, n1)).toBe(true);
    expect(onBorder(end, n2)).toBe(true);
    expect(arrow.points!.length).toBe(2); // straight border-to-border line
  });

  it("recenters an arrow's bound label on the new midpoint", () => {
    // The label is created (by convertToExcalidrawElements) relative to the
    // arrow's original (0,0) geometry — near the origin. After reanchoring it
    // must follow the arrow to its real midpoint, not stay stacked at origin.
    const elements = [
      { id: "n1", type: "rectangle", x: 0, y: 0, width: 100, height: 50 },
      { id: "n2", type: "rectangle", x: 0, y: 200, width: 100, height: 50 },
      {
        id: "a1",
        type: "arrow",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        points: [
          [0, 0],
          [0, 0],
        ] as [number, number][],
        startBinding: { elementId: "n1" },
        endBinding: { elementId: "n2" },
      },
      {
        id: "t1",
        type: "text",
        x: -20, // sitting at the origin, the bug's signature
        y: -10,
        width: 40,
        height: 20,
        containerId: "a1",
      },
    ];

    reanchorArrows(elements);

    const arrow = elements.find((e) => e.id === "a1")!;
    const label = elements.find((e) => e.id === "t1")!;
    const midX = arrow.x + (arrow.points!.at(-1)![0] as number) / 2;
    const midY = arrow.y + (arrow.points!.at(-1)![1] as number) / 2;
    // Label top-left = midpoint minus half its size (i.e. centered on midpoint).
    expect(label.x + label.width! / 2).toBeCloseTo(midX, 5);
    expect(label.y + label.height! / 2).toBeCloseTo(midY, 5);
  });

  it("leaves free-floating arrows (no bindings) untouched", () => {
    const arrow = {
      id: "a",
      type: "arrow",
      x: 5,
      y: 5,
      width: 0,
      height: 0,
      points: [
        [0, 0],
        [30, 0],
      ] as [number, number][],
      startBinding: null,
      endBinding: null,
    };
    reanchorArrows([arrow]);
    expect(arrow.x).toBe(5);
    expect(arrow.points).toEqual([
      [0, 0],
      [30, 0],
    ]);
  });

  it("skips arrows whose bound node is missing", () => {
    const arrow = {
      id: "a",
      type: "arrow",
      x: 5,
      y: 5,
      width: 0,
      height: 0,
      points: [
        [0, 0],
        [30, 0],
      ] as [number, number][],
      startBinding: { elementId: "exists" },
      endBinding: { elementId: "ghost" },
    };
    const node = { id: "exists", type: "rectangle", x: 0, y: 0, width: 10, height: 10 };
    reanchorArrows([node, arrow]);
    // endBinding points at a missing node → arrow is left as-is.
    expect(arrow.x).toBe(5);
  });
});
