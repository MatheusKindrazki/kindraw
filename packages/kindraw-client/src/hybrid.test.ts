import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KindrawClient } from "./client";
import { composeHybrid, HybridPartialError } from "./hybrid";

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
