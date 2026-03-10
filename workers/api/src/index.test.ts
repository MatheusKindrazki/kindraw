import { beforeEach, describe, expect, it, vi } from "vitest";

import worker, { buildCookie, parseCookies, routeRequest } from "./index";

import type { Env } from "./types";

const { mockStore } = vi.hoisted(() => ({
  mockStore: {
    getSessionPayload: vi.fn(),
    resolveSession: vi.fn(),
    deleteSession: vi.fn(),
    getTree: vi.fn(),
    createFolder: vi.fn(),
    patchFolder: vi.fn(),
    deleteFolder: vi.fn(),
    createItem: vi.fn(),
    getItem: vi.fn(),
    patchItemMeta: vi.fn(),
    putItemContent: vi.fn(),
    deleteItem: vi.fn(),
    enableItemCollaboration: vi.fn(),
    disableItemCollaboration: vi.fn(),
    createShareLink: vi.fn(),
    revokeShareLink: vi.fn(),
    getPublicItem: vi.fn(),
    upsertGithubUser: vi.fn(),
    createSession: vi.fn(),
  },
}));

vi.mock("./store", () => {
  class HttpError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  return {
    HttpError,
    createStore: vi.fn(() => mockStore),
  };
});

const env: Env = {
  KINDRAW_DB: {} as Env["KINDRAW_DB"],
  KINDRAW_BLOBS: {} as Env["KINDRAW_BLOBS"],
  GITHUB_CLIENT_ID: "github-client",
  GITHUB_CLIENT_SECRET: "github-secret",
  KINDRAW_APP_ORIGIN: "http://localhost:3001",
};

const pagesEnv: Env = {
  ...env,
  KINDRAW_APP_ORIGIN: "https://kindraw-web.pages.dev",
};

describe("worker helpers", () => {
  it("parses cookies", () => {
    expect(parseCookies("a=1; b=hello%20world").get("b")).toBe("hello world");
  });

  it("builds httpOnly cookies by default", () => {
    expect(buildCookie("session", "abc")).toContain("HttpOnly");
  });
});

describe("routeRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null session when cookie is missing", async () => {
    mockStore.getSessionPayload.mockResolvedValue(null);

    const response = await routeRequest(
      new Request("http://localhost:8787/api/auth/session"),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it("rejects authenticated routes without session cookie", async () => {
    const response = await worker.fetch(
      new Request("http://localhost:8787/api/tree"),
      env,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Authentication required.",
      status: 401,
    });
  });

  it("returns tree for authenticated user", async () => {
    mockStore.resolveSession.mockResolvedValue({
      session: {
        id: "s-1",
        userId: "u-1",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
      user: {
        id: "u-1",
        githubLogin: "matheus",
        name: "Matheus",
        avatarUrl: null,
      },
    });
    mockStore.getTree.mockResolvedValue({
      folders: [],
      items: [],
    });

    const response = await worker.fetch(
      new Request("http://localhost:8787/api/tree", {
        headers: {
          Cookie: "kindraw_session=s-1",
          Origin: "http://localhost:3001",
        },
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      folders: [],
      items: [],
    });
    expect(mockStore.getTree).toHaveBeenCalledWith("u-1");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:3001",
    );
  });

  it("creates a session from github callback", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "gh-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 42,
            login: "matheus",
            name: "Matheus",
            avatar_url: "https://avatar.test/me.png",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ email: "me@test.dev", primary: true }]),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    mockStore.upsertGithubUser.mockResolvedValue({ id: "u-1" });
    mockStore.createSession.mockResolvedValue({ id: "sess-1" });

    const response = await worker.fetch(
      new Request(
        "http://localhost:8787/api/auth/callback/github?code=abc&state=oauth-state",
        {
          headers: {
            Cookie: "kindraw_oauth_state=oauth-state",
          },
        },
      ),
      env,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("http://localhost:3001/");
    expect(response.headers.get("Set-Cookie")).toContain("kindraw_session=");
    expect(mockStore.upsertGithubUser).toHaveBeenCalledWith({
      githubId: "42",
      githubLogin: "matheus",
      name: "Matheus",
      avatarUrl: "https://avatar.test/me.png",
    });

    fetchMock.mockRestore();
  });

  it("allows pages preview origins in CORS responses", async () => {
    mockStore.getSessionPayload.mockResolvedValue(null);

    const response = await worker.fetch(
      new Request("https://kindraw-api.follow.workers.dev/api/auth/session", {
        headers: {
          Origin: "https://dd6c2018.kindraw-web.pages.dev",
        },
      }),
      pagesEnv,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://dd6c2018.kindraw-web.pages.dev",
    );
  });

  it("redirects github callback back to the pages preview and sets a cross-site session cookie", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "gh-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 42,
            login: "matheus",
            name: "Matheus",
            avatar_url: "https://avatar.test/me.png",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ email: "me@test.dev", primary: true }]),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    mockStore.upsertGithubUser.mockResolvedValue({ id: "u-1" });
    mockStore.createSession.mockResolvedValue({ id: "sess-1" });

    const response = await worker.fetch(
      new Request(
        "https://kindraw-api.follow.workers.dev/api/auth/callback/github?code=abc&state=oauth-state",
        {
          headers: {
            Cookie:
              "kindraw_oauth_state=oauth-state; kindraw_oauth_return_to=https%3A%2F%2Fdd6c2018.kindraw-web.pages.dev",
          },
        },
      ),
      pagesEnv,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://dd6c2018.kindraw-web.pages.dev/",
    );
    expect(response.headers.get("Set-Cookie")).toContain("SameSite=None");

    fetchMock.mockRestore();
  });

  it("enables item collaboration for an authenticated drawing owner", async () => {
    mockStore.resolveSession.mockResolvedValue({
      session: {
        id: "s-1",
        userId: "u-1",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
      },
      user: {
        id: "u-1",
        githubLogin: "matheus",
        name: "Matheus",
        avatarUrl: null,
      },
    });
    mockStore.enableItemCollaboration.mockResolvedValue({
      roomId: "item-1",
      roomKey: "abcdefghijklmnopqrstuv",
      enabledAt: "2026-03-10T12:00:00.000Z",
    });

    const response = await worker.fetch(
      new Request("http://localhost:8787/api/items/item-1/collaboration-room", {
        method: "POST",
        headers: {
          Cookie: "kindraw_session=s-1",
          Origin: "http://localhost:3001",
        },
      }),
      env,
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      collaborationRoom: {
        roomId: "item-1",
        roomKey: "abcdefghijklmnopqrstuv",
        enabledAt: "2026-03-10T12:00:00.000Z",
      },
    });
    expect(mockStore.enableItemCollaboration).toHaveBeenCalledWith(
      "u-1",
      "item-1",
    );
  });
});
