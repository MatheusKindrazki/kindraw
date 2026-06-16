import { afterEach, describe, expect, it } from "vitest";

import { buildScene } from "./build";

type Box = {
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

// Helper to extract node-shape elements (the boxes that carry labels).
const nodeBoxes = (elements: Box[]): Box[] =>
  elements.filter((e) =>
    ["rectangle", "diamond", "ellipse"].includes(e.type),
  );

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

describe("buildScene", () => {
  it("returns a valid excalidraw envelope with the right element kinds", async () => {
    const { content, elementCount } = await buildScene({
      nodes: [
        { id: "a", label: "Client", shape: "rectangle" },
        { id: "b", label: "API", shape: "rectangle" },
        { id: "c", label: "Database", shape: "ellipse" },
      ],
      edges: [
        { from: "a", to: "b", label: "HTTP" },
        { from: "b", to: "c" },
      ],
    });

    const parsed = JSON.parse(content);
    expect(parsed.type).toBe("excalidraw");
    expect(parsed.version).toBe(2);
    expect(parsed.source).toBe("@kindraw/client");
    expect(parsed.appState.viewBackgroundColor).toBe("#ffffff");
    expect(parsed.appState.gridSize).toBe(null);
    expect(parsed.files).toEqual({});
    expect(Array.isArray(parsed.elements)).toBe(true);
    expect(elementCount).toBeGreaterThan(0);
    expect(elementCount).toBe(parsed.elements.length);

    const boxes = nodeBoxes(parsed.elements);
    // 3 node shapes present.
    expect(boxes.length).toBe(3);
    // At least 2 arrows present.
    expect(
      parsed.elements.filter((e: { type: string }) => e.type === "arrow")
        .length,
    ).toBeGreaterThanOrEqual(2);
    // No deleted elements leak into the serialized scene.
    expect(
      parsed.elements.some((e: { isDeleted?: boolean }) => e.isDeleted),
    ).toBe(false);
  });

  it("produces non-overlapping node boxes (real spacing)", async () => {
    const { content } = await buildScene({
      nodes: [
        { id: "n0", label: "Alpha" },
        { id: "n1", label: "Beta" },
        { id: "n2", label: "Gamma" },
      ],
      edges: [
        { from: "n0", to: "n1" },
        { from: "n1", to: "n2" },
      ],
    });
    const boxes = nodeBoxes(JSON.parse(content).elements);
    expect(boxes.length).toBe(3);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlaps(boxes[i], boxes[j])).toBe(false);
      }
    }
  });

  it("binds arrows to their endpoint nodes (border-to-border)", async () => {
    const { content } = await buildScene({
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "a", to: "b" }],
    });
    const elements = JSON.parse(content).elements;
    const arrow = elements.find(
      (e: { type: string }) => e.type === "arrow",
    );
    expect(arrow).toBeTruthy();
    expect(arrow.startBinding?.elementId).toBeTruthy();
    expect(arrow.endBinding?.elementId).toBeTruthy();
    // The bound ids must reference real node elements in the scene.
    const ids = new Set(elements.map((e: { id: string }) => e.id));
    expect(ids.has(arrow.startBinding.elementId)).toBe(true);
    expect(ids.has(arrow.endBinding.elementId)).toBe(true);
    // After reanchor, the arrow is a straight 2-point segment.
    expect(arrow.points.length).toBe(2);
  });

  it("maps edge style to strokeStyle", async () => {
    const { content } = await buildScene({
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "a", to: "b", style: "dashed" }],
    });
    const arrow = JSON.parse(content).elements.find(
      (e: { type: string }) => e.type === "arrow",
    );
    expect(arrow.strokeStyle).toBe("dashed");
  });

  it("applies node stroke/background colors", async () => {
    const { content } = await buildScene({
      nodes: [
        { id: "a", label: "A", strokeColor: "#1971c2", backgroundColor: "#a5d8ff" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "a", to: "b" }],
    });
    const a = JSON.parse(content).elements.find(
      (e: { id: string }) => e.id === "a",
    );
    expect(a.strokeColor).toBe("#1971c2");
    expect(a.backgroundColor).toBe("#a5d8ff");
  });

  it("is deterministic: same spec → identical serialized content", async () => {
    const spec = {
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "a", to: "b" }],
    };
    const first = await buildScene(spec);
    const second = await buildScene(spec);
    expect(first.content).toBe(second.content);
  });

  it("rejects an invalid spec (validation runs before layout)", async () => {
    await expect(buildScene({ nodes: [], edges: [] })).rejects.toThrow(
      /at least one node/i,
    );
  });

  // FIX A (Code H1+H2) — reserved generated-element id prefixes can no longer
  // collide with user node ids. A spec shaped to collide (a node id equal to a
  // would-be generated bound-text id) must be rejected at validation.
  it("rejects a spec whose node id collides with a generated bound-text id", async () => {
    await expect(
      buildScene({
        nodes: [
          { id: "text-b", label: "X" },
          { id: "b", label: "Y" },
        ],
        edges: [],
      }),
    ).rejects.toThrow(/reserved/i);
  });

  it("emits unique element ids for a normal multi-node spec", async () => {
    const { content } = await buildScene({
      nodes: [
        { id: "a", label: "Client", shape: "rectangle" },
        { id: "b", label: "API", shape: "rectangle" },
        { id: "c", label: "Database", shape: "ellipse" },
      ],
      edges: [
        { from: "a", to: "b", label: "HTTP" },
        { from: "b", to: "c" },
      ],
    });
    const elements: Array<{ id: string }> = JSON.parse(content).elements;
    expect(new Set(elements.map((e) => e.id)).size).toBe(elements.length);
  });

  // DOM-FREE PROOF: with global.document AND global.window deleted, buildScene
  // must still work, because (a) the registered NodeTextMetricsProvider replaces
  // the document.createElement("canvas") path inside convertToExcalidrawElements,
  // and (b) buildScene installs a minimal window shim for the Scene's index
  // validation. This mirrors the real Node runtime (plain `node`, no jsdom).
  describe("DOM-free", () => {
    const g = globalThis as { document?: unknown; window?: unknown };
    const savedDocument = g.document;
    const savedWindow = g.window;

    afterEach(() => {
      g.document = savedDocument;
      g.window = savedWindow;
    });

    it("builds a scene with no global.document or global.window available", async () => {
      // Prime the provider registration once (idempotent) while the DOM still
      // exists, then remove document + window entirely to prove no DOM is
      // touched (the window shim is re-installed by buildScene each call).
      await buildScene({ nodes: [{ id: "a", label: "A" }], edges: [] });

      delete g.document;
      delete g.window;
      expect(g.document).toBeUndefined();
      expect(g.window).toBeUndefined();

      const { content, elementCount } = await buildScene({
        nodes: [
          { id: "x", label: "No DOM Needed Here" },
          { id: "y", label: "Second Node" },
        ],
        edges: [{ from: "x", to: "y" }],
      });
      // document must STILL be absent — we never touched it.
      expect(g.document).toBeUndefined();
      const parsed = JSON.parse(content);
      expect(parsed.type).toBe("excalidraw");
      expect(elementCount).toBeGreaterThan(0);
      expect(nodeBoxes(parsed.elements).length).toBe(2);
    });
  });
});
