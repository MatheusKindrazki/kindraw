// Thin HTTP client for the Kindraw public API (/v1/api/*). Pure fetch, no DOM
// or mermaid deps — safe to load in any Node context (CLI `items`, MCP CRUD).

export const DEFAULT_API_BASE_URL = "https://api.kindraw.dev";

export type KindrawItemSummary = {
  id: string;
  // The tree/list endpoints also return hybrids (kind:"hybrid", id = hybridId).
  kind: "drawing" | "doc" | "hybrid";
  title: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
};

// GET /api/hybrid-items/:id response (verified against the worker's
// getHybridItem -> toHybridItem shape). The backing item ids are nested under
// `hybrid` (NOT at the top level). We only type the fields we consume.
export type KindrawHybridItemResponse = {
  hybrid: {
    id: string;
    kind: "hybrid";
    title: string;
    docItemId: string;
    drawingItemId: string;
  };
};

export type KindrawMe = {
  user: { id: string; githubLogin: string; name: string };
  scope: string;
  via: "token" | "session";
};

export type CreateDrawingResult = { itemId: string; url: string };

export type CreateDocResult = { itemId: string; url: string };

export type CreateHybridResult = {
  hybridId: string;
  docItemId: string;
  drawingItemId: string;
};

// Template metadata as returned by GET /api/templates (no elements).
export type KindrawTemplateMeta = {
  id: string;
  title: string;
  description?: string;
  category?: string;
};

// A full template (GET /api/templates/:id). `elements` are loose
// convertToExcalidrawElements INPUT skeletons (verified against the Worker
// source workers/api/src/templates.ts): shape elements carry
// {type:'rectangle'|'ellipse'|'diamond', id?, x, y, width, height,
// backgroundColor?, label:{text, verticalAlign?, fontFamily?, fontSize?}}, and
// arrow elements carry {type:'arrow', x, y, points:[[x,y],...], label?,
// startArrowhead?, endArrowhead?} — arrows have NO id and NO start/end bindings:
// they are INTENTIONALLY UNBOUND (explicit absolute x/y + relative points) and
// must NOT be run through reanchorArrows (see buildFromSkeletons).
export type KindrawTemplate = KindrawTemplateMeta & {
  elements: Array<Record<string, unknown>>;
};

// One Iconify search hit (GET /api/icons/search). `id` is "prefix:name".
export type KindrawIconHit = { id: string; set: string; name: string };

export class KindrawApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "KindrawApiError";
  }
}

export type KindrawClientOptions = {
  token: string;
  baseUrl?: string;
  /**
   * The Kindraw app origin used to build user-facing URLs (/doc, /draw,
   * /hybrid). The server's create responses always return a /draw URL even for
   * docs (verified C3: buildItemPath), so we never trust them — we build URLs
   * here. Resolution order:
   *   (a) this option, if set;
   *   (b) else derive from baseUrl by stripping a leading "api." host segment
   *       (api.kindraw.dev -> kindraw.dev), a deterministic backstop.
   * The MCP/CLI pass this from the same config.json they already load.
   */
  appOrigin?: string;
};

export class KindrawClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly appOrigin: string;

  constructor(options: KindrawClientOptions) {
    if (!options.token) {
      throw new Error("KindrawClient requires an API token.");
    }
    this.token = options.token;
    this.baseUrl = (options.baseUrl || DEFAULT_API_BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.appOrigin = KindrawClient.resolveAppOrigin(
      this.baseUrl,
      options.appOrigin,
    );
  }

  // Resolve the app origin once at construction. Prefer the explicit option;
  // otherwise strip a leading "api." label from the baseUrl host so
  // https://api.kindraw.dev -> https://kindraw.dev. A baseUrl whose host does
  // not start with "api." is returned as-is (e.g. http://localhost:8787).
  private static resolveAppOrigin(baseUrl: string, explicit?: string): string {
    if (explicit) {
      return explicit.replace(/\/+$/, "");
    }
    try {
      const u = new URL(baseUrl);
      if (u.hostname.startsWith("api.")) {
        u.hostname = u.hostname.slice("api.".length);
      }
      return u.origin;
    } catch {
      return baseUrl.replace(/\/+$/, "");
    }
  }

  // Public, pure URL builders. The server's returned `url` is /draw/<id> even
  // for docs (verified C3), so callers MUST use these instead of trusting it.
  docUrl(id: string): string {
    return `${this.appOrigin}/doc/${encodeURIComponent(id)}`;
  }
  drawUrl(id: string): string {
    return `${this.appOrigin}/draw/${encodeURIComponent(id)}`;
  }
  hybridUrl(id: string): string {
    return `${this.appOrigin}/hybrid/${encodeURIComponent(id)}`;
  }

  // Shared non-OK handler for request<T> and requestText: parse a JSON {error}
  // body for a human detail, append the 401 login hint, and throw a typed
  // KindrawApiError. A no-op when the response is ok.
  private async assertOk(response: Response): Promise<void> {
    if (response.ok) {
      return;
    }
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

    await this.assertOk(response);

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

    await this.assertOk(response);

    return response.text();
  }

  whoami(): Promise<KindrawMe> {
    return this.request<KindrawMe>("GET", "/v1/api/me");
  }

  listItems(): Promise<{ items: KindrawItemSummary[] }> {
    return this.request<{ items: KindrawItemSummary[] }>(
      "GET",
      "/v1/api/items",
    );
  }

  getItem(
    itemId: string,
  ): Promise<{ item: KindrawItemSummary; content: string }> {
    return this.request("GET", `/v1/api/items/${encodeURIComponent(itemId)}`);
  }

  // Create a drawing from already-serialized Excalidraw content. Returns a
  // CLIENT-BUILT /draw/<id> url — for a token-auth request the server's url
  // field resolves to the API host (https://api.kindraw.dev/draw/<id>), which
  // won't open the app, so we discard it and rebuild via drawUrl (mirrors
  // createDoc; verified C3/BizLogic M1).
  async createDrawing(input: {
    title: string;
    content: string;
    folderId?: string | null;
  }): Promise<CreateDrawingResult> {
    const { itemId } = await this.request<{ itemId: string; url: string }>(
      "POST",
      "/v1/api/items:generate",
      {
        title: input.title,
        folderId: input.folderId ?? null,
        content: input.content,
      },
    );
    return { itemId, url: this.drawUrl(itemId) };
  }

  // Create a raw-markdown doc. Returns a CLIENT-BUILT /doc/<id> url — the
  // server's url field is /draw/<id> even for docs (verified C3) so we discard
  // it. (Distinct endpoint from createDrawing: kind:"doc", path /v1/api/items.)
  async createDoc(input: {
    title: string;
    content: string;
    folderId?: string | null;
  }): Promise<CreateDocResult> {
    const { itemId } = await this.request<{ itemId: string; url: string }>(
      "POST",
      "/v1/api/items",
      {
        kind: "doc",
        title: input.title,
        folderId: input.folderId ?? null,
        content: input.content,
      },
    );
    return { itemId, url: this.docUrl(itemId) };
  }

  // Seed a hybrid item (a live markdown doc BESIDE an Excalidraw canvas).
  // Bearer-only REST, no WS room → headless-safe. The server auto-seeds the doc
  // ("# {title}\n\n") and an empty drawing, returning the three item refs.
  // NOTE the BARE /api/ prefix (NOT /v1/api/) — verified hybrid contract.
  createHybrid(input: {
    title: string;
    folderId?: string | null;
  }): Promise<CreateHybridResult> {
    return this.request<CreateHybridResult>("POST", "/api/hybrid-items", {
      title: input.title,
      folderId: input.folderId ?? null,
    });
  }

  getHybrid(hybridId: string): Promise<KindrawHybridItemResponse> {
    return this.request<KindrawHybridItemResponse>(
      "GET",
      `/api/hybrid-items/${encodeURIComponent(hybridId)}`,
    );
  }

  // Populate the doc side of a hybrid. BARE /api/ prefix (verified contract) —
  // deliberately distinct from updateContent (/v1/api/) to avoid that footgun.
  updateHybridDoc(docItemId: string, markdown: string): Promise<void> {
    return this.request<void>(
      "PUT",
      `/api/items/${encodeURIComponent(docItemId)}/content`,
      { content: markdown },
    );
  }

  // Populate the canvas side of a hybrid. The server does NOT validate the JSON
  // it stores, so callers MUST JSON.parse-validate `json` BEFORE calling.
  updateHybridDrawing(drawingItemId: string, json: string): Promise<void> {
    return this.request<void>(
      "PUT",
      `/api/items/${encodeURIComponent(drawingItemId)}/content`,
      { content: json },
    );
  }

  // --- Templates + icons (PUBLIC endpoints; Bearer is harmless) ---

  // List the built-in templates (metadata only). The id is opaque — list first,
  // then pass it to getTemplate / kindraw_apply_template.
  listTemplates(): Promise<{ templates: KindrawTemplateMeta[] }> {
    return this.request("GET", "/api/templates");
  }

  // Fetch one full template, including its loose element skeletons.
  getTemplate(id: string): Promise<KindrawTemplate> {
    return this.request("GET", `/api/templates/${encodeURIComponent(id)}`);
  }

  // Search the Iconify proxy. Empty q -> {icons:[]}; limit default 48, max 96.
  searchIcons(q: string, limit = 48): Promise<{ icons: KindrawIconHit[] }> {
    const params = new URLSearchParams({ q, limit: String(limit) });
    return this.request("GET", `/api/icons/search?${params.toString()}`);
  }

  // Returns a RAW SVG string (image/svg+xml) via requestText (verified C1 —
  // request<T> always calls .json() and would throw on an SVG body). Validate
  // the id BEFORE the call: the server requires /^[a-z0-9-]+:[a-z0-9-]+$/i, and
  // we never want to spend a network round-trip on a malformed id.
  // `async` so a bad id rejects the returned Promise (rather than throwing
  // synchronously at the call site) — the validation still runs BEFORE any
  // fetch, so a malformed id never reaches the network.
  async getIconSvg(id: string, color?: string): Promise<string> {
    if (!/^[a-z0-9-]+:[a-z0-9-]+$/i.test(id)) {
      throw new Error(`Invalid icon id "${id}" (expected "prefix:name").`);
    }
    // Validate the color BEFORE the request too: the worker enforces its own
    // SAFE_COLOR_PATTERN (an optional "#" plus alphanumerics) and SILENTLY DROPS
    // anything else, so an invalid color would otherwise waste a round-trip and
    // return an uncolored icon with no error. Mirror that pattern here so a bad
    // color rejects without ever reaching the network. (Security MEDIUM/LOW.)
    if (color && !/^#?[a-z0-9]+$/i.test(color)) {
      throw new Error(`Invalid icon color "${color}".`);
    }
    const params = new URLSearchParams({ id });
    if (color) {
      params.set("color", color);
    }
    return this.requestText("GET", `/api/icons/svg?${params.toString()}`);
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

  // Completely delete a hybrid item. A hybrid lives in a SEPARATE hybrid_items
  // table, so deleteItem(hybridId) -> DELETE /v1/api/items/:id 404s; the correct
  // route is DELETE /api/hybrid-items/:id (bare /api/, requireAuth). But deleting
  // only the hybrid row ORPHANS its backing doc + drawing items (they reappear as
  // loose items), so a COMPLETE delete must also remove docItemId + drawingItemId.
  //
  // Order matters: GET the hybrid FIRST to capture the backing ids (the row may
  // become unfetchable once deleted), THEN delete the hybrid row, THEN delete the
  // now-standalone backing items via /v1/api/items/:id (which works once they're
  // loose). Each backing delete tolerates a 404 (already gone) so a partial state
  // still cleans up as much as possible; any other error propagates.
  async deleteHybrid(hybridId: string): Promise<void> {
    // 1) Capture refs BEFORE deleting the row.
    const { hybrid } = await this.getHybrid(hybridId);
    const { docItemId, drawingItemId } = hybrid;

    // 2) Delete the hybrid row (bare /api/).
    await this.request<void>(
      "DELETE",
      `/api/hybrid-items/${encodeURIComponent(hybridId)}`,
    );

    // 3) Delete the now-orphaned backing items, swallowing a 404 on each.
    await this.deleteBackingItemIgnoring404(docItemId);
    await this.deleteBackingItemIgnoring404(drawingItemId);
  }

  // Delete an item by id, ROUTING by kind: a hybrid id (which lives in the
  // separate hybrid_items table and 404s on /v1/api/items/:id) goes through
  // deleteHybrid (full cleanup incl. backing doc/drawing); everything else goes
  // through deleteItem. Detection is one listItems() call — hybrids appear in the
  // tree with kind:"hybrid" and id = the hybridId. An id not in the list falls
  // back to deleteItem so the API returns the authoritative result (e.g. 404).
  // Returns the kind it routed as (for the caller's confirmation message).
  async deleteAny(id: string): Promise<KindrawItemSummary["kind"]> {
    const { items } = await this.listItems();
    const match = items.find((item) => item.id === id);
    if (match?.kind === "hybrid") {
      await this.deleteHybrid(id);
      return "hybrid";
    }
    await this.deleteItem(id);
    return match?.kind ?? "drawing";
  }

  // Delete one backing item, swallowing a 404 (already deleted) so a complete
  // hybrid delete cleans up as much as possible. Any other API error propagates.
  private async deleteBackingItemIgnoring404(itemId: string): Promise<void> {
    try {
      await this.deleteItem(itemId);
    } catch (err) {
      if (err instanceof KindrawApiError && err.status === 404) {
        return;
      }
      throw err;
    }
  }
}
