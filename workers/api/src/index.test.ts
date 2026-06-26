import { beforeEach, describe, expect, it, vi } from "vitest";

import worker, { buildCookie, parseCookies, routeRequest } from "./index";

import type { Env } from "./types";

const { mockStore, mockOpenAIChatCreate, mockOpenAIConstructor } = vi.hoisted(
  () => ({
    mockStore: {
      getSessionPayload: vi.fn(),
      resolveSession: vi.fn(),
      deleteSession: vi.fn(),
      getTree: vi.fn(),
      createHybridItem: vi.fn(),
      getHybridItem: vi.fn(),
      patchHybridItemMeta: vi.fn(),
      deleteHybridItem: vi.fn(),
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
      getCollaborationRoomBootstrap: vi.fn(),
      createShareLink: vi.fn(),
      revokeShareLink: vi.fn(),
      getPublicItem: vi.fn(),
      upsertGithubUser: vi.fn(),
      createSession: vi.fn(),
      searchUsers: vi.fn(),
      getUserByLogin: vi.fn(),
      grantFolderAccess: vi.fn(),
      updateFolderAccessRole: vi.fn(),
      revokeFolderAccess: vi.fn(),
      listFolderShares: vi.fn(),
      convertDrawingToHybrid: vi.fn(),
      grantHybridAccess: vi.fn(),
      updateHybridAccessRole: vi.fn(),
      revokeHybridAccess: vi.fn(),
      listHybridShares: vi.fn(),
      hybridAccessRole: vi.fn(),
      resolveHybridShareLink: vi.fn(),
      createHybridShareLink: vi.fn(),
      addToWaitlist: vi.fn(),
    },
    mockOpenAIChatCreate: vi.fn(),
    mockOpenAIConstructor: vi.fn(),
  }),
);

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: mockOpenAIChatCreate,
      },
    };

    constructor(config: unknown) {
      mockOpenAIConstructor(config);
    }
  },
}));

const mockCollabStub = {
  fetch: vi.fn(),
};

const mockCollabNamespace = {
  idFromName: vi.fn((name: string) => ({ toString: () => name })),
  get: vi.fn(() => mockCollabStub),
};

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
  KINDRAW_COLLAB: mockCollabNamespace as Env["KINDRAW_COLLAB"],
  GITHUB_CLIENT_ID: "github-client",
  GITHUB_CLIENT_SECRET: "github-secret",
  KINDRAW_APP_ORIGIN: "http://localhost:3001",
  OPENROUTER_API_KEY: "openrouter-secret",
};

const pagesEnv: Env = {
  ...env,
  KINDRAW_APP_ORIGIN: "https://kindraw-web.pages.dev",
};

const authenticatedSession = () => ({
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

type ChatCompletionChunk = {
  choices: Array<{
    delta?: {
      content?: string;
    };
    finish_reason?: string | null;
  }>;
};

const streamChunks = (...chunks: Array<ChatCompletionChunk>) =>
  ({
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  } as AsyncIterable<ChatCompletionChunk>);

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
    mockCollabStub.fetch.mockReset();
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

  it("captures a valid email on the public waitlist (no auth)", async () => {
    mockStore.addToWaitlist.mockResolvedValue(undefined);

    const response = await worker.fetch(
      new Request("http://localhost:8787/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "  Dev@Example.com ", source: "hero" }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    // normalized (lower + trim) before storing
    expect(mockStore.addToWaitlist).toHaveBeenCalledWith(
      "dev@example.com",
      "hero",
    );
  });

  it("rejects an invalid email on the public waitlist", async () => {
    const response = await worker.fetch(
      new Request("http://localhost:8787/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email" }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    expect(mockStore.addToWaitlist).not.toHaveBeenCalled();
  });

  it("defaults the waitlist source to 'landing' when omitted", async () => {
    mockStore.addToWaitlist.mockResolvedValue(undefined);

    const response = await worker.fetch(
      new Request("http://localhost:8787/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "person@team.dev" }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(mockStore.addToWaitlist).toHaveBeenCalledWith(
      "person@team.dev",
      "landing",
    );
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
    mockStore.resolveSession.mockResolvedValue(authenticatedSession());
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

  it("creates a hybrid item for an authenticated user", async () => {
    mockStore.resolveSession.mockResolvedValue(authenticatedSession());
    mockStore.createHybridItem.mockResolvedValue({
      hybridId: "hybrid-1",
      docItemId: "doc-1",
      drawingItemId: "drawing-1",
    });

    const response = await worker.fetch(
      new Request("http://localhost:8787/api/hybrid-items", {
        method: "POST",
        headers: {
          Cookie: "kindraw_session=s-1",
          Origin: "http://localhost:3001",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Portal Cross",
          folderId: "folder-1",
        }),
      }),
      env,
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      hybridId: "hybrid-1",
      docItemId: "doc-1",
      drawingItemId: "drawing-1",
    });
    expect(mockStore.createHybridItem).toHaveBeenCalledWith("u-1", {
      title: "Portal Cross",
      folderId: "folder-1",
    });
  });

  it("returns a hybrid item payload for an authenticated user", async () => {
    mockStore.resolveSession.mockResolvedValue(authenticatedSession());
    mockStore.getHybridItem.mockResolvedValue({
      hybrid: {
        id: "hybrid-1",
        kind: "hybrid",
        title: "Portal Cross",
        folderId: null,
        ownerId: "u-1",
        updatedAt: "2026-03-10T12:00:00.000Z",
        createdAt: "2026-03-10T11:00:00.000Z",
        archivedAt: null,
        shareLinks: [],
        docItemId: "doc-1",
        drawingItemId: "drawing-1",
        defaultView: "both",
      },
      document: {
        item: {
          id: "doc-1",
          kind: "doc",
          title: "Portal Cross",
          folderId: null,
          ownerId: "u-1",
          updatedAt: "2026-03-10T12:00:00.000Z",
          createdAt: "2026-03-10T11:00:00.000Z",
          archivedAt: null,
          shareLinks: [],
          collaborationRoomId: null,
          collaborationEnabledAt: null,
          hybrid: {
            hybridId: "hybrid-1",
            docItemId: "doc-1",
            drawingItemId: "drawing-1",
            role: "doc",
            defaultView: "both",
          },
        },
        content: "# Portal Cross",
        collaborationRoom: null,
      },
      drawing: {
        item: {
          id: "drawing-1",
          kind: "drawing",
          title: "Portal Cross",
          folderId: null,
          ownerId: "u-1",
          updatedAt: "2026-03-10T12:00:00.000Z",
          createdAt: "2026-03-10T11:00:00.000Z",
          archivedAt: null,
          shareLinks: [],
          collaborationRoomId: null,
          collaborationEnabledAt: null,
          hybrid: {
            hybridId: "hybrid-1",
            docItemId: "doc-1",
            drawingItemId: "drawing-1",
            role: "drawing",
            defaultView: "both",
          },
        },
        content: '{"elements":[]}',
        collaborationRoom: null,
      },
    });

    const response = await worker.fetch(
      new Request("http://localhost:8787/api/hybrid-items/hybrid-1", {
        headers: {
          Cookie: "kindraw_session=s-1",
          Origin: "http://localhost:3001",
        },
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(mockStore.getHybridItem).toHaveBeenCalledWith("u-1", "hybrid-1");
  });

  it("patches hybrid metadata for an authenticated user", async () => {
    mockStore.resolveSession.mockResolvedValue(authenticatedSession());

    const response = await worker.fetch(
      new Request("http://localhost:8787/api/hybrid-items/hybrid-1/meta", {
        method: "PATCH",
        headers: {
          Cookie: "kindraw_session=s-1",
          Origin: "http://localhost:3001",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Portal Cross v2",
          folderId: null,
          defaultView: "canvas",
        }),
      }),
      env,
    );

    expect(response.status).toBe(204);
    expect(mockStore.patchHybridItemMeta).toHaveBeenCalledWith(
      "u-1",
      "hybrid-1",
      {
        title: "Portal Cross v2",
        folderId: null,
        defaultView: "canvas",
      },
    );
  });

  it("deletes a hybrid link for an authenticated user", async () => {
    mockStore.resolveSession.mockResolvedValue(authenticatedSession());

    const response = await worker.fetch(
      new Request("http://localhost:8787/api/hybrid-items/hybrid-1", {
        method: "DELETE",
        headers: {
          Cookie: "kindraw_session=s-1",
          Origin: "http://localhost:3001",
        },
      }),
      env,
    );

    expect(response.status).toBe(204);
    expect(mockStore.deleteHybridItem).toHaveBeenCalledWith("u-1", "hybrid-1");
  });

  it("streams Mermaid output from the AI route", async () => {
    mockStore.resolveSession.mockResolvedValue(authenticatedSession());
    mockOpenAIChatCreate.mockResolvedValue(
      streamChunks(
        {
          choices: [
            {
              delta: {
                content: "flowchart LR\n",
              },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                content: 'A["Start"] --> B["Finish"]',
              },
              finish_reason: "stop",
            },
          ],
        },
      ),
    );

    const response = await worker.fetch(
      new Request(
        "http://localhost:8787/v1/ai/text-to-diagram/chat-streaming",
        {
          method: "POST",
          headers: {
            Cookie: "kindraw_session=s-1",
            Origin: "http://localhost:3001",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: "faça um fluxo simples" }],
          }),
        },
      ),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    const body = await response.text();
    expect(body).toContain('"delta":"flowchart LR\\n"');
    expect(body).toContain('"delta":"A[\\"Start\\"] --> B[\\"Finish\\"]"');
    expect(body).toContain('"finishReason":"stop"');
    expect(body).toContain("data: [DONE]");
    expect(mockOpenAIConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "openrouter-secret",
        baseURL: "https://openrouter.ai/api/v1",
      }),
    );
    expect(mockOpenAIChatCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "minimax/minimax-m2.5",
        stream: true,
        user: "u-1",
      }),
    );
  });

  it("generates HTML from the AI wireframe route", async () => {
    mockStore.resolveSession.mockResolvedValue(authenticatedSession());
    mockOpenAIChatCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content:
              "```html\n<html><body><main>Preview</main></body></html>\n```",
          },
        },
      ],
    });

    const response = await worker.fetch(
      new Request("http://localhost:8787/v1/ai/diagram-to-code/generate", {
        method: "POST",
        headers: {
          Cookie: "kindraw_session=s-1",
          Origin: "http://localhost:3001",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          texts: "Hero, CTA",
          image: "data:image/jpeg;base64,abc123",
          theme: "dark",
        }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      html: "<html><body><main>Preview</main></body></html>",
    });
    expect(mockOpenAIChatCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "minimax/minimax-01",
        user: "u-1",
      }),
    );
  });

  it("returns 503 when OpenRouter is not configured", async () => {
    mockStore.resolveSession.mockResolvedValue(authenticatedSession());

    const response = await worker.fetch(
      new Request(
        "http://localhost:8787/v1/ai/text-to-diagram/chat-streaming",
        {
          method: "POST",
          headers: {
            Cookie: "kindraw_session=s-1",
            Origin: "http://localhost:3001",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: "faça um fluxo simples" }],
          }),
        },
      ),
      {
        ...env,
        OPENROUTER_API_KEY: undefined,
      },
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "OpenRouter is not configured.",
      status: 503,
    });
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
          JSON.stringify([
            { email: "me@test.dev", primary: true, verified: true },
          ]),
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
      // Verified primary email is now extracted for account linking.
      email: "me@test.dev",
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

  it("surfaces the GitHub OAuth error description when token exchange fails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "redirect_uri_mismatch",
          error_description:
            "The redirect_uri is not associated with this application.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

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

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error:
        "GitHub token exchange failed: The redirect_uri is not associated with this application..",
      status: 502,
    });

    fetchMock.mockRestore();
  });

  it("enables item collaboration for an authenticated drawing owner", async () => {
    mockStore.resolveSession.mockResolvedValue(authenticatedSession());
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

  it("returns a public collaboration bootstrap when room key is valid", async () => {
    mockStore.getCollaborationRoomBootstrap.mockResolvedValue({
      item: {
        id: "item-1",
        kind: "drawing",
        title: "Realtime board",
        updatedAt: "2026-03-10T12:00:00.000Z",
        createdAt: "2026-03-10T11:00:00.000Z",
      },
      content: '{"elements":[]}',
      collaborationRoom: {
        roomId: "item-1",
        roomKey: "room-key-1",
        enabledAt: "2026-03-10T12:00:00.000Z",
      },
    });

    const response = await worker.fetch(
      new Request(
        "http://localhost:8787/api/collaboration-room/item-1/bootstrap?key=room-key-1",
        {
          headers: {
            Origin: "http://localhost:3001",
          },
        },
      ),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      item: {
        id: "item-1",
        kind: "drawing",
        title: "Realtime board",
        updatedAt: "2026-03-10T12:00:00.000Z",
        createdAt: "2026-03-10T11:00:00.000Z",
      },
      content: '{"elements":[]}',
      collaborationRoom: {
        roomId: "item-1",
        roomKey: "room-key-1",
        enabledAt: "2026-03-10T12:00:00.000Z",
      },
    });
    expect(mockStore.getCollaborationRoomBootstrap).toHaveBeenCalledWith(
      "item-1",
      "room-key-1",
    );
  });

  it("forwards collaboration websocket upgrades to the durable object room", async () => {
    mockCollabStub.fetch.mockResolvedValue(new Response(null, { status: 204 }));

    const response = await routeRequest(
      new Request("http://localhost:8787/api/collab/rooms/room-1/ws", {
        headers: {
          Upgrade: "websocket",
        },
      }),
      env,
    );

    expect(mockCollabNamespace.idFromName).toHaveBeenCalledWith("room-1");
    expect(mockCollabNamespace.get).toHaveBeenCalled();
    expect(mockCollabStub.fetch).toHaveBeenCalled();
    expect(response.status).toBe(204);
  });

  it("authorizes a hybrid doc room for a user with access to the hybrid", async () => {
    mockCollabStub.fetch.mockResolvedValue(new Response(null, { status: 204 }));
    mockStore.getSessionPayload.mockResolvedValue({
      user: {
        id: "u-1",
        githubLogin: "matheus",
        name: "Matheus",
        avatarUrl: null,
      },
    });
    mockStore.hybridAccessRole.mockResolvedValue("editor");

    const response = await routeRequest(
      new Request("http://localhost:8787/api/collab/rooms/hdoc:hyb-1/ws", {
        headers: { Upgrade: "websocket", Cookie: "kindraw_session=s-1" },
      }),
      env,
    );

    expect(mockStore.hybridAccessRole).toHaveBeenCalledWith("u-1", "hyb-1");
    expect(mockCollabNamespace.idFromName).toHaveBeenCalledWith("hdoc:hyb-1");
    expect(response.status).toBe(204);
  });

  it("rejects a hybrid doc room when there is no session and no token", async () => {
    mockStore.getSessionPayload.mockResolvedValue(null);

    const response = await routeRequest(
      new Request("http://localhost:8787/api/collab/rooms/hdoc:hyb-1/ws", {
        headers: { Upgrade: "websocket" },
      }),
      env,
    );

    expect(response.status).toBe(403);
    expect(mockCollabStub.fetch).not.toHaveBeenCalled();
  });

  it("authorizes a hybrid room via a live-edit share link token", async () => {
    mockCollabStub.fetch.mockResolvedValue(new Response(null, { status: 204 }));
    mockStore.getSessionPayload.mockResolvedValue(null);
    mockStore.resolveHybridShareLink.mockResolvedValue({
      hybridId: "hyb-1",
      access: "live-edit",
    });

    const response = await routeRequest(
      new Request(
        "http://localhost:8787/api/collab/rooms/hcanvas:hyb-1/ws?token=tok-live",
        { headers: { Upgrade: "websocket" } },
      ),
      env,
    );

    expect(mockStore.resolveHybridShareLink).toHaveBeenCalledWith("tok-live");
    expect(response.status).toBe(204);
  });

  it("rejects a hybrid room when the token is read-only (not live-edit)", async () => {
    mockStore.getSessionPayload.mockResolvedValue(null);
    mockStore.resolveHybridShareLink.mockResolvedValue({
      hybridId: "hyb-1",
      access: "read",
    });

    const response = await routeRequest(
      new Request(
        "http://localhost:8787/api/collab/rooms/hdoc:hyb-1/ws?token=tok-read",
        { headers: { Upgrade: "websocket" } },
      ),
      env,
    );

    expect(response.status).toBe(403);
    expect(mockCollabStub.fetch).not.toHaveBeenCalled();
  });

  it("searches users by query for an authenticated user", async () => {
    mockStore.resolveSession.mockResolvedValue(authenticatedSession());
    mockStore.searchUsers.mockResolvedValue([
      { id: "u-2", githubLogin: "hubot", name: "Hu Bot", avatarUrl: null },
    ]);

    const response = await worker.fetch(
      new Request("http://localhost:8787/api/users/search?q=hub", {
        headers: {
          Cookie: "kindraw_session=s-1",
          Origin: "http://localhost:3001",
        },
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      users: [
        { id: "u-2", githubLogin: "hubot", name: "Hu Bot", avatarUrl: null },
      ],
    });
    expect(mockStore.searchUsers).toHaveBeenCalledWith("hub", "u-1");
  });

  it("rejects an empty user search query", async () => {
    mockStore.resolveSession.mockResolvedValue(authenticatedSession());

    const response = await worker.fetch(
      new Request("http://localhost:8787/api/users/search?q=", {
        headers: {
          Cookie: "kindraw_session=s-1",
          Origin: "http://localhost:3001",
        },
      }),
      env,
    );

    expect(response.status).toBe(400);
    expect(mockStore.searchUsers).not.toHaveBeenCalled();
  });

  it("lists folder shares for an authenticated owner", async () => {
    mockStore.resolveSession.mockResolvedValue(authenticatedSession());
    mockStore.listFolderShares.mockResolvedValue([
      {
        id: "share-1",
        role: "viewer",
        createdAt: "2026-03-09T11:00:00.000Z",
        user: {
          id: "u-2",
          githubLogin: "hubot",
          name: "Hu Bot",
          avatarUrl: null,
        },
      },
    ]);

    const response = await worker.fetch(
      new Request("http://localhost:8787/api/folders/folder-1/shares", {
        headers: {
          Cookie: "kindraw_session=s-1",
          Origin: "http://localhost:3001",
        },
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      shares: [
        {
          id: "share-1",
          role: "viewer",
          createdAt: "2026-03-09T11:00:00.000Z",
          user: {
            id: "u-2",
            githubLogin: "hubot",
            name: "Hu Bot",
            avatarUrl: null,
          },
        },
      ],
    });
    expect(mockStore.listFolderShares).toHaveBeenCalledWith("u-1", "folder-1");
  });

  it("grants folder access by login and role", async () => {
    mockStore.resolveSession.mockResolvedValue(authenticatedSession());
    mockStore.getUserByLogin.mockResolvedValue({
      id: "u-2",
      githubLogin: "hubot",
      name: "Hu Bot",
      avatarUrl: null,
    });
    mockStore.grantFolderAccess.mockResolvedValue({
      id: "share-1",
      role: "editor",
      createdAt: "2026-03-09T12:00:00.000Z",
      user: {
        id: "u-2",
        githubLogin: "hubot",
        name: "Hu Bot",
        avatarUrl: null,
      },
    });

    const response = await worker.fetch(
      new Request("http://localhost:8787/api/folders/folder-1/shares", {
        method: "POST",
        headers: {
          Cookie: "kindraw_session=s-1",
          Origin: "http://localhost:3001",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ login: "hubot", role: "editor" }),
      }),
      env,
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      share: {
        id: "share-1",
        role: "editor",
        createdAt: "2026-03-09T12:00:00.000Z",
        user: {
          id: "u-2",
          githubLogin: "hubot",
          name: "Hu Bot",
          avatarUrl: null,
        },
      },
    });
    expect(mockStore.getUserByLogin).toHaveBeenCalledWith("hubot");
    expect(mockStore.grantFolderAccess).toHaveBeenCalledWith(
      "u-1",
      "folder-1",
      "u-2",
      "editor",
    );
  });

  it("returns 404 when granting access to an unknown login", async () => {
    mockStore.resolveSession.mockResolvedValue(authenticatedSession());
    mockStore.getUserByLogin.mockResolvedValue(null);

    const response = await worker.fetch(
      new Request("http://localhost:8787/api/folders/folder-1/shares", {
        method: "POST",
        headers: {
          Cookie: "kindraw_session=s-1",
          Origin: "http://localhost:3001",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ login: "ghost", role: "viewer" }),
      }),
      env,
    );

    expect(response.status).toBe(404);
    expect(mockStore.grantFolderAccess).not.toHaveBeenCalled();
  });

  it("rejects an invalid role when granting access", async () => {
    mockStore.resolveSession.mockResolvedValue(authenticatedSession());

    const response = await worker.fetch(
      new Request("http://localhost:8787/api/folders/folder-1/shares", {
        method: "POST",
        headers: {
          Cookie: "kindraw_session=s-1",
          Origin: "http://localhost:3001",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ login: "hubot", role: "admin" }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    expect(mockStore.getUserByLogin).not.toHaveBeenCalled();
    expect(mockStore.grantFolderAccess).not.toHaveBeenCalled();
  });

  it("updates a folder share role", async () => {
    mockStore.resolveSession.mockResolvedValue(authenticatedSession());
    mockStore.updateFolderAccessRole.mockResolvedValue({
      id: "share-1",
      role: "viewer",
      createdAt: "2026-03-09T12:00:00.000Z",
      user: {
        id: "u-2",
        githubLogin: "hubot",
        name: "Hu Bot",
        avatarUrl: null,
      },
    });

    const response = await worker.fetch(
      new Request("http://localhost:8787/api/folders/folder-1/shares/share-1", {
        method: "PATCH",
        headers: {
          Cookie: "kindraw_session=s-1",
          Origin: "http://localhost:3001",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: "viewer" }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(mockStore.updateFolderAccessRole).toHaveBeenCalledWith(
      "u-1",
      "folder-1",
      "share-1",
      "viewer",
    );
  });

  it("revokes a folder share", async () => {
    mockStore.resolveSession.mockResolvedValue(authenticatedSession());
    mockStore.revokeFolderAccess.mockResolvedValue(undefined);

    const response = await worker.fetch(
      new Request("http://localhost:8787/api/folders/folder-1/shares/share-1", {
        method: "DELETE",
        headers: {
          Cookie: "kindraw_session=s-1",
          Origin: "http://localhost:3001",
        },
      }),
      env,
    );

    expect(response.status).toBe(204);
    expect(mockStore.revokeFolderAccess).toHaveBeenCalledWith(
      "u-1",
      "folder-1",
      "share-1",
    );
  });

  it("does not treat /shares paths as a plain folder patch/delete", async () => {
    mockStore.resolveSession.mockResolvedValue(authenticatedSession());
    mockStore.revokeFolderAccess.mockResolvedValue(undefined);

    const response = await worker.fetch(
      new Request("http://localhost:8787/api/folders/folder-1/shares/share-1", {
        method: "DELETE",
        headers: {
          Cookie: "kindraw_session=s-1",
          Origin: "http://localhost:3001",
        },
      }),
      env,
    );

    expect(response.status).toBe(204);
    // the generic folder DELETE handler must NOT have fired
    expect(mockStore.deleteFolder).not.toHaveBeenCalled();
  });
});
