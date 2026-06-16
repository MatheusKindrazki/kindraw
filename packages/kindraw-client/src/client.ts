// Thin HTTP client for the Kindraw public API (/v1/api/*). Pure fetch, no DOM
// or mermaid deps — safe to load in any Node context (CLI `items`, MCP CRUD).

export const DEFAULT_API_BASE_URL = "https://api.kindraw.dev";

export type KindrawItemSummary = {
  id: string;
  kind: "drawing" | "doc";
  title: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KindrawMe = {
  user: { id: string; githubLogin: string; name: string };
  scope: string;
  via: "token" | "session";
};

export type CreateDrawingResult = { itemId: string; url: string };

export class KindrawApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "KindrawApiError";
  }
}

export type KindrawClientOptions = {
  token: string;
  baseUrl?: string;
};

export class KindrawClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(options: KindrawClientOptions) {
    if (!options.token) {
      throw new Error("KindrawClient requires an API token.");
    }
    this.token = options.token;
    this.baseUrl = (options.baseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const parsed = (await response.json()) as { error?: string };
        if (parsed?.error) {
          detail = parsed.error;
        }
      } catch {
        // ignore non-JSON error bodies
      }
      if (response.status === 401) {
        detail = `${detail} (run "kindraw login" or check KINDRAW_TOKEN)`;
      }
      throw new KindrawApiError(response.status, detail);
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  // Sibling of request<T> for endpoints that return a raw (non-JSON) body —
  // specifically GET /api/icons/svg, which returns image/svg+xml. We reuse the
  // SAME Bearer header + 401 hint + KindrawApiError handling; only the success
  // path differs (.text() instead of .json()). (Verified C1: request<T> always
  // calls response.json() and would throw on an SVG body.)
  private async requestText(method: string, path: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}` },
    });

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const parsed = (await response.json()) as { error?: string };
        if (parsed?.error) {
          detail = parsed.error;
        }
      } catch {
        // ignore non-JSON error bodies
      }
      if (response.status === 401) {
        detail = `${detail} (run "kindraw login" or check KINDRAW_TOKEN)`;
      }
      throw new KindrawApiError(response.status, detail);
    }

    return response.text();
  }

  whoami(): Promise<KindrawMe> {
    return this.request<KindrawMe>("GET", "/v1/api/me");
  }

  listItems(): Promise<{ items: KindrawItemSummary[] }> {
    return this.request<{ items: KindrawItemSummary[] }>("GET", "/v1/api/items");
  }

  getItem(
    itemId: string,
  ): Promise<{ item: KindrawItemSummary; content: string }> {
    return this.request("GET", `/v1/api/items/${encodeURIComponent(itemId)}`);
  }

  // Create a drawing from already-serialized Excalidraw content.
  createDrawing(input: {
    title: string;
    content: string;
    folderId?: string | null;
  }): Promise<CreateDrawingResult> {
    return this.request<CreateDrawingResult>("POST", "/v1/api/items:generate", {
      title: input.title,
      folderId: input.folderId ?? null,
      content: input.content,
    });
  }

  updateContent(itemId: string, content: string): Promise<void> {
    return this.request<void>(
      "PUT",
      `/v1/api/items/${encodeURIComponent(itemId)}/content`,
      { content },
    );
  }

  deleteItem(itemId: string): Promise<void> {
    return this.request<void>(
      "DELETE",
      `/v1/api/items/${encodeURIComponent(itemId)}`,
    );
  }
}
