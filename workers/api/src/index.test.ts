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
});
