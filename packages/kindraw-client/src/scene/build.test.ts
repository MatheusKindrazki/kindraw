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

describe("stable arrow ids", () => {
  // Arrow ids must be content-derived (`arrow-<from>-<to>`), not positional, so
  // adding/removing one edge never reshuffles every other arrow's id — the
  // precondition for diffable, regenerable scenes (round-trip + sync).
  const arrowIds = (content: string): string[] =>
    (JSON.parse(content).elements as Array<{ type: string; id: string }>)
      .filter((e) => e.type === "arrow")
      .map((e) => e.id);

  it("derives arrow ids from endpoints (arrow-<from>-<to>)", async () => {
    const { content } = await buildScene({
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
      ],
    });
    expect(arrowIds(content).sort()).toEqual(["arrow-a-b", "arrow-b-c"]);
  });

  it("keeps arrow ids stable when an unrelated edge is removed", async () => {
    const nodes = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ];
    const full = await buildScene({
      nodes,
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "a" },
      ],
    });
    const less = await buildScene({
      nodes,
      // dropped the MIDDLE edge (b→c); positional ids would shift c→a from
      // arrow-2 to arrow-1. Content-derived ids stay put.
      edges: [
        { from: "a", to: "b" },
        { from: "c", to: "a" },
      ],
    });
    expect(arrowIds(less.content).sort()).toEqual(["arrow-a-b", "arrow-c-a"]);
    const idsFull = new Set(arrowIds(full.content));
    expect(idsFull.has("arrow-a-b")).toBe(true);
    expect(idsFull.has("arrow-c-a")).toBe(true);
  });

  it("disambiguates parallel edges deterministically", async () => {
    // Same endpoints, distinct label/style survive spec dedup and need
    // distinct ids; the second collides on the base and gets a -2 suffix.
    const { content } = await buildScene({
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [
        { from: "a", to: "b", label: "one" },
        { from: "a", to: "b", label: "two", style: "dashed" },
      ],
    });
    expect(arrowIds(content).sort()).toEqual(["arrow-a-b", "arrow-a-b-2"]);
  });

  it("disambiguates hyphen-ambiguous endpoint ids", async () => {
    // 'a-b'→'c' and 'a'→'b-c' both base to arrow-a-b-c; the factory makes the
    // second unique. (node ids have no charset restriction, so this is real.)
    const { content } = await buildScene({
      nodes: [
        { id: "a-b", label: "AB" },
        { id: "c", label: "C" },
        { id: "a", label: "A" },
        { id: "b-c", label: "BC" },
      ],
      edges: [
        { from: "a-b", to: "c" },
        { from: "a", to: "b-c" },
      ],
    });
    expect(arrowIds(content).sort()).toEqual([
      "arrow-a-b-c",
      "arrow-a-b-c-2",
    ]);
  });

  it("derives the bound-label id from the stable arrow id", async () => {
    // Golden: canonicalizeBoundTextIds renames the edge label to
    // `text-<containerId>`, so it must track the new content-derived arrow id.
    const { content } = await buildScene({
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "a", to: "b", label: "calls" }],
    });
    const els = JSON.parse(content).elements as Array<{
      type: string;
      id: string;
      containerId?: string;
    }>;
    const arrow = els.find((e) => e.type === "arrow");
    expect(arrow?.id).toBe("arrow-a-b");
    const label = els.find(
      (e) => e.type === "text" && e.containerId === "arrow-a-b",
    );
    expect(label?.id).toBe("text-arrow-a-b");
  });
});

describe("group frames", () => {
  // DiagramGroups (validated today but visually dropped) must materialize as
  // native Excalidraw frame elements wrapping their member nodes — the
  // structural backbone for C4 boundaries / swimlanes / boards.
  const byType = (content: string, type: string): Array<Record<string, any>> =>
    (JSON.parse(content).elements as Array<Record<string, any>>).filter(
      (e) => e.type === type,
    );

  it("emits a frame per non-empty group, sized to wrap its members", async () => {
    const { content } = await buildScene({
      nodes: [
        { id: "a", label: "A", group: "g1" },
        { id: "b", label: "B", group: "g1" },
        { id: "c", label: "C" },
      ],
      edges: [{ from: "a", to: "b" }],
      groups: [{ id: "g1", label: "Boundary" }],
    });
    const frames = byType(content, "frame");
    expect(frames.length).toBe(1);
    const frame = frames[0];
    expect(frame.id).toBe("g1");
    expect(frame.name).toBe("Boundary");
    // Bounds enclose every member node box.
    const members = (JSON.parse(content).elements as Array<Record<string, any>>)
      .filter((e) => e.id === "a" || e.id === "b");
    expect(members.length).toBe(2);
    for (const n of members) {
      expect(frame.x).toBeLessThanOrEqual(n.x);
      expect(frame.y).toBeLessThanOrEqual(n.y);
      expect(frame.x + frame.width).toBeGreaterThanOrEqual(n.x + n.width);
      expect(frame.y + frame.height).toBeGreaterThanOrEqual(n.y + n.height);
    }
  });

  it("wires frameId onto member nodes only", async () => {
    const { content } = await buildScene({
      nodes: [
        { id: "a", label: "A", group: "g1" },
        { id: "b", label: "B", group: "g1" },
        { id: "c", label: "C" },
      ],
      edges: [],
      groups: [{ id: "g1" }],
    });
    const els = JSON.parse(content).elements as Array<Record<string, any>>;
    expect(els.find((e) => e.id === "a")?.frameId).toBe("g1");
    expect(els.find((e) => e.id === "b")?.frameId).toBe("g1");
    expect(els.find((e) => e.id === "c")?.frameId ?? null).toBeNull();
  });

  it("places frame elements LAST (after their children)", async () => {
    const { content } = await buildScene({
      nodes: [
        { id: "a", label: "A", group: "g1" },
        { id: "b", label: "B", group: "g1" },
      ],
      edges: [],
      groups: [{ id: "g1" }],
    });
    const els = JSON.parse(content).elements as Array<Record<string, any>>;
    const frameIdx = els.findIndex((e) => e.type === "frame");
    expect(frameIdx).toBeGreaterThan(els.findIndex((e) => e.id === "a"));
    expect(frameIdx).toBeGreaterThan(els.findIndex((e) => e.id === "b"));
  });

  it("skips a declared-but-unused group (no empty frame)", async () => {
    const { content } = await buildScene({
      nodes: [{ id: "a", label: "A" }],
      edges: [],
      groups: [{ id: "empty", label: "Nobody" }],
    });
    expect(byType(content, "frame").length).toBe(0);
  });

  it("omits the frame name when the group has no label", async () => {
    const { content } = await buildScene({
      nodes: [{ id: "a", label: "A", group: "g1" }],
      edges: [],
      groups: [{ id: "g1" }],
    });
    expect(byType(content, "frame")[0]?.name ?? null).toBeNull();
  });

  it("appends no frame element for a group-less spec (back-compat)", async () => {
    const { content } = await buildScene({
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "a", to: "b" }],
    });
    expect(byType(content, "frame").length).toBe(0);
  });

  it("is deterministic with groups", async () => {
    const spec = {
      nodes: [
        { id: "a", label: "A", group: "g1" },
        { id: "b", label: "B", group: "g1" },
        { id: "c", label: "C", group: "g2" },
      ],
      edges: [{ from: "a", to: "c" }],
      groups: [
        { id: "g1", label: "One" },
        { id: "g2", label: "Two" },
      ],
    };
    const first = await buildScene(spec);
    const second = await buildScene(spec);
    expect(first.content).toBe(second.content);
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
