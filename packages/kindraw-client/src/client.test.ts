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
