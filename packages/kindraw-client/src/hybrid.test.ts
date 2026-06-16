import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KindrawClient } from "./client";
import { composeHybrid, HybridPartialError } from "./hybrid";
import * as build from "./scene/build";

// Keep the REAL buildScene by default; individual tests override it via
// mockImplementationOnce to exercise the JSON-parse partial-failure path.
vi.mock("./scene/build", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./scene/build")>();
  return { ...actual, buildScene: vi.fn(actual.buildScene) };
});

type Captured = { url: string; init: RequestInit };
let calls: Captured[] = [];

const mockFetch = (responses: Array<{ status?: number; json?: unknown }>) => {
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (i >= responses.length) {
        throw new Error(
          `mockFetch: unexpected fetch #${i + 1} to ${url} (only ${
            responses.length
          } queued)`,
        );
      }
      const r = responses[i];
      i += 1;
      const status = r.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: `HTTP ${status}`,
        json: async () => r.json,
        text: async () => "",
        headers: { get: () => "application/json" },
      } as unknown as Response;
    }),
  );
};

const client = () =>
  new KindrawClient({
    token: "kdr_test",
    baseUrl: "https://api.kindraw.dev",
    appOrigin: "https://kindraw.dev",
  });

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("composeHybrid", () => {
  it("seeds, populates doc + drawing, wires links, returns /hybrid url", async () => {
    mockFetch([
      // step 0: POST /api/hybrid-items
      {
        status: 201,
        json: { hybridId: "h1", docItemId: "d1", drawingItemId: "g1" },
      },
      // step 2: PUT doc content -> 204
      { status: 204 },
      // step 3: PUT drawing content -> 204
      { status: 204 },
    ]);
    const res = await composeHybrid(client(), {
      title: "Architecture",
      markdown: "# Overview\n\nText\n\n# Database\n\nMore\n",
      diagram: {
        nodes: [
          { id: "a", label: "App", linkToHeading: "Overview" },
          { id: "b", label: "DB", linkToHeading: "Database" },
        ],
        edges: [{ from: "a", to: "b" }],
      },
    });

    expect(res.url).toBe("https://kindraw.dev/hybrid/h1");
    expect(res.hybridId).toBe("h1");
    expect(res.docItemId).toBe("d1");
    expect(res.drawingItemId).toBe("g1");
    expect(res.linksWired).toBe(2);
    expect(res.unmatchedHeadings).toEqual([]);

    // Order: seed, doc PUT, drawing PUT.
    expect(calls[0].url).toBe("https://api.kindraw.dev/api/hybrid-items");
    expect(calls[1].url).toBe("https://api.kindraw.dev/api/items/d1/content");
    expect(calls[2].url).toBe("https://api.kindraw.dev/api/items/g1/content");

    // Doc PUT carries the FULL markdown verbatim.
    expect(JSON.parse(calls[1].init.body as string).content).toBe(
      "# Overview\n\nText\n\n# Database\n\nMore\n",
    );

    // The drawing JSON is valid + carries the kindraw:// links on the right nodes.
    const drawing = JSON.parse(
      JSON.parse(calls[2].init.body as string).content,
    );
    expect(drawing.type).toBe("excalidraw");
    const a = drawing.elements.find((e: { id: string }) => e.id === "a");
    const b = drawing.elements.find((e: { id: string }) => e.id === "b");
    expect(a.link).toBe("kindraw://section/h1/overview");
    expect(b.link).toBe("kindraw://section/h1/database");
  });

  it("wires only nodes that carry linkToHeading; leaves others link-free", async () => {
    mockFetch([
      {
        status: 201,
        json: { hybridId: "h4", docItemId: "d4", drawingItemId: "g4" },
      },
      { status: 204 },
      { status: 204 },
    ]);
    const res = await composeHybrid(client(), {
      title: "X",
      markdown: "# Overview\n\nText\n",
      diagram: {
        nodes: [
          { id: "a", label: "A", linkToHeading: "Overview" },
          { id: "b", label: "B" },
        ],
        edges: [{ from: "a", to: "b" }],
      },
    });
    expect(res.linksWired).toBe(1);
    const drawing = JSON.parse(
      JSON.parse(calls[2].init.body as string).content,
    );
    const b = drawing.elements.find((e: { id: string }) => e.id === "b");
    expect(b.link ?? null).toBeNull();
  });

  it("reports headings that matched no section instead of failing", async () => {
    mockFetch([
      {
        status: 201,
        json: { hybridId: "h2", docItemId: "d2", drawingItemId: "g2" },
      },
      { status: 204 },
      { status: 204 },
    ]);
    const res = await composeHybrid(client(), {
      title: "X",
      markdown: "# Overview\n\nText\n",
      diagram: {
        nodes: [{ id: "a", label: "A", linkToHeading: "Nonexistent" }],
        edges: [],
      },
    });
    expect(res.unmatchedHeadings).toEqual(["Nonexistent"]);
    expect(res.linksWired).toBe(0);
    // The drawing was still written (without the bogus link).
    const drawing = JSON.parse(
      JSON.parse(calls[2].init.body as string).content,
    );
    const a = drawing.elements.find((e: { id: string }) => e.id === "a");
    expect(a.link ?? null).toBeNull();
  });

  it("surfaces a partial failure with ids + failed step (no cleanup)", async () => {
    mockFetch([
      {
        status: 201,
        json: { hybridId: "h3", docItemId: "d3", drawingItemId: "g3" },
      },
      { status: 500, json: { error: "boom" } }, // doc PUT fails
    ]);
    await expect(
      composeHybrid(client(), {
        title: "X",
        markdown: "# A\n",
        diagram: { nodes: [{ id: "a", label: "A" }], edges: [] },
      }),
    ).rejects.toMatchObject({
      hybridId: "h3",
      docItemId: "d3",
      drawingItemId: "g3",
      failedStep: "doc",
    });
    // Doc PUT failed → drawing PUT must NOT have been attempted (only 2 calls).
    expect(calls).toHaveLength(2);
  });

  // FIX 3 (Security M1 / Code M3) — a non-JSON build output surfaces as a
  // drawing-step HybridPartialError, not a raw SyntaxError that bypasses the
  // partial-failure contract.
  it("reports invalid built drawing JSON as a drawing-step partial failure", async () => {
    vi.mocked(build.buildScene).mockImplementationOnce(async () => ({
      content: "this is not json {",
      elementCount: 0,
    }));
    mockFetch([
      {
        status: 201,
        json: { hybridId: "h7", docItemId: "d7", drawingItemId: "g7" },
      },
      { status: 204 }, // doc PUT OK
      // drawing PUT must NOT be reached (parse throws first) — none queued.
    ]);
    const err = await composeHybrid(client(), {
      title: "X",
      markdown: "# A\n",
      diagram: { nodes: [{ id: "a", label: "A" }], edges: [] },
    }).catch((e) => e);

    expect(err).toBeInstanceOf(HybridPartialError);
    expect(err.failedStep).toBe("drawing");
    expect(err.hybridId).toBe("h7");
    expect(err.docItemId).toBe("d7");
    expect(err.drawingItemId).toBe("g7");
    expect(err.message).toMatch(/invalid/i);
    // Only seed + doc PUT happened; the drawing PUT was never attempted.
    expect(calls).toHaveLength(2);
  });

  // FIX 4 (Security M2) — fail-fast validation BEFORE seeding the hybrid, so a
  // malformed diagram never creates a half-built orphan hybrid.
  it("rejects an invalid diagram BEFORE any fetch (no orphan hybrid)", async () => {
    mockFetch([]); // no responses queued — any fetch would throw "unexpected"
    await expect(
      composeHybrid(client(), {
        title: "X",
        markdown: "# A\n",
        diagram: {
          // duplicate node id → validateDiagramSpec throws
          nodes: [
            { id: "a", label: "A" },
            { id: "a", label: "A2" },
          ],
          edges: [],
        },
      }),
    ).rejects.toThrow(/duplicate node id/i);
    // Nothing was created: the validation fired before step 0 (createHybrid).
    expect(calls).toHaveLength(0);
  });

  it("rejects an over-cap diagram (>500 nodes) BEFORE any fetch", async () => {
    mockFetch([]);
    const nodes = Array.from({ length: 501 }, (_, i) => ({
      id: `n${i}`,
      label: `N${i}`,
    }));
    await expect(
      composeHybrid(client(), {
        title: "X",
        markdown: "# A\n",
        diagram: { nodes, edges: [] },
      }),
    ).rejects.toThrow(/too many nodes/i);
    expect(calls).toHaveLength(0);
  });

  // FIX 6 (Code M2 / BizLogic LOW-2) — the synthetic intro ("Visao geral") is not
  // an addressable heading; linkToHeading: "Visao geral" must NOT resolve to it.
  it("does not deep-link a node to the synthetic intro by its title", async () => {
    mockFetch([
      {
        status: 201,
        json: { hybridId: "h6", docItemId: "d6", drawingItemId: "g6" },
      },
      { status: 204 },
      { status: 204 },
    ]);
    const res = await composeHybrid(client(), {
      title: "X",
      // Preamble (no heading) → parser emits an intro section titled "Visao geral".
      markdown: "Preamble text\n\n# Real\n\nBody\n",
      diagram: {
        nodes: [{ id: "a", label: "A", linkToHeading: "Visao geral" }],
        edges: [],
      },
    });
    // "Visao geral" matched the intro before the fix; now it's unmatched.
    expect(res.linksWired).toBe(0);
    expect(res.unmatchedHeadings).toEqual(["Visao geral"]);
    const drawing = JSON.parse(
      JSON.parse(calls[2].init.body as string).content,
    );
    const a = drawing.elements.find((e: { id: string }) => e.id === "a");
    expect(a.link ?? null).toBeNull();
  });

  it("embeds requested icons as image elements + files (skip-on-404)", async () => {
    // step 0 seed, step 2 doc PUT, then TWO icon SVG fetches (one OK, one 404),
    // then step 3 drawing PUT. The icon fetch loop runs BETWEEN doc and drawing
    // PUT (composeIconImages is awaited before buildScene), so queue carefully.
    mockFetch([
      {
        status: 201,
        json: { hybridId: "h8", docItemId: "d8", drawingItemId: "g8" },
      },
      { status: 204 }, // doc PUT OK
      { status: 200, json: { ignored: true } }, // icon svg #1 — text() returns ""
      { status: 404, json: { error: "not found" } }, // icon svg #2 — skipped
      { status: 204 }, // drawing PUT OK
    ]);
    const res = await composeHybrid(client(), {
      title: "Iconned",
      markdown: "# A\n",
      diagram: { nodes: [{ id: "a", label: "A" }], edges: [] },
      icons: [{ iconId: "mdi:home" }, { iconId: "bad:icon" }],
    });
    // One icon embedded, one skipped-with-warning.
    expect(res.iconWarnings).toEqual(["bad:icon"]);
    // The drawing carries an image element + a matching files entry.
    const drawing = JSON.parse(
      JSON.parse(calls[calls.length - 1].init.body as string).content,
    );
    const img = drawing.elements.find(
      (e: { type: string }) => e.type === "image",
    );
    expect(img).toBeDefined();
    expect(img.status).toBe("saved");
    expect(drawing.files[img.fileId]).toBeDefined();

    // FIX 1 (BizLogic MEDIUM-1) — the grid-placed icon must sit BELOW the
    // diagram, not on top of it. Its y must clear every non-image element's
    // bottom edge (y + height).
    const contentBottom = Math.max(
      0,
      ...drawing.elements
        .filter((e: { type: string }) => e.type !== "image")
        .map(
          (e: { y?: number; height?: number }) => (e.y ?? 0) + (e.height ?? 0),
        ),
    );
    expect(img.y).toBeGreaterThanOrEqual(contentBottom);
  });

  it("rejects an invalid icon id BEFORE seeding (no orphan hybrid)", async () => {
    mockFetch([]); // any fetch would throw "unexpected"
    await expect(
      composeHybrid(client(), {
        title: "X",
        markdown: "# A\n",
        diagram: { nodes: [{ id: "a", label: "A" }], edges: [] },
        icons: [{ iconId: "not a valid id" }],
      }),
    ).rejects.toThrow(/invalid icon id/i);
    // Fail-fast: the malformed icon id is validated alongside the diagram,
    // BEFORE step 0 (createHybrid) — so nothing was created.
    expect(calls).toHaveLength(0);
  });

  // FIX 1 (diagnostics) — section links attach ONLY to TOP-LEVEL headings
  // (markdown `#`). The parser NESTS deeper headings into their parent, so a
  // `## Sub` is absorbed and is NOT linkable. composeHybrid must report the set
  // of linkable (top-level) headings so the caller can self-correct.
  it("does not link a nested (##) heading and reports the linkable top-level set", async () => {
    mockFetch([
      {
        status: 201,
        json: { hybridId: "hL1", docItemId: "dL1", drawingItemId: "gL1" },
      },
      { status: 204 },
      { status: 204 },
    ]);
    const res = await composeHybrid(client(), {
      title: "X",
      // "Title" is top-level; "Sub" is a ## nested under it → absorbed, not a
      // top-level section, so not linkable.
      markdown: "# Title\n\nIntro\n\n## Sub\n\nBody\n",
      diagram: {
        nodes: [{ id: "a", label: "A", linkToHeading: "Sub" }],
        edges: [],
      },
    });
    expect(res.linksWired).toBe(0);
    expect(res.unmatchedHeadings).toEqual(["Sub"]);
    // Only the top-level heading is linkable.
    expect(res.linkableHeadings).toEqual(["Title"]);
    const drawing = JSON.parse(
      JSON.parse(calls[2].init.body as string).content,
    );
    const a = drawing.elements.find((e: { id: string }) => e.id === "a");
    expect(a.link ?? null).toBeNull();
  });

  it("wires links for all-top-level (#) headings and lists them as linkable", async () => {
    mockFetch([
      {
        status: 201,
        json: { hybridId: "hL2", docItemId: "dL2", drawingItemId: "gL2" },
      },
      { status: 204 },
      { status: 204 },
    ]);
    const res = await composeHybrid(client(), {
      title: "X",
      // All three are top-level `#` → all linkable.
      markdown: "# Title\n\nT\n\n# Section A\n\nA\n\n# Section B\n\nB\n",
      diagram: {
        nodes: [
          { id: "a", label: "A", linkToHeading: "Section A" },
          { id: "b", label: "B", linkToHeading: "Section B" },
        ],
        edges: [{ from: "a", to: "b" }],
      },
    });
    expect(res.linksWired).toBe(2);
    expect(res.unmatchedHeadings).toEqual([]);
    expect(res.linkableHeadings).toEqual(["Title", "Section A", "Section B"]);
  });

  it("surfaces a drawing-step partial failure after the doc succeeds", async () => {
    mockFetch([
      {
        status: 201,
        json: { hybridId: "h5", docItemId: "d5", drawingItemId: "g5" },
      },
      { status: 204 }, // doc OK
      { status: 500, json: { error: "kaboom" } }, // drawing PUT fails
    ]);
    const err = await composeHybrid(client(), {
      title: "X",
      markdown: "# A\n",
      diagram: { nodes: [{ id: "a", label: "A" }], edges: [] },
    }).catch((e) => e);
    expect(err).toBeInstanceOf(HybridPartialError);
    expect(err.failedStep).toBe("drawing");
    expect(err.hybridId).toBe("h5");
  });
});
