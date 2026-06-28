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
  elements.filter((e) => ["rectangle", "diamond", "ellipse"].includes(e.type));

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
    const arrow = elements.find((e: { type: string }) => e.type === "arrow");
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
        {
          id: "a",
          label: "A",
          strokeColor: "#1971c2",
          backgroundColor: "#a5d8ff",
        },
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

  describe("node.link passthrough", () => {
    it("attaches a kindraw:// section link to the node element", async () => {
      const { content } = await buildScene({
        nodes: [
          { id: "a", label: "A", link: "kindraw://section/h1/overview" },
          { id: "b", label: "B" },
        ],
        edges: [{ from: "a", to: "b" }],
      });
      const elements = JSON.parse(content).elements as Array<{
        id: string;
        link?: string;
      }>;
      const a = elements.find((e) => e.id === "a");
      expect(a?.link).toBe("kindraw://section/h1/overview");
      // A node without a link must not get a bogus link field.
      const b = elements.find((e) => e.id === "b");
      expect(b?.link ?? null).toBeNull();
    });

    it("accepts a normal https link", async () => {
      const { content } = await buildScene({
        nodes: [{ id: "a", label: "A", link: "https://example.com" }],
        edges: [],
      });
      const a = (
        JSON.parse(content).elements as Array<{ id: string; link?: string }>
      ).find((e) => e.id === "a");
      expect(a?.link).toBe("https://example.com");
    });

    it("rejects a link that is neither kindraw:// nor http(s)", async () => {
      await expect(
        buildScene({
          nodes: [{ id: "a", label: "A", link: "javascript:alert(1)" }],
          edges: [],
        }),
      ).rejects.toThrow(/invalid link/i);
    });

    it("rejects a data: link", async () => {
      await expect(
        buildScene({
          nodes: [{ id: "a", label: "A", link: "data:text/html,<x>" }],
          edges: [],
        }),
      ).rejects.toThrow(/invalid link/i);
    });
  });
});

describe("sticky shape", () => {
  // A `sticky` node maps to a rectangle tagged customData.kindrawStickyNote —
  // the exact convention the editor's createStickyNoteOnPointerDown uses, so
  // renderElement.ts paints a post-it drop shadow and it round-trips through the
  // real editor. Generated boards read as whiteboards, not flowcharts.
  const find = (content: string, id: string): Record<string, any> | undefined =>
    (JSON.parse(content).elements as Array<Record<string, any>>).find(
      (e) => e.id === id,
    );

  it("emits a sticky as a rectangle tagged for the post-it renderer", async () => {
    const { content } = await buildScene({
      nodes: [
        { id: "s", label: "Idea", shape: "sticky" },
        { id: "b", label: "B" },
      ],
      edges: [],
    });
    const s = find(content, "s")!;
    expect(s.type).toBe("rectangle");
    expect(s.customData?.kindrawStickyNote).toBe(true);
    expect(s.backgroundColor).toBe("#ffec99");
    expect(s.strokeColor).toBe("transparent");
    expect(s.fillStyle).toBe("solid");
  });

  it("lets a user color override the sticky defaults", async () => {
    const { content } = await buildScene({
      nodes: [
        {
          id: "s",
          label: "Idea",
          shape: "sticky",
          backgroundColor: "#a5d8ff",
          strokeColor: "#1971c2",
        },
      ],
      edges: [],
    });
    const s = find(content, "s")!;
    expect(s.backgroundColor).toBe("#a5d8ff");
    expect(s.strokeColor).toBe("#1971c2");
    expect(s.customData?.kindrawStickyNote).toBe(true);
  });

  it("binds an arrow to a sticky border-to-border", async () => {
    const { content } = await buildScene({
      nodes: [
        { id: "s", label: "Note", shape: "sticky" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "s", to: "b" }],
    });
    const els = JSON.parse(content).elements as Array<Record<string, any>>;
    const arrow = els.find((e) => e.type === "arrow")!;
    const ids = new Set(els.map((e) => e.id));
    expect(ids.has(arrow.startBinding.elementId)).toBe(true);
    expect(ids.has(arrow.endBinding.elementId)).toBe(true);
    expect(arrow.points.length).toBe(2);
  });

  it("floors a sticky to a note-like minimum size", async () => {
    const { content } = await buildScene({
      nodes: [{ id: "s", label: "x", shape: "sticky" }],
      edges: [],
    });
    const s = find(content, "s")!;
    expect(s.width).toBeGreaterThanOrEqual(120);
    expect(s.height).toBeGreaterThanOrEqual(120);
  });
});

describe("buildScene additive inputs (templateElements + files + iconImages)", () => {
  it("prepends templateElements and merges files + iconImages into the envelope", async () => {
    const { content } = await buildScene(
      { nodes: [{ id: "a", label: "A" }], edges: [] },
      {
        templateElements: [
          {
            id: "tpl-bg",
            type: "rectangle",
            x: 0,
            y: 0,
            width: 200,
            height: 200,
            isDeleted: false,
          },
        ],
        files: {
          "icon-deadbeef": {
            id: "icon-deadbeef",
            mimeType: "image/svg+xml",
            dataURL: "data:image/svg+xml;base64,PHN2Zy8+",
            created: 1,
          },
        },
        iconImages: [
          {
            type: "image",
            id: "icon-0",
            fileId: "icon-deadbeef",
            status: "saved",
            x: 5,
            y: 5,
            width: 28,
            height: 28,
          },
        ],
      },
    );
    const parsed = JSON.parse(content);
    // Template element present, before the node.
    const ids = parsed.elements.map((e: { id: string }) => e.id);
    expect(ids).toContain("tpl-bg");
    expect(ids.indexOf("tpl-bg")).toBeLessThan(ids.indexOf("a"));
    // Image element present.
    expect(
      parsed.elements.some((e: { type: string }) => e.type === "image"),
    ).toBe(true);
    // Files merged (not {}).
    expect(parsed.files["icon-deadbeef"]).toBeDefined();
  });

  it("still serializes files:{} when no extra inputs are given (back-compat)", async () => {
    const { content } = await buildScene({
      nodes: [{ id: "a", label: "A" }],
      edges: [],
    });
    expect(JSON.parse(content).files).toEqual({});
  });

  it("is deterministic with additive inputs", async () => {
    const extras = {
      templateElements: [
        {
          id: "tpl-bg",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 200,
          height: 200,
          isDeleted: false,
        },
      ],
      iconImages: [
        {
          type: "image",
          id: "icon-0",
          fileId: "icon-deadbeef",
          status: "saved",
          x: 5,
          y: 5,
          width: 28,
          height: 28,
        },
      ],
      files: {
        "icon-deadbeef": {
          id: "icon-deadbeef",
          mimeType: "image/svg+xml",
          dataURL: "data:image/svg+xml;base64,PHN2Zy8+",
          created: 1,
        },
      },
    };
    const a = await buildScene(
      { nodes: [{ id: "a", label: "A" }], edges: [] },
      structuredClone(extras),
    );
    const b = await buildScene(
      { nodes: [{ id: "a", label: "A" }], edges: [] },
      structuredClone(extras),
    );
    expect(a.content).toBe(b.content);
  });
});
