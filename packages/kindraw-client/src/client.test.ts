import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KindrawClient, KindrawApiError } from "./client";

// Shared mock-fetch harness. Each test queues responses; the client's request()
// / requestText() call the global fetch we stub here. We assert on the captured
// (url, init) so path + method + body + Bearer header are all verified.
type Captured = { url: string; init: RequestInit };
let calls: Captured[] = [];

const mockFetch = (
  responses: Array<{
    status?: number;
    json?: unknown;
    text?: string;
    contentType?: string;
  }>,
) => {
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (i >= responses.length) {
        throw new Error(
          `mockFetch: unexpected fetch #${i + 1} to ${url} (only ${
            responses.length
          } response(s) queued)`,
        );
      }
      const r = responses[i];
      i += 1;
      const status = r.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        statusText: `HTTP ${status}`,
        json: async () => {
          if (r.json === undefined) {
            throw new Error("no json body");
          }
          return r.json;
        },
        text: async () => r.text ?? "",
        headers: {
          get: (k: string) =>
            k.toLowerCase() === "content-type"
              ? r.contentType ?? "application/json"
              : null,
        },
      } as unknown as Response;
    }),
  );
};

const client = () =>
  new KindrawClient({
    token: "kdr_test",
    baseUrl: "https://api.kindraw.dev",
  });

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("KindrawClient.requestText (raw text mode)", () => {
  it("returns response.text() and sends the Bearer header", async () => {
    mockFetch([
      {
        status: 200,
        text: "<svg>hi</svg>",
        contentType: "image/svg+xml",
      },
    ]);
    // requestText is private; we invoke it via the `as any` cast (later tasks
    // exercise it through public methods). No @ts-expect-error needed — the
    // cast to `any` already erases the access type-check.
    const svg = await (client() as any).requestText(
      "GET",
      "/api/icons/svg?id=a:b",
    );
    expect(svg).toBe("<svg>hi</svg>");
    expect(calls[0].url).toBe("https://api.kindraw.dev/api/icons/svg?id=a:b");
    expect(
      (calls[0].init.headers as Record<string, string>).Authorization,
    ).toBe("Bearer kdr_test");
  });

  it("throws KindrawApiError with 401 hint on auth failure", async () => {
    // Two probes below each make one fetch; queue one 401 response per probe so
    // the over-fetch guard in mockFetch isn't tripped.
    mockFetch([
      { status: 401, json: { error: "bad token" } },
      { status: 401, json: { error: "bad token" } },
    ]);
    await expect(
      // private method probe via `as any`
      (client() as any).requestText("GET", "/api/icons/svg?id=a:b"),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      // private method probe via `as any`
      (client() as any).requestText("GET", "/api/icons/svg?id=a:b"),
    ).rejects.toThrowError(/kindraw login|KINDRAW_TOKEN/);
  });
});

describe("app-origin resolution + URL helpers", () => {
  it("uses the explicit appOrigin option when set", () => {
    const c = new KindrawClient({
      token: "kdr_test",
      baseUrl: "https://api.kindraw.dev",
      appOrigin: "https://kindraw.dev",
    });
    expect(c.docUrl("abc")).toBe("https://kindraw.dev/doc/abc");
    expect(c.drawUrl("abc")).toBe("https://kindraw.dev/draw/abc");
    expect(c.hybridUrl("h1")).toBe("https://kindraw.dev/hybrid/h1");
  });

  it("derives origin from baseUrl by stripping a leading 'api.' when no option", () => {
    const c = new KindrawClient({
      token: "kdr_test",
      baseUrl: "https://api.kindraw.dev",
    });
    // api.kindraw.dev -> kindraw.dev (deterministic backstop)
    expect(c.docUrl("abc")).toBe("https://kindraw.dev/doc/abc");
  });

  it("leaves a non-'api.' baseUrl host untouched", () => {
    const c = new KindrawClient({
      token: "kdr_test",
      baseUrl: "http://localhost:8787",
    });
    expect(c.docUrl("abc")).toBe("http://localhost:8787/doc/abc");
  });

  it("url-encodes the id segment", () => {
    const c = new KindrawClient({
      token: "kdr_test",
      baseUrl: "https://api.kindraw.dev",
      appOrigin: "https://kindraw.dev",
    });
    expect(c.docUrl("a/b")).toBe("https://kindraw.dev/doc/a%2Fb");
  });
});

describe("createDoc", () => {
  it("POSTs /v1/api/items with kind:doc and returns a built /doc url (not server url)", async () => {
    mockFetch([
      {
        status: 201,
        // Server returns a /draw url even for docs — we must DISCARD it.
        json: { itemId: "doc123", url: "https://kindraw.dev/draw/doc123" },
      },
    ]);
    const c = new KindrawClient({
      token: "kdr_test",
      baseUrl: "https://api.kindraw.dev",
      appOrigin: "https://kindraw.dev",
    });
    const res = await c.createDoc({ title: "Notes", content: "# Hi\n" });

    expect(res).toEqual({
      itemId: "doc123",
      url: "https://kindraw.dev/doc/doc123",
    });
    expect(calls[0].url).toBe("https://api.kindraw.dev/v1/api/items");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      kind: "doc",
      title: "Notes",
      folderId: null,
      content: "# Hi\n",
    });
  });

  it("passes folderId through when provided", async () => {
    mockFetch([{ status: 201, json: { itemId: "d2", url: "x" } }]);
    const c = new KindrawClient({
      token: "kdr_test",
      baseUrl: "https://api.kindraw.dev",
      appOrigin: "https://kindraw.dev",
    });
    await c.createDoc({ title: "T", content: "c", folderId: "f1" });
    expect(JSON.parse(calls[0].init.body as string).folderId).toBe("f1");
  });
});

describe("createDrawing", () => {
  it("returns a built appOrigin /draw url, NOT the server's wrong-host url", async () => {
    mockFetch([
      {
        status: 201,
        // Token-auth requests resolve relative urls against the API host, so the
        // server returns the WRONG-host url for the app — we must DISCARD it.
        json: { itemId: "scene9", url: "https://api.kindraw.dev/draw/scene9" },
      },
    ]);
    const c = new KindrawClient({
      token: "kdr_test",
      baseUrl: "https://api.kindraw.dev",
      appOrigin: "https://kindraw.dev",
    });
    const res = await c.createDrawing({ title: "Flow", content: "{}" });

    expect(res).toEqual({
      itemId: "scene9",
      url: "https://kindraw.dev/draw/scene9",
    });
    expect(calls[0].url).toBe("https://api.kindraw.dev/v1/api/items:generate");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      title: "Flow",
      folderId: null,
      content: "{}",
    });
  });

  it("passes folderId through when provided", async () => {
    mockFetch([
      {
        status: 201,
        json: { itemId: "d3", url: "https://api.kindraw.dev/draw/d3" },
      },
    ]);
    const c = new KindrawClient({
      token: "kdr_test",
      baseUrl: "https://api.kindraw.dev",
      appOrigin: "https://kindraw.dev",
    });
    const res = await c.createDrawing({
      title: "T",
      content: "{}",
      folderId: "f2",
    });
    expect(res.url).toBe("https://kindraw.dev/draw/d3");
    expect(JSON.parse(calls[0].init.body as string).folderId).toBe("f2");
  });
});

describe("hybrid methods", () => {
  it("createHybrid POSTs bare /api/hybrid-items and returns refs", async () => {
    mockFetch([
      {
        status: 201,
        json: { hybridId: "h1", docItemId: "d1", drawingItemId: "g1" },
      },
    ]);
    const c = new KindrawClient({
      token: "kdr_test",
      baseUrl: "https://api.kindraw.dev",
    });
    const res = await c.createHybrid({ title: "Spec", folderId: "f1" });
    expect(res).toEqual({
      hybridId: "h1",
      docItemId: "d1",
      drawingItemId: "g1",
    });
    expect(calls[0].url).toBe("https://api.kindraw.dev/api/hybrid-items");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      title: "Spec",
      folderId: "f1",
    });
  });

  it("createHybrid defaults folderId to null when omitted", async () => {
    mockFetch([
      {
        status: 201,
        json: { hybridId: "h1", docItemId: "d1", drawingItemId: "g1" },
      },
    ]);
    const c = new KindrawClient({ token: "kdr_test" });
    await c.createHybrid({ title: "Spec" });
    expect(JSON.parse(calls[0].init.body as string).folderId).toBeNull();
  });

  it("getHybrid GETs bare /api/hybrid-items/:id", async () => {
    mockFetch([{ status: 200, json: { hybridId: "h1" } }]);
    const c = new KindrawClient({ token: "kdr_test" });
    await c.getHybrid("h1");
    expect(calls[0].url).toBe("https://api.kindraw.dev/api/hybrid-items/h1");
    expect(calls[0].init.method).toBe("GET");
  });

  it("updateHybridDoc PUTs bare /api/items/:id/content (NOT /v1/api)", async () => {
    mockFetch([{ status: 204 }]);
    const c = new KindrawClient({ token: "kdr_test" });
    await c.updateHybridDoc("d1", "# Title\n");
    expect(calls[0].url).toBe("https://api.kindraw.dev/api/items/d1/content");
    expect(calls[0].init.method).toBe("PUT");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      content: "# Title\n",
    });
  });

  it("updateHybridDrawing PUTs bare /api/items/:id/content", async () => {
    mockFetch([{ status: 204 }]);
    const c = new KindrawClient({ token: "kdr_test" });
    await c.updateHybridDrawing("g1", '{"type":"excalidraw"}');
    expect(calls[0].url).toBe("https://api.kindraw.dev/api/items/g1/content");
    expect(calls[0].init.method).toBe("PUT");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      content: '{"type":"excalidraw"}',
    });
  });
});

describe("deleteHybrid", () => {
  // The GET /api/hybrid-items/:id response nests the backing item ids under
  // `hybrid` (verified against the worker's getHybridItem -> toHybridItem shape).
  const getHybridResponse = {
    hybrid: {
      id: "h1",
      kind: "hybrid",
      title: "Spec",
      docItemId: "d1",
      drawingItemId: "g1",
      defaultView: "both",
    },
    document: { item: {}, content: "# Spec\n" },
    drawing: { item: {}, content: "{}" },
  };

  it("GETs the hybrid, DELETEs /api/hybrid-items/:id, then DELETEs both backing items", async () => {
    mockFetch([
      { status: 200, json: getHybridResponse }, // GET hybrid (capture refs first)
      { status: 204 }, // DELETE /api/hybrid-items/h1
      { status: 204 }, // DELETE /v1/api/items/d1 (doc)
      { status: 204 }, // DELETE /v1/api/items/g1 (drawing)
    ]);
    const c = client();
    await c.deleteHybrid("h1");

    expect(calls).toHaveLength(4);
    // 1) GET the hybrid to learn its backing ids (BEFORE deleting the row).
    expect(calls[0].url).toBe("https://api.kindraw.dev/api/hybrid-items/h1");
    expect(calls[0].init.method).toBe("GET");
    // 2) DELETE the hybrid row (bare /api/).
    expect(calls[1].url).toBe("https://api.kindraw.dev/api/hybrid-items/h1");
    expect(calls[1].init.method).toBe("DELETE");
    // 3+4) DELETE the now-orphaned backing items (/v1/api/).
    expect(calls[2].url).toBe("https://api.kindraw.dev/v1/api/items/d1");
    expect(calls[2].init.method).toBe("DELETE");
    expect(calls[3].url).toBe("https://api.kindraw.dev/v1/api/items/g1");
    expect(calls[3].init.method).toBe("DELETE");
  });

  it("swallows a 404 on a backing-item delete (already gone) without throwing", async () => {
    mockFetch([
      { status: 200, json: getHybridResponse },
      { status: 204 }, // hybrid row deleted
      { status: 404, json: { error: "Item not found" } }, // doc already gone
      { status: 204 }, // drawing deleted fine
    ]);
    const c = client();
    // Must resolve despite the 404 on the doc delete.
    await expect(c.deleteHybrid("h1")).resolves.toBeUndefined();
    // It still attempted ALL four calls (a partial state cleans up as much as
    // possible — the 404 doesn't abort the drawing delete).
    expect(calls).toHaveLength(4);
    expect(calls[3].url).toBe("https://api.kindraw.dev/v1/api/items/g1");
  });

  it("propagates a non-404 error on a backing-item delete", async () => {
    mockFetch([
      { status: 200, json: getHybridResponse },
      { status: 204 },
      { status: 500, json: { error: "boom" } }, // doc delete 500 → must throw
    ]);
    const c = client();
    await expect(c.deleteHybrid("h1")).rejects.toMatchObject({ status: 500 });
  });
});

describe("deleteAny (routes hybrid vs normal item)", () => {
  const listResponse = {
    items: [
      { id: "draw1", kind: "drawing", title: "D", folderId: null },
      { id: "h1", kind: "hybrid", title: "Spec", folderId: null },
    ],
  };

  it("routes a hybrid id to deleteHybrid (full cleanup)", async () => {
    mockFetch([
      { status: 200, json: listResponse }, // listItems to detect kind
      {
        status: 200,
        json: { hybrid: { docItemId: "d1", drawingItemId: "g1" } },
      }, // getHybrid
      { status: 204 }, // DELETE /api/hybrid-items/h1
      { status: 204 }, // DELETE /v1/api/items/d1
      { status: 204 }, // DELETE /v1/api/items/g1
    ]);
    const c = client();
    const kind = await c.deleteAny("h1");
    expect(kind).toBe("hybrid");
    // 1 list + getHybrid + hybrid DELETE + 2 backing DELETEs.
    expect(calls.map((x) => `${x.init.method} ${x.url}`)).toEqual([
      "GET https://api.kindraw.dev/v1/api/items",
      "GET https://api.kindraw.dev/api/hybrid-items/h1",
      "DELETE https://api.kindraw.dev/api/hybrid-items/h1",
      "DELETE https://api.kindraw.dev/v1/api/items/d1",
      "DELETE https://api.kindraw.dev/v1/api/items/g1",
    ]);
  });

  it("routes a normal item id to deleteItem (single DELETE)", async () => {
    mockFetch([
      { status: 200, json: listResponse },
      { status: 204 }, // DELETE /v1/api/items/draw1
    ]);
    const c = client();
    const kind = await c.deleteAny("draw1");
    expect(kind).toBe("drawing");
    expect(calls.map((x) => `${x.init.method} ${x.url}`)).toEqual([
      "GET https://api.kindraw.dev/v1/api/items",
      "DELETE https://api.kindraw.dev/v1/api/items/draw1",
    ]);
  });

  it("falls back to deleteItem for an id not present in the list", async () => {
    // An id the list doesn't contain (e.g. already-archived) → default to the
    // plain item delete and let the API return the authoritative result.
    mockFetch([
      { status: 200, json: listResponse },
      { status: 404, json: { error: "Item not found" } },
    ]);
    const c = client();
    await expect(c.deleteAny("missing")).rejects.toMatchObject({ status: 404 });
    expect(calls[1].url).toBe("https://api.kindraw.dev/v1/api/items/missing");
  });
});

describe("templates + icons", () => {
  it("listTemplates GETs /api/templates", async () => {
    mockFetch([
      {
        status: 200,
        json: { templates: [{ id: "t1", title: "Flow", category: "diagram" }] },
      },
    ]);
    const c = new KindrawClient({ token: "kdr_test" });
    const res = await c.listTemplates();
    expect(res.templates[0].id).toBe("t1");
    expect(calls[0].url).toBe("https://api.kindraw.dev/api/templates");
    expect(calls[0].init.method).toBe("GET");
  });

  it("getTemplate GETs /api/templates/:id", async () => {
    mockFetch([
      { status: 200, json: { id: "t1", title: "Flow", elements: [] } },
    ]);
    const c = new KindrawClient({ token: "kdr_test" });
    await c.getTemplate("t1");
    expect(calls[0].url).toBe("https://api.kindraw.dev/api/templates/t1");
  });

  it("searchIcons GETs /api/icons/search with q + limit", async () => {
    mockFetch([
      {
        status: 200,
        json: { icons: [{ id: "mdi:home", set: "mdi", name: "home" }] },
      },
    ]);
    const c = new KindrawClient({ token: "kdr_test" });
    const res = await c.searchIcons("home", 10);
    expect(res.icons[0].id).toBe("mdi:home");
    expect(calls[0].url).toBe(
      "https://api.kindraw.dev/api/icons/search?q=home&limit=10",
    );
  });

  it("searchIcons defaults limit to 48", async () => {
    mockFetch([{ status: 200, json: { icons: [] } }]);
    const c = new KindrawClient({ token: "kdr_test" });
    await c.searchIcons("x");
    expect(calls[0].url).toContain("limit=48");
  });

  it("getIconSvg validates id then GETs /api/icons/svg as TEXT", async () => {
    mockFetch([{ status: 200, text: "<svg/>", contentType: "image/svg+xml" }]);
    const c = new KindrawClient({ token: "kdr_test" });
    const svg = await c.getIconSvg("mdi:home", "#ff0000");
    expect(svg).toBe("<svg/>");
    expect(calls[0].url).toBe(
      "https://api.kindraw.dev/api/icons/svg?id=mdi%3Ahome&color=%23ff0000",
    );
  });

  it("getIconSvg rejects a malformed id WITHOUT calling fetch", async () => {
    mockFetch([{ status: 200, text: "<svg/>" }]);
    const c = new KindrawClient({ token: "kdr_test" });
    await expect(c.getIconSvg("not a valid id")).rejects.toThrow(
      /invalid icon id/i,
    );
    expect(calls.length).toBe(0);
  });

  // FIX 5 (Security MEDIUM/LOW) — validate the color client-side too, so an
  // invalid color rejects BEFORE the request instead of wasting a round-trip
  // (the worker silently drops an unsafe color).
  it("getIconSvg rejects a malformed color WITHOUT calling fetch", async () => {
    mockFetch([{ status: 200, text: "<svg/>" }]);
    const c = new KindrawClient({ token: "kdr_test" });
    await expect(c.getIconSvg("mdi:home", "red);x")).rejects.toThrow(
      /invalid icon color/i,
    );
    expect(calls.length).toBe(0);
  });

  it("getIconSvg accepts a valid hex color (with and without #)", async () => {
    mockFetch([
      { status: 200, text: "<svg/>", contentType: "image/svg+xml" },
      { status: 200, text: "<svg/>", contentType: "image/svg+xml" },
    ]);
    const c = new KindrawClient({ token: "kdr_test" });
    await expect(c.getIconSvg("mdi:home", "#ff0000")).resolves.toBe("<svg/>");
    await expect(c.getIconSvg("mdi:home", "red")).resolves.toBe("<svg/>");
    expect(calls.length).toBe(2);
  });
});
