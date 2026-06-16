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
      const r = responses[Math.min(i, responses.length - 1)];
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
    mockFetch([{ status: 401, json: { error: "bad token" } }]);
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
