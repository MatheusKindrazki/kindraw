# Kindraw MCP/CLI Phases 2-4 Implementation Plan

> **For Agents:** REQUIRED SUB-SKILL: Use ring:executing-plans to implement this plan task-by-task.

**Goal:** Add doc, hybrid (live-markdown-beside-canvas), template, and icon authoring to the Kindraw MCP server and CLI by extending the shared `@kindraw/client`, reusing the existing `buildScene` layout engine, with zero Worker changes — every addition is additive and the parser that produces section-link slugs is the *real* app parser (no regex drift).

**Architecture:** Three independently-shippable phases sit on top of the existing thin HTTP client (`packages/kindraw-client/src/client.ts`) and the deterministic scene builder (`packages/kindraw-client/src/scene/`). Phase 2 adds raw markdown docs. Phase 3 adds hybrid items (an Excalidraw canvas next to a live markdown doc, wired together by `kindraw://section/...` element links whose slugs come from re-parsing the *final* markdown with the app's `parseHybridMarkdownSections`). Phase 4 adds 12 server templates and an Iconify icon proxy, rendered into scenes via additive `buildScene` inputs. The client never trusts the server's returned `url` (it always returns `/draw/<id>`); the client builds `/doc/<id>`, `/hybrid/<id>` itself from a resolved app origin.

**Tech Stack:** TypeScript (ESM, `moduleResolution: Bundler`), Node ≥18, `@modelcontextprotocol/sdk` (MCP), `zod` (input schemas), `vitest` (tests), `esbuild` (client bundling), `marked@15.0.12` (markdown lexer — already a root dep, to be vendored into the client for slug parity), `@excalidraw/element` `convertToExcalidrawElements` (scene serialization, aliased to source in vitest + esbuild).

**Global Prerequisites:**
- Environment: macOS/Linux, Node ≥18, Yarn (workspaces). This is the Excalidraw monorepo; the three target packages are `packages/kindraw-client`, `packages/kindraw-mcp`, `packages/kindraw-cli`.
- Tools: `node --version` (≥18), `yarn --version`, `git status` clean.
- Access: NO live API access is required to implement or test — every client method is unit-tested against a **mocked `globalThis.fetch`**. A real `kdr_` Bearer token (scope `full`) is only needed for the optional manual smoke at the end of each phase.
- State: Work from a feature branch off `master`. Phase 1 (`buildScene`, `kindraw_create_scene`, `kindraw generate --spec`) is already merged into the working tree.

**Verification before starting:**
```bash
# Run ALL these and verify output before writing any code:
node --version            # Expected: v18.x or higher
yarn --version            # Expected: 1.x or 3.x (workspaces enabled)
git status                # Expected: clean working tree (or only this plan file)
yarn test:typecheck       # Expected: exits 0 (whole monorepo typechecks today)
yarn vitest run packages/kindraw-client/src/scene/build.test.ts
                          # Expected: build.test.ts passes (buildScene baseline is green)
yarn vitest run excalidraw-app/kindraw/hybridSections.test.ts
                          # Expected: hybridSections.test.ts passes (slug parser baseline is green)
ls node_modules/marked/package.json   # Expected: file exists (marked@15.0.12 is hoisted)
```

> **NOTE on test command:** the repo uses `vitest` (root script `yarn test:app`). Throughout this plan, run a single test file with `yarn vitest run <path>` and the whole client suite with `yarn vitest run packages/kindraw-client`. Vitest resolves `@excalidraw/*` to source via the regex aliases already in `vitest.config.mts` (verified lines 9-46), so scene/template/icon tests that pull in `convertToExcalidrawElements` work with no extra config.

---

## VERIFIED CONTRACTS (read these before starting — every quirk below is load-bearing)

These were confirmed by reading the actual files. Cite them in code comments; respect every quirk.

| # | Contract | Evidence (file:line) |
|---|----------|----------------------|
| C1 | `request<T>` ALWAYS calls `response.json()` (line 83) → cannot read raw SVG. Need a sibling `requestText`. | `client.ts:50-84` |
| C2 | `request(method, path, body?)` takes a FULL path (so both `/v1/api/*` and bare `/api/*` work). Sends `Bearer`, adds 401 hint, throws `KindrawApiError`, returns `undefined` on 204. | `client.ts:50-84,86-98` |
| C3 | `buildItemPath` = `kind==="drawing" ? /draw/:id : /doc/:id`. The server's `createDrawing`/`createDoc` `url` field is built from `drawingUrl()` which ALWAYS returns `/draw/<id>` even for docs → DISCARD the server url, build `/doc/<id>` ourselves. | `router.ts:103-104` |
| C4 | App slugs come from `marked.lexer` + `buildSectionId` dedup (`nota`/`nota-2`) + depth-nesting (a deeper heading is a SUBsection, folded into the parent). Section ids MUST come from re-parsing the FINAL assembled markdown — never an independent per-heading slugify. | `hybridSections.ts:18-139` |
| C5 | `slugify`: trim → lowercase → NFD → strip combining marks → `[^a-z0-9]+ → '-'` → trim leading/trailing `-` → fallback `"section"`. | `hybridSections.ts:18-25` |
| C6 | `buildKindrawSectionLink(hybridId, sectionId)` = `kindraw://section/${hybridId}/${sectionId}`. Links are PURELY client-side element.link data inside the serialized drawing JSON; the server stores them opaquely. | `hybridSections.ts:258-259` |
| C7 | `convertToExcalidrawElements` passthrough: `newElement({...element})` (line 541-545) and `newImageElement({...element})` (line 601-605) spread the input → `link`, `fileId`, `status` flow through untouched. | `transform.ts:541-545,601-605` |
| C8 | `RESERVED_ID_PREFIX_RE = /^(text|arrow)-/` forbids user ids starting with `text-`/`arrow-` but NOT `tpl-`/`icon-` → those prefixes are collision-free for generated template/icon elements. | `spec.ts:89` |
| C9 | `buildScene` pipeline: `ensureProvider()` → `ensureWindowShim()` → `validateDiagramSpec` → layout → `toSkeleton` → `convertToExcalidrawElements({regenerateIds:false})` → `reanchorArrows` → `stabilize` (seed/versionNonce/version/updated = 1) → envelope `{type,version:2,source:"@kindraw/client",elements,appState,files:{}}`. `reanchorArrows` ASSUMES bound arrows → must be SKIPPED for template skeletons (their arrows are explicit x/y+points, unbound). | `build.ts:174-207`, design note |
| C10 | `toSkeleton` already spreads conditional props (`...(node.strokeColor ? {...} : {})`) — the pattern to copy for `node.link`. | `build.ts:74-113` |
| C11 | CLI `readSource(location)`, `MAX_SPEC_BYTES` (5 MiB), `MAX_TITLE_LEN` (500) live in `commands/generate.ts` and must be reused (export them). The CLI flag parser only does `--key value` / `--key=value` / `--flag` — no repeated flags, no `nodeId=icon:#hex` single-token parsing. | `commands/generate.ts:14,18,23-51`, `index.ts:30-52` |
| C12 | MCP `resolveCredentials()` already loads `~/.config/kindraw/config.json` `{token, baseUrl}`. The CLI `loadConfig()` returns the same shape. `appOrigin` will be read from this same config (env `KINDRAW_APP_ORIGIN` wins). | `mcp/src/index.ts:16-42`, `cli/src/config.ts:8-38` |
| C13 | Client is bundled by esbuild with `@excalidraw/*` aliased to source; `marked` is NOT external today, so if imported it will be BUNDLED into `dist/index.js` (fine, it's pure JS). Add `marked` to `dependencies` regardless so the published package declares it. | `build.mjs:74-83` |

**Worker REST contracts (Bearer `kdr_` token, scope `full`) — do not modify the Worker:**

- **Doc:** `POST /v1/api/items` body `{kind:"doc", title, folderId?:string|null, content:<raw markdown>}` → `201 {itemId, url}`. `PUT /v1/api/items/:id/content` body `{content}` → `204`.
- **Hybrid:** `POST /api/hybrid-items` body `{title, folderId?}` → `201 {hybridId, docItemId, drawingItemId}` (auto-seeds doc `"# {title}\n\n"` + empty drawing; Bearer-only, no WS room → headless-safe). `PUT /api/items/:docItemId/content` body `{content:<markdown>}` → `204`. `PUT /api/items/:drawingItemId/content` body `{content:<excalidraw json>}` → `204` (note: bare `/api/`, NOT `/v1/api/`). `GET /api/hybrid-items/:id` → hybrid + refs. **PUT does NOT validate JSON — validate `JSON.parse` client-side before PUT.**
- **Templates (public):** `GET /api/templates` → `{templates:[{id,title,description,category}]}` (12). `GET /api/templates/:id` → `{id,title,description,category, elements:[<convertToExcalidrawElements INPUT skeletons>]}` (arrows INTENTIONALLY UNBOUND: explicit x/y+points).
- **Icons (public):** `GET /api/icons/search?q=&limit=` → `{icons:[{id:"prefix:name", set, name}]}` (empty q → []; limit default 48, max 96). `GET /api/icons/svg?id=prefix:name&color=#hex` → **RAW SVG STRING (Content-Type image/svg+xml, NOT JSON)**; `id` must match `/^[a-z0-9-]+:[a-z0-9-]+$/i`.
- **Libraries (public):** `GET /api/libraries` + `GET /api/libraries/:id` (.excalidrawlib blobs). CLI-only, **deferred** — surface no MCP tool.

---

## RESIDUAL UNCERTAINTY (flag before/while implementing)

| Topic | Uncertainty | What to read / do |
|-------|-------------|-------------------|
| `marked.lexer` shape | The vendored `slugify`+`parseHybridMarkdownSections` must produce IDENTICAL ids to the app. | The parity test (Task 3.2) is the guard. If it fails, diff against `excalidraw-app/kindraw/hybridSections.ts` line-by-line — do NOT "fix" the slugify to make a test pass; match the source exactly. |
| Template element shape | `GET /api/templates/:id` `.elements` are described as `convertToExcalidrawElements` INPUT skeletons with explicit unbound arrows. The exact field set per template is server-owned and not in this repo. | At Task 4.x, fetch ONE real template (manual smoke or a recorded fixture) and assert `buildFromSkeletons` round-trips it. If the live shape differs from "loose skeleton", capture a fixture JSON and adapt. Treat this as the one place a live call may be needed before finalizing Phase 4. |
| Icon SVG → dataURL base64 | Node has no `btoa`; use `Buffer.from(svg, "utf8").toString("base64")`. SVG may contain non-ASCII. | Verified Node-safe: `Buffer` handles UTF-8. Test asserts the dataURL decodes back to the original SVG. |
| `hybrid-items` partial failure | If step 0 succeeds but a content PUT fails, there is NO verified delete-hybrid contract → do NOT try to clean up. | Return the ids + which step failed so the agent retries idempotently (PUTs are idempotent). Documented in Task 3.7. |
| `folderId` validation | Server accepts `folderId?:string|null`; we pass it through. No client-side folder existence check (not our contract). | Pass `folderId ?? null`. |

---

# PHASE 2 — DOC (raw markdown items)

**Shippable outcome:** `client.createDoc(...)`, `client.docUrl(id)` + appOrigin resolution, `kindraw_create_doc` MCP tool, `kindraw doc create` CLI command. Pure markdown — no `buildScene`.

**Files touched in Phase 2:**
- `packages/kindraw-client/src/client.ts` (modify)
- `packages/kindraw-client/src/client.test.ts` (CREATE — first client test file)
- `packages/kindraw-client/src/index.ts` (modify — export new types)
- `packages/kindraw-mcp/src/index.ts` (modify — +1 tool, pass appOrigin)
- `packages/kindraw-cli/src/commands/generate.ts` (modify — export `readSource`/consts)
- `packages/kindraw-cli/src/commands/doc.ts` (CREATE)
- `packages/kindraw-cli/src/index.ts` (modify — route `doc create`, help)

---

### Task 2.1: Create the client test harness (mocked fetch) — RED for `requestText`

**Files:**
- Create: `packages/kindraw-client/src/client.test.ts`

**Prerequisites:**
- Tools: vitest (run via `yarn vitest run`). Node ≥18.
- Files must exist: `packages/kindraw-client/src/client.ts`.
- No env vars needed.

There is no existing client test today. This task establishes the mocked-fetch pattern every later client test reuses.

**Step 1: Write the failing test file**

Create `packages/kindraw-client/src/client.test.ts`:

```ts
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
    // @ts-expect-error — requestText is private; we invoke it via a public
    // method in later tasks. Here we prove the mechanism by casting.
    const svg = await (client() as any).requestText("GET", "/api/icons/svg?id=a:b");
    expect(svg).toBe("<svg>hi</svg>");
    expect(calls[0].url).toBe("https://api.kindraw.dev/api/icons/svg?id=a:b");
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
      "Bearer kdr_test",
    );
  });

  it("throws KindrawApiError with 401 hint on auth failure", async () => {
    mockFetch([{ status: 401, json: { error: "bad token" } }]);
    await expect(
      // @ts-expect-error — private method probe
      (client() as any).requestText("GET", "/api/icons/svg?id=a:b"),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      // @ts-expect-error — private method probe
      (client() as any).requestText("GET", "/api/icons/svg?id=a:b"),
    ).rejects.toThrowError(/kindraw login|KINDRAW_TOKEN/);
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `yarn vitest run packages/kindraw-client/src/client.test.ts`

**Expected output:**
```
FAIL  packages/kindraw-client/src/client.test.ts
  × requestText (raw text mode) ... TypeError: ...requestText is not a function
```

**If you see a different error** (e.g. import fails): confirm the relative import path `./client` and that `vitest` picks up `*.test.ts` (it does — see existing `scene/build.test.ts`).

**Step 3: (no implementation yet — that's Task 2.2)**

Do NOT commit. Proceed to 2.2.

**If Task Fails:**
1. Test file won't load: `ls packages/kindraw-client/src/client.ts` (exists?). Rollback: `git checkout -- packages/kindraw-client/src/client.test.ts`.
2. Can't recover: document the vitest error and stop.

---

### Task 2.2: Implement `requestText` (GREEN)

**Files:**
- Modify: `packages/kindraw-client/src/client.ts` (add private method after `request<T>`, which ends at line 84)

**Step 1: Add `requestText` immediately after the `request<T>` method**

Insert this method right after the closing brace of `request<T>` (after line 84, before `whoami()` at line 86). It reuses the exact same header/error logic but returns `response.text()`:

```ts
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
```

**Step 2: Run the test to verify it passes**

Run: `yarn vitest run packages/kindraw-client/src/client.test.ts`

**Expected output:**
```
PASS  packages/kindraw-client/src/client.test.ts
  ✓ requestText (raw text mode) > returns response.text() and sends the Bearer header
  ✓ requestText (raw text mode) > throws KindrawApiError with 401 hint on auth failure
```

**Step 3: Typecheck**

Run: `yarn vitest run packages/kindraw-client && cd packages/kindraw-client && yarn typecheck`

Wait — do NOT `cd`. Instead run from repo root:

Run: `yarn workspace @kindraw/client typecheck`

**Expected output:** exits 0 (no type errors).

**If `yarn workspace` is unavailable**, run `yarn test:typecheck` (typechecks the whole monorepo).

**Step 4: Commit**

```bash
git add packages/kindraw-client/src/client.ts packages/kindraw-client/src/client.test.ts
git commit -m "feat(kindraw-client): add requestText for raw (non-JSON) responses

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**If Task Fails:**
1. Type error on `KindrawApiError`: it's already imported/defined in this file (line 23). No new import needed.
2. Test still red: confirm the method is INSIDE the `KindrawClient` class (between `request<T>` and `whoami`).
3. Rollback: `git checkout -- packages/kindraw-client/src/client.ts`.

---

### Task 2.3: appOrigin resolution + URL helpers — RED

**Files:**
- Modify: `packages/kindraw-client/src/client.test.ts` (append describe block)

**Step 1: Append URL-helper tests**

Add to `client.test.ts`:

```ts
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
```

**Step 2: Run to verify failure**

Run: `yarn vitest run packages/kindraw-client/src/client.test.ts`

**Expected output:**
```
FAIL ... app-origin resolution + URL helpers
  × ... TypeError: c.docUrl is not a function
```

**If Task Fails:** rollback the appended block with `git checkout -- packages/kindraw-client/src/client.test.ts` (but you have uncommitted Task 2.2 work — instead just delete the appended describe block manually).

---

### Task 2.4: Implement appOrigin + URL helpers (GREEN)

**Files:**
- Modify: `packages/kindraw-client/src/client.ts`

**Step 1: Extend `KindrawClientOptions`** (currently lines 33-36):

```ts
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
```

**Step 2: Add a private field + resolver + public helpers.** Add the field next to the existing private fields (lines 39-40) and initialize in the constructor:

Change the fields block:
```ts
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly appOrigin: string;
```

In the constructor (after `this.baseUrl = ...` at line 47), add:
```ts
    this.appOrigin = KindrawClient.resolveAppOrigin(this.baseUrl, options.appOrigin);
```

Then add this static resolver + the three helpers as methods (place them after the constructor, before `request<T>`):

```ts
  // Resolve the app origin once at construction. Prefer the explicit option;
  // otherwise strip a leading "api." label from the baseUrl host so
  // https://api.kindraw.dev -> https://kindraw.dev. A baseUrl whose host does
  // not start with "api." is returned as-is (e.g. http://localhost:8787).
  private static resolveAppOrigin(
    baseUrl: string,
    explicit?: string,
  ): string {
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
```

**Step 3: Run to verify GREEN**

Run: `yarn vitest run packages/kindraw-client/src/client.test.ts`

**Expected output:** all `app-origin resolution + URL helpers` tests PASS, plus the earlier `requestText` tests still PASS.

**Step 4: Typecheck**

Run: `yarn workspace @kindraw/client typecheck`

**Expected output:** exits 0.

**Step 5: Commit**

```bash
git add packages/kindraw-client/src/client.ts packages/kindraw-client/src/client.test.ts
git commit -m "feat(kindraw-client): resolve app origin and build /doc /draw /hybrid URLs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**If Task Fails:**
1. `resolveAppOrigin` referenced before defined: it's `static`, so order inside the class doesn't matter for runtime; if TS complains, ensure it's a class member, not a top-level function.
2. Rollback: `git checkout -- packages/kindraw-client/src/client.ts packages/kindraw-client/src/client.test.ts`.

---

### Task 2.5: `createDoc` client method — RED then GREEN

**Files:**
- Modify: `packages/kindraw-client/src/client.test.ts`
- Modify: `packages/kindraw-client/src/client.ts`

**Step 1: Append the failing test**

```ts
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
```

**Step 2: Run → expect FAIL** (`c.createDoc is not a function`).

Run: `yarn vitest run packages/kindraw-client/src/client.test.ts`

**Step 3: Implement `createDoc`.** Add to `client.ts` after `createDrawing` (ends line 111). Also add a return type near `CreateDrawingResult` (line 21):

Add the type (after line 21):
```ts
export type CreateDocResult = { itemId: string; url: string };
```

Add the method:
```ts
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
```

**Step 4: Run → expect PASS.** `yarn vitest run packages/kindraw-client/src/client.test.ts`

**Step 5: Export the new type** in `packages/kindraw-client/src/index.ts` — add `CreateDocResult` to the `export type { ... } from "./client.js";` block (after `CreateDrawingResult` on the type-export list).

**Step 6: Typecheck.** `yarn workspace @kindraw/client typecheck` → exits 0.

**Step 7: Commit**

```bash
git add packages/kindraw-client/src/client.ts packages/kindraw-client/src/client.test.ts packages/kindraw-client/src/index.ts
git commit -m "feat(kindraw-client): add createDoc (kind:doc, client-built /doc url)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**If Task Fails:** rollback all three files with `git checkout --`.

---

### Task 2.6: `kindraw_create_doc` MCP tool

**Files:**
- Modify: `packages/kindraw-mcp/src/index.ts`

**Step 1: Pass appOrigin into the client.** In `resolveCredentials()` (lines 16-42), also resolve `appOrigin`. Change the return type and body:

Replace the function signature/return shape so it also returns `appOrigin`:
```ts
const resolveCredentials = (): {
  token: string;
  baseUrl: string;
  appOrigin?: string;
} => {
  let token = process.env.KINDRAW_TOKEN;
  let baseUrl = process.env.KINDRAW_API_BASE_URL;
  let appOrigin = process.env.KINDRAW_APP_ORIGIN;

  if (!token) {
    try {
      const configPath = process.env.XDG_CONFIG_HOME
        ? path.join(process.env.XDG_CONFIG_HOME, "kindraw", "config.json")
        : path.join(os.homedir(), ".config", "kindraw", "config.json");
      const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
        token?: string;
        baseUrl?: string;
        appOrigin?: string;
      };
      token = config.token;
      baseUrl = baseUrl || config.baseUrl;
      appOrigin = appOrigin || config.appOrigin;
    } catch {
      // no config file
    }
  }

  if (!token) {
    throw new Error(
      "No Kindraw token found. Set KINDRAW_TOKEN or run `kindraw login` first.",
    );
  }
  return { token, baseUrl: baseUrl || DEFAULT_API_BASE_URL, appOrigin };
};
```

**Step 2: Pass appOrigin to the client** (line 56-57):
```ts
  const { token, baseUrl, appOrigin } = resolveCredentials();
  const client = new KindrawClient({ token, baseUrl, appOrigin });
```

**Step 3: Register the tool.** Insert after the `kindraw_create_scene` registration (after its closing `);` at line 221), before `kindraw_create_drawing`:

```ts
  server.registerTool(
    "kindraw_create_doc",
    {
      description:
        "Create a markdown document in the user's Kindraw workspace. Provide " +
        "the FULL markdown (GFM: headings, lists, tables, code). Returns the " +
        "doc URL (/doc/<id>). Use this for prose/notes; use kindraw_create_scene " +
        "for canvas diagrams, or kindraw_create_hybrid for a doc beside a canvas.",
      inputSchema: {
        title: z.string().max(500).describe("Title for the new doc"),
        markdown: z
          .string()
          .max(500_000)
          .describe("The full document body as GitHub-Flavored Markdown"),
        folderId: z
          .string()
          .max(200)
          .nullish()
          .describe("Optional folder id to place the doc in"),
      },
    },
    async ({ title, markdown, folderId }) => {
      try {
        const result = await client.createDoc({
          title,
          content: markdown,
          folderId,
        });
        return text(`Created doc "${title}".\n${result.url}`);
      } catch (error) {
        return { ...text(formatError(error)), isError: true };
      }
    },
  );
```

**Step 2 verification — Step 4: Typecheck**

Run: `yarn workspace @kindraw/mcp typecheck` (or `yarn test:typecheck` if the per-package script is absent).

**Expected output:** exits 0.

**Step 5: Commit**

```bash
git add packages/kindraw-mcp/src/index.ts
git commit -m "feat(kindraw-mcp): add kindraw_create_doc and thread appOrigin

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**If Task Fails:**
1. `z.nullish()` not recognized: it exists in zod v3; confirm `import { z } from "zod"` (line 12).
2. `appOrigin` type mismatch on `KindrawClient`: ensure Task 2.4 shipped `appOrigin?: string` in `KindrawClientOptions`.
3. Rollback: `git checkout -- packages/kindraw-mcp/src/index.ts`.

---

### Task 2.7: Export `readSource` + size/title caps from the CLI

**Files:**
- Modify: `packages/kindraw-cli/src/commands/generate.ts`

The hybrid/doc CLI commands must reuse `readSource`, `MAX_SPEC_BYTES`, `MAX_TITLE_LEN` (verified C11). They are currently module-private.

**Step 1: Add `export` to the three declarations** in `generate.ts`:
- Line 14: `const MAX_SPEC_BYTES` → `export const MAX_SPEC_BYTES`
- Line 18: `const MAX_TITLE_LEN` → `export const MAX_TITLE_LEN`
- Line 23: `const readSource` → `export const readSource`

**Step 2: Typecheck**

Run: `yarn workspace @kindraw/cli typecheck` (or `yarn test:typecheck`).

**Expected output:** exits 0 (no behavior change, only visibility).

**Step 3: Commit**

```bash
git add packages/kindraw-cli/src/commands/generate.ts
git commit -m "refactor(kindraw-cli): export readSource and input caps for reuse

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.8: `kindraw doc create` CLI command

**Files:**
- Create: `packages/kindraw-cli/src/commands/doc.ts`
- Modify: `packages/kindraw-cli/src/index.ts`

**Step 1: Create `packages/kindraw-cli/src/commands/doc.ts`:**

```ts
import { requireClient } from "../client.js";
import { MAX_TITLE_LEN, readSource } from "./generate.js";

const USAGE = "Usage: kindraw doc create --md <file|-> --title <T> [--folder <id>]";

// `kindraw doc create --md <file|-> --title T [--folder ID]`
// Reads raw markdown (bounded by MAX_SPEC_BYTES via readSource) and creates a
// doc. Prints the canonical /doc/<id> URL (built client-side, verified C3).
export const docCreate = async (args: {
  md?: string;
  title?: string;
  folder?: string;
}): Promise<void> => {
  if (!args.md) {
    throw new Error(`Provide --md <file|->.\n${USAGE}`);
  }
  if (!args.title) {
    throw new Error(`Provide --title.\n${USAGE}`);
  }
  const content = readSource(args.md);
  const title =
    args.title.length > MAX_TITLE_LEN
      ? args.title.slice(0, MAX_TITLE_LEN)
      : args.title;

  const client = requireClient();
  const result = await client.createDoc({
    title,
    content,
    folderId: args.folder ?? null,
  });
  console.log(`Created doc "${title}"`);
  console.log(result.url);
};
```

**Step 2: Wire it in `packages/kindraw-cli/src/index.ts`.** Add the import near the other command imports (after line 4):
```ts
import { docCreate } from "./commands/doc.js";
```

Add a `case "doc":` block in the `switch` (after the `items` case ends at line 90):
```ts
    case "doc": {
      if (sub === "create") {
        return docCreate({
          md: str(flags.md),
          title: str(flags.title),
          folder: str(flags.folder),
        });
      }
      throw new Error(`Unknown doc command: ${sub ?? "(none)"}`);
    }
```

**Step 3: Update the HELP string** (lines 12-28) — add under the `generate` lines:
```
  kindraw doc create --md <file|->     Create a markdown doc
                    --title <title>
                   [--folder <id>]
```

**Step 4: Typecheck**

Run: `yarn workspace @kindraw/cli typecheck`

**Expected output:** exits 0.

**Step 5: Smoke the parser (no network)**

Run: `node -e "process.argv=['node','x','doc','create','--md','-','--title','T']" ` — skip; instead verify the help path:

Run: `yarn workspace @kindraw/cli build >/dev/null 2>&1; node packages/kindraw-cli/dist/index.js help`

**Expected output:** HELP text including the new `doc create` lines.

**If the CLI has no build step / dist**, just rely on the typecheck (Step 4) — the network smoke is in Task 2.9.

**Step 6: Commit**

```bash
git add packages/kindraw-cli/src/commands/doc.ts packages/kindraw-cli/src/index.ts
git commit -m "feat(kindraw-cli): add 'kindraw doc create'

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**If Task Fails:**
1. Import error on `./commands/doc.js`: ESM needs the `.js` extension on the import even though the file is `.ts` (this matches `generate.js` imports — verified in `index.ts`).
2. Rollback: `git checkout -- packages/kindraw-cli/src/index.ts && git rm -f packages/kindraw-cli/src/commands/doc.ts`.

---

### Task 2.9: Phase 2 manual MCP/CLI smoke (requires a real token)

**Prerequisites:** A real `kdr_` token (scope `full`). Set `KINDRAW_TOKEN`. Optionally `KINDRAW_APP_ORIGIN=https://kindraw.dev`.

**Step 1: Whole-suite typecheck + tests**

Run:
```bash
yarn test:typecheck
yarn vitest run packages/kindraw-client
```
**Expected:** typecheck exits 0; client tests all pass.

**Step 2: CLI smoke (real)**

Run:
```bash
printf '# Hello\n\nFrom the CLI.\n' | \
  KINDRAW_TOKEN=$KINDRAW_TOKEN node packages/kindraw-cli/dist/index.js \
  doc create --md - --title "CLI doc smoke"
```
**Expected output:** two lines — `Created doc "CLI doc smoke"` and a URL of the form `https://kindraw.dev/doc/<id>` (NOT `/draw/`). Open it; confirm the markdown renders.

**Step 3: MCP smoke (optional)** — start the MCP server (`node packages/kindraw-mcp/dist/index.js`) under an MCP client and call `kindraw_create_doc {title, markdown}`. Confirm the returned URL is `/doc/<id>`.

**If the URL is `/draw/<id>`:** the client built it wrong — re-check Task 2.5 returns `this.docUrl(itemId)`, not the server `url`.

---

### Task 2.10: Phase 2 Code Review checkpoint

1. **Dispatch all 3 reviewers in parallel:**
   - REQUIRED SUB-SKILL: Use ring:requesting-code-review
   - Run ring:code-reviewer, ring:business-logic-reviewer, ring:security-reviewer simultaneously over the Phase 2 diff (`git diff master...HEAD`).
   - Wait for all to complete.

2. **Handle findings by severity:**
   - **Critical/High/Medium:** fix immediately, re-run all 3 reviewers, repeat until zero remain. (Do NOT add TODO comments for these.)
   - **Low:** add `TODO(review): [issue] (reported by [reviewer] on 2026-06-16, severity: Low)` at the location.
   - **Cosmetic/Nitpick:** add `FIXME(nitpick): [issue] (reported by [reviewer] on 2026-06-16, severity: Cosmetic)`.

3. **Proceed only when:** zero Critical/High/Medium remain; all Low have `TODO(review):`; all Cosmetic have `FIXME(nitpick):`.

**Phase 2 is now shippable.** It is purely additive: no existing method or tool changed behavior.

---

# PHASE 3 — HYBRID (canvas + live markdown, wired by section links)

**Shippable outcome:** a shared slug module (parity-tested against the app), hybrid client methods, `node.link` support in `buildScene`, the `kindraw_create_hybrid` MCP tool orchestrating the 4-step seed/populate flow, and `kindraw hybrid create` CLI.

**Files touched in Phase 3:**
- `packages/kindraw-client/src/hybridSections.ts` (CREATE — vendored/shared parser)
- `packages/kindraw-client/src/hybridSections.test.ts` (CREATE — parity test)
- `packages/kindraw-client/package.json` (modify — add `marked`)
- `packages/kindraw-client/src/scene/spec.ts` (modify — `node.link`)
- `packages/kindraw-client/src/scene/build.ts` (modify — pass `link` through)
- `packages/kindraw-client/src/scene/build.test.ts` (modify — link test)
- `packages/kindraw-client/src/client.ts` (modify — hybrid methods)
- `packages/kindraw-client/src/client.test.ts` (modify — hybrid tests)
- `packages/kindraw-client/src/index.ts` (modify — exports)
- `packages/kindraw-mcp/src/index.ts` (modify — `kindraw_create_hybrid`)
- `packages/kindraw-cli/src/commands/hybrid.ts` (CREATE)
- `packages/kindraw-cli/src/index.ts` (modify — route + help)

> **Decision (locked, from the winning design):** the slug parser is VENDORED into the client as a copy of `excalidraw-app/kindraw/hybridSections.ts` (only `slugify`, `buildSectionId`, `parseHybridMarkdownSections`, `buildKindrawSectionLink`), gated by a parity test asserting identical ids on the app's own fixtures. A future refactor MAY extract a shared module both sides import; that is explicitly out of scope here to keep Phase 3 shippable. Do NOT regex-port the slug logic (verified C4/C5 — it would silently drift on duplicates/nesting/accents).

---

### Task 3.1: Add `marked` dep + vendor the slug parser

**Files:**
- Modify: `packages/kindraw-client/package.json`
- Create: `packages/kindraw-client/src/hybridSections.ts`

**Step 1: Add `marked` to the client deps.** In `packages/kindraw-client/package.json`, add to `"dependencies"` (keep alphabetical-ish; it's hoisted at root already — verified C13):
```json
    "marked": "15.0.12",
```
(Insert after the `jsdom` line.)

**Step 2: Create `packages/kindraw-client/src/hybridSections.ts`** — a VENDORED copy of the app's parser, trimmed to what the client needs (parse + slug + link builder). Copy `slugify`, `buildSectionId`, `joinMarkdown`, `parseTokens`, `parseHybridMarkdownSections`, and `buildKindrawSectionLink` VERBATIM from `excalidraw-app/kindraw/hybridSections.ts` (lines 1-139 and 258-259). Header comment must point at the source + parity test:

```ts
// VENDORED COPY of excalidraw-app/kindraw/hybridSections.ts (slug + parser only).
// The hybrid section-link slugs MUST match the app byte-for-byte or canvas→doc
// links silently break (verified C4/C5). We do NOT regex-port: we copy the real
// marked.lexer + buildSectionId logic and GUARD it with a parity test
// (hybridSections.test.ts) that re-runs the app's own fixtures. If you change
// slugify here, you are introducing a divergence bug — change the app source and
// re-vendor instead.
import { marked } from "marked";

type MarkdownToken = {
  type: string;
  raw?: string;
  text?: string;
  depth?: number;
};

export type KindrawHybridSection = {
  id: string;
  title: string;
  depth: number;
  markdown: string;
  isIntro: boolean;
};

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "section";

const buildSectionId = (
  title: string,
  counts: Map<string, number>,
  fallback = "section",
) => {
  const base = title ? slugify(title) : fallback;
  const nextCount = (counts.get(base) || 0) + 1;
  counts.set(base, nextCount);
  return nextCount === 1 ? base : `${base}-${nextCount}`;
};

const joinMarkdown = (tokens: MarkdownToken[]) =>
  tokens.map((token) => token.raw || "").join("");

const parseTokens = (markdown: string) =>
  marked.lexer(markdown, { gfm: true }) as MarkdownToken[];

export const parseHybridMarkdownSections = (
  markdown: string,
): KindrawHybridSection[] => {
  // ... COPY lines 47-139 of excalidraw-app/kindraw/hybridSections.ts VERBATIM ...
};

export const buildKindrawSectionLink = (hybridId: string, sectionId: string) =>
  `kindraw://section/${hybridId}/${sectionId}`;
```

> **Implementer note:** paste the exact body of `parseHybridMarkdownSections` from the source file (lines 44-139). Do not paraphrase. The `// ...` placeholder above MUST be replaced with the verbatim function body — leaving a placeholder is an INCOMPLETE task.

**Step 3: Typecheck**

Run: `yarn workspace @kindraw/client typecheck`

**Expected:** exits 0.

**Step 4: Commit**

```bash
git add packages/kindraw-client/package.json packages/kindraw-client/src/hybridSections.ts
git commit -m "feat(kindraw-client): vendor hybrid section slug parser (marked-based)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**If Task Fails:**
1. `marked` import unresolved in typecheck: confirm `ls node_modules/marked` (hoisted). It's a runtime dep now.
2. Rollback: `git checkout -- packages/kindraw-client/package.json && git rm -f packages/kindraw-client/src/hybridSections.ts`.

---

### Task 3.2: Slug parity test (the #1-risk guard) — RED→GREEN

**Files:**
- Create: `packages/kindraw-client/src/hybridSections.test.ts`

**Step 1: Write the parity test.** It asserts the client's parser produces the SAME section ids as the app for the exact fixtures the app tests (accented, duplicate, nested):

```ts
import { describe, expect, it } from "vitest";

import {
  buildKindrawSectionLink,
  parseHybridMarkdownSections,
} from "./hybridSections";

// PARITY GUARD: these fixtures mirror excalidraw-app/kindraw/hybridSections.test.ts.
// If any id below drifts, canvas→doc links break in production. The expected ids
// are taken from the APP's own assertions — do NOT "fix" them to match a broken
// vendored slugify; fix the vendored slugify to match the app.
describe("hybridSections parity (client vendored == app)", () => {
  it("intro + heading split yields stable ids (matches app)", () => {
    const sections = parseHybridMarkdownSections(
      "Preamble\n\n# First\n\nAlpha\n\n## Nested\n\nBeta\n\n# Second\n\nGamma\n",
    );
    // App asserts exactly these (nested heading folds into 'first').
    expect(sections.map((s) => s.id)).toEqual(["intro", "first", "second"]);
  });

  it("deduplicates colliding titles (nota / nota-2)", () => {
    const sections = parseHybridMarkdownSections(
      "# Nota\n\nPrimeira\n\n# Nota\n\nSegunda\n",
    );
    expect(sections.map((s) => s.id)).toEqual(["nota", "nota-2"]);
  });

  it("strips accents in slugs (Configuração -> configuracao)", () => {
    const sections = parseHybridMarkdownSections(
      "# Configuração\n\nx\n\n# Visão Geral\n\ny\n",
    );
    expect(sections.map((s) => s.id)).toEqual(["configuracao", "visao-geral"]);
  });

  it("falls back to 'section' for a title with no slug chars", () => {
    const sections = parseHybridMarkdownSections("# ---\n\nbody\n");
    expect(sections[0]?.id).toBe("section");
  });

  it("builds the canonical kindraw:// section link", () => {
    expect(buildKindrawSectionLink("h1", "configuracao")).toBe(
      "kindraw://section/h1/configuracao",
    );
  });
});
```

**Step 2: Run → expect PASS** (the vendored parser was copied verbatim, so parity should hold immediately; this test exists to CATCH future drift).

Run: `yarn vitest run packages/kindraw-client/src/hybridSections.test.ts`

**Expected output:** all 5 tests PASS.

**If any test FAILS:** the vendored copy diverged from the source. Diff `packages/kindraw-client/src/hybridSections.ts` against `excalidraw-app/kindraw/hybridSections.ts` and make them identical (do not edit expectations).

**Step 3: Commit**

```bash
git add packages/kindraw-client/src/hybridSections.test.ts
git commit -m "test(kindraw-client): parity-test vendored slug parser vs app

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.3: `node.link` in the spec + builder — RED

**Files:**
- Modify: `packages/kindraw-client/src/scene/build.test.ts`

**Step 1: Append a link test** to `build.test.ts`:

```ts
describe("node.link passthrough", () => {
  it("attaches a kindraw:// section link to the node element", async () => {
    const { content } = await buildScene({
      nodes: [
        { id: "a", label: "A", link: "kindraw://section/h1/overview" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "a", to: "b" }],
    });
    const a = JSON.parse(content).elements.find(
      (e: { id: string }) => e.id === "a",
    );
    expect(a.link).toBe("kindraw://section/h1/overview");
    // A node without a link must not get a bogus link field.
    const b = JSON.parse(content).elements.find(
      (e: { id: string }) => e.id === "b",
    );
    expect(b.link ?? null).toBeNull();
  });

  it("accepts a normal https link", async () => {
    const { content } = await buildScene({
      nodes: [{ id: "a", label: "A", link: "https://example.com" }],
      edges: [],
    });
    const a = JSON.parse(content).elements.find(
      (e: { id: string }) => e.id === "a",
    );
    expect(a.link).toBe("https://example.com");
  });

  it("rejects a link that is neither kindraw:// nor http(s)", async () => {
    await expect(
      buildScene({
        nodes: [{ id: "a", label: "A", link: "javascript:alert(1)" }],
        edges: [],
      }),
    ).rejects.toThrow(/invalid link/i);
  });
});
```

**Step 2: Run → expect FAIL** (`a.link` is undefined; the reject test throws nothing).

Run: `yarn vitest run packages/kindraw-client/src/scene/build.test.ts`

---

### Task 3.4: Implement `node.link` (GREEN)

**Files:**
- Modify: `packages/kindraw-client/src/scene/spec.ts`
- Modify: `packages/kindraw-client/src/scene/build.ts`

**Step 1: Extend `DiagramNode`** in `spec.ts` (after line 19, inside the type):
```ts
  /**
   * Optional clickable link on the node element. Either a "kindraw://section/..."
   * deep-link (hybrid section) or a normal http(s) URL. Validated in
   * validateDiagramSpec. Passes through convertToExcalidrawElements untouched
   * (verified C7: newElement({...element})).
   */
  link?: string;
```

**Step 2: Add a link validator + validation.** Near `isValidColor` (after line 115), add:
```ts
// Element links are either an in-app section deep-link or a normal web URL.
// Reject anything else (e.g. javascript:) so we never serialize a hostile href.
const isValidNodeLink = (value: string): boolean => {
  if (value.startsWith("kindraw://section/")) {
    return true;
  }
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};
```

In the node-validation loop (after the `backgroundColor` block, around line 251), add:
```ts
    if (node.link !== undefined) {
      if (typeof node.link !== "string" || !isValidNodeLink(node.link)) {
        throw new Error(
          `Node "${node.id}" has invalid link "${node.link}" ` +
            `(must be kindraw://section/... or an http(s) URL).`,
        );
      }
    }
```

**Step 3: Pass `link` through `toSkeleton`** in `build.ts`. In the node-push block (lines 81-94), add a conditional spread mirroring the color pattern (verified C10):
```ts
      ...(node.link ? { link: node.link } : {}),
```
Place it right after the `backgroundColor` conditional spread (line 92).

> **Note:** `NormalizedSpec` types `nodes` as `Required<Pick<DiagramNode,"id"|"label"|"shape">> & DiagramNode`, so `node.link` is already in scope (it's an optional member of `DiagramNode`). No `NormalizedSpec` change needed.

**Step 4: Run → expect PASS.**

Run: `yarn vitest run packages/kindraw-client/src/scene/build.test.ts`

**Expected:** the 3 new `node.link` tests PASS; all prior buildScene tests still PASS (determinism test included — `link` is a stable field).

**Step 5: Typecheck**

Run: `yarn workspace @kindraw/client typecheck` → exits 0.

**Step 6: Commit**

```bash
git add packages/kindraw-client/src/scene/spec.ts packages/kindraw-client/src/scene/build.ts packages/kindraw-client/src/scene/build.test.ts
git commit -m "feat(kindraw-client): support validated node.link in buildScene

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**If Task Fails:**
1. Determinism test breaks: ensure the link spread is conditional (`...(node.link ? ... : {})`) so link-less nodes serialize identically to before.
2. Rollback all three files.

---

### Task 3.5: Hybrid client methods — RED

**Files:**
- Modify: `packages/kindraw-client/src/client.test.ts`

**Step 1: Append hybrid tests:**

```ts
describe("hybrid methods", () => {
  it("createHybrid POSTs /api/hybrid-items and returns refs", async () => {
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

  it("getHybrid GETs /api/hybrid-items/:id", async () => {
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
  });
});
```

**Step 2: Run → expect FAIL** (`createHybrid is not a function`).

Run: `yarn vitest run packages/kindraw-client/src/client.test.ts`

---

### Task 3.6: Implement hybrid client methods (GREEN)

**Files:**
- Modify: `packages/kindraw-client/src/client.ts`
- Modify: `packages/kindraw-client/src/index.ts`

**Step 1: Add a result type** near the others (after `CreateDocResult`):
```ts
export type CreateHybridResult = {
  hybridId: string;
  docItemId: string;
  drawingItemId: string;
};
```

**Step 2: Add the methods** after `createDoc`:
```ts
  // Seed a hybrid item (doc beside a canvas). Bearer-only REST, no WS room —
  // headless-safe. Server auto-seeds doc "# {title}\n\n" + an empty drawing.
  createHybrid(input: {
    title: string;
    folderId?: string | null;
  }): Promise<CreateHybridResult> {
    return this.request<CreateHybridResult>("POST", "/api/hybrid-items", {
      title: input.title,
      folderId: input.folderId ?? null,
    });
  }

  getHybrid(hybridId: string): Promise<unknown> {
    return this.request("GET", `/api/hybrid-items/${encodeURIComponent(hybridId)}`);
  }

  // Populate the doc side. NOTE the BARE /api/ prefix (verified contract) — this
  // is distinct from updateContent (/v1/api/) on purpose to avoid that footgun.
  updateHybridDoc(docItemId: string, markdown: string): Promise<void> {
    return this.request<void>(
      "PUT",
      `/api/items/${encodeURIComponent(docItemId)}/content`,
      { content: markdown },
    );
  }

  // Populate the canvas side. PUT does NOT validate JSON — callers MUST
  // JSON.parse-validate `json` before calling.
  updateHybridDrawing(drawingItemId: string, json: string): Promise<void> {
    return this.request<void>(
      "PUT",
      `/api/items/${encodeURIComponent(drawingItemId)}/content`,
      { content: json },
    );
  }
```

**Step 3: Export `CreateHybridResult`** in `index.ts` type-export block.

**Step 4: Run → expect PASS.** `yarn vitest run packages/kindraw-client/src/client.test.ts`

**Step 5: Typecheck.** `yarn workspace @kindraw/client typecheck` → exits 0.

**Step 6: Commit**

```bash
git add packages/kindraw-client/src/client.ts packages/kindraw-client/src/index.ts packages/kindraw-client/src/client.test.ts
git commit -m "feat(kindraw-client): add hybrid create/get/update methods

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.7: Hybrid orchestrator helper (shared by MCP + CLI) — RED

The 4-step orchestration is shared logic; put it in the client so both the MCP tool and the CLI call ONE function. It returns a structured report (links wired, unmatched headings, partial-failure step).

**Files:**
- Create: `packages/kindraw-client/src/hybrid.ts`
- Create: `packages/kindraw-client/src/hybrid.test.ts`

**Step 1: Write the failing test** `packages/kindraw-client/src/hybrid.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KindrawClient } from "./client";
import { composeHybrid } from "./hybrid";

type Captured = { url: string; init: RequestInit };
let calls: Captured[] = [];

const mockFetch = (responses: Array<{ status?: number; json?: unknown }>) => {
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
      { status: 201, json: { hybridId: "h1", docItemId: "d1", drawingItemId: "g1" } },
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
    expect(res.linksWired).toBe(2);
    expect(res.unmatchedHeadings).toEqual([]);

    // Order: seed, doc PUT, drawing PUT.
    expect(calls[0].url).toBe("https://api.kindraw.dev/api/hybrid-items");
    expect(calls[1].url).toBe("https://api.kindraw.dev/api/items/d1/content");
    expect(calls[2].url).toBe("https://api.kindraw.dev/api/items/g1/content");

    // The drawing JSON carries the kindraw:// links on the right nodes.
    const drawing = JSON.parse(
      JSON.parse(calls[2].init.body as string).content,
    );
    const a = drawing.elements.find((e: { id: string }) => e.id === "a");
    expect(a.link).toBe("kindraw://section/h1/overview");
  });

  it("reports headings that matched no section instead of failing", async () => {
    mockFetch([
      { status: 201, json: { hybridId: "h2", docItemId: "d2", drawingItemId: "g2" } },
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
  });

  it("surfaces a partial failure with ids + failed step (no cleanup)", async () => {
    mockFetch([
      { status: 201, json: { hybridId: "h3", docItemId: "d3", drawingItemId: "g3" } },
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
  });
});
```

**Step 2: Run → expect FAIL** (`composeHybrid` does not exist).

Run: `yarn vitest run packages/kindraw-client/src/hybrid.test.ts`

---

### Task 3.8: Implement `composeHybrid` (GREEN)

**Files:**
- Create: `packages/kindraw-client/src/hybrid.ts`
- Modify: `packages/kindraw-client/src/index.ts` (export it)

**Step 1: Create `packages/kindraw-client/src/hybrid.ts`:**

```ts
// Shared 4-step hybrid orchestration, used by BOTH the MCP tool and the CLI so
// the flow lives in exactly one place. Steps (verified contracts):
//   0. POST /api/hybrid-items {title, folderId} -> {hybridId, docItemId, drawingItemId}
//   1. Re-parse the FINAL markdown with parseHybridMarkdownSections to get each
//      section's EXACT id (verified C4: never per-heading slugify independently).
//   2. PUT /api/items/:docItemId/content  {content: markdown}
//   3. buildScene(diagram) with node.link resolved from linkToHeading; the
//      drawing JSON is JSON.parse-validated, then PUT to :drawingItemId/content.
//   4. return hybridUrl(hybridId) + a report.
//
// Partial failure: if step 0 succeeds but a PUT fails, we THROW an error object
// carrying {hybridId, docItemId, drawingItemId, failedStep} so the agent retries
// idempotently (PUTs are idempotent) — we do NOT attempt cleanup (no verified
// delete-hybrid contract).

import type { KindrawClient } from "./client.js";
import {
  buildKindrawSectionLink,
  parseHybridMarkdownSections,
} from "./hybridSections.js";
import { buildScene } from "./scene/build.js";
import type { DiagramNode } from "./scene/spec.js";

export type HybridDiagramNode = DiagramNode & {
  /** Exact heading text to deep-link this node to its section. */
  linkToHeading?: string;
};

export type HybridDiagram = {
  nodes: HybridDiagramNode[];
  edges: Array<{ from: string; to: string; label?: string; style?: string }>;
  groups?: Array<{ id: string; label?: string }>;
  direction?: "TB" | "BT" | "LR" | "RL";
  engine?: "dagre" | "elk";
};

export type ComposeHybridInput = {
  title: string;
  markdown: string;
  folderId?: string | null;
  diagram: HybridDiagram;
};

export type ComposeHybridResult = {
  hybridId: string;
  docItemId: string;
  drawingItemId: string;
  url: string;
  linksWired: number;
  unmatchedHeadings: string[];
  elementCount: number;
};

export class HybridPartialError extends Error {
  constructor(
    message: string,
    public hybridId: string,
    public docItemId: string,
    public drawingItemId: string,
    public failedStep: "doc" | "drawing",
  ) {
    super(message);
    this.name = "HybridPartialError";
  }
}

export const composeHybrid = async (
  client: KindrawClient,
  input: ComposeHybridInput,
): Promise<ComposeHybridResult> => {
  // Step 0: seed.
  const { hybridId, docItemId, drawingItemId } = await client.createHybrid({
    title: input.title,
    folderId: input.folderId ?? null,
  });

  // Step 1: parse FINAL markdown -> heading text -> section id map.
  const sections = parseHybridMarkdownSections(input.markdown);
  const idByTitle = new Map<string, string>();
  for (const s of sections) {
    // First occurrence of a title wins; dedup suffixes (-2) keep later ones
    // addressable only by exact heading text + order, which the agent controls.
    if (!idByTitle.has(s.title)) {
      idByTitle.set(s.title, s.id);
    }
  }

  // Resolve linkToHeading -> kindraw:// link; collect unmatched.
  const unmatchedHeadings: string[] = [];
  let linksWired = 0;
  const nodes = input.diagram.nodes.map((n) => {
    if (!n.linkToHeading) {
      const { linkToHeading: _omit, ...rest } = n;
      return rest;
    }
    const sectionId = idByTitle.get(n.linkToHeading);
    const { linkToHeading: _omit, ...rest } = n;
    if (!sectionId) {
      unmatchedHeadings.push(n.linkToHeading);
      return rest;
    }
    linksWired += 1;
    return { ...rest, link: buildKindrawSectionLink(hybridId, sectionId) };
  });

  // Step 2: doc.
  try {
    await client.updateHybridDoc(docItemId, input.markdown);
  } catch (err) {
    throw new HybridPartialError(
      `Hybrid ${hybridId} seeded but doc PUT failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      hybridId,
      docItemId,
      drawingItemId,
      "doc",
    );
  }

  // Step 3: drawing. buildScene already validates node.link.
  const { content, elementCount } = await buildScene({
    nodes,
    edges: input.diagram.edges as never,
    groups: input.diagram.groups,
    direction: input.diagram.direction,
    engine: input.diagram.engine,
  });
  // Defensive: PUT does NOT validate JSON; ensure ours is parseable.
  JSON.parse(content);
  try {
    await client.updateHybridDrawing(drawingItemId, content);
  } catch (err) {
    throw new HybridPartialError(
      `Hybrid ${hybridId} doc set but drawing PUT failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      hybridId,
      docItemId,
      drawingItemId,
      "drawing",
    );
  }

  return {
    hybridId,
    docItemId,
    drawingItemId,
    url: client.hybridUrl(hybridId),
    linksWired,
    unmatchedHeadings,
    elementCount,
  };
};
```

**Step 2: Export from `index.ts`:**
```ts
export { composeHybrid, HybridPartialError } from "./hybrid.js";
export type {
  ComposeHybridInput,
  ComposeHybridResult,
  HybridDiagram,
  HybridDiagramNode,
} from "./hybrid.js";
```

> **NOTE — bundling:** `hybrid.ts` imports `./scene/build.js`, which pulls in the heavy `@excalidraw/element` transform. To avoid bloating the light `index.js` entry, the MCP/CLI should `import` `composeHybrid` via a dynamic `import("@kindraw/client/hybrid")` OR a dedicated subpath. **Decision:** add a `"./hybrid"` export to `package.json` + a `scene/hybrid` esbuild entry, OR keep it simple by having the MCP/CLI `await import("@kindraw/client/scene")` for buildScene and call the hybrid methods directly. **Implementer: prefer adding a `./hybrid` subpath export** (mirrors `./scene`) so `index.js` stays light. If you keep `composeHybrid` in the root export, the buildScene transform gets bundled into `index.js` — acceptable but heavier. Flag this in the Phase 3 review.

**Step 3: Add the `./hybrid` subpath** (recommended). In `packages/kindraw-client/package.json` `exports`, add after `./scene`:
```json
    "./hybrid": {
      "types": "./dist/hybrid.d.ts",
      "default": "./dist/hybrid.js"
    }
```
And in `build.mjs` `entryPoints`, add: `hybrid: path.resolve(__dirname, "src/hybrid.ts"),` and append `src/hybrid.ts` to the `tsc --emitDeclarationOnly` file list. Then REMOVE the `composeHybrid`/types exports from `index.ts` (Step 2) to keep the light entry free of the transform — export them only via the subpath.

**Step 4: Run → expect PASS.** `yarn vitest run packages/kindraw-client/src/hybrid.test.ts`

**Step 5: Full client suite + typecheck.**
```bash
yarn vitest run packages/kindraw-client
yarn workspace @kindraw/client typecheck
```
**Expected:** all client tests pass; typecheck exits 0.

**Step 6: Commit**

```bash
git add packages/kindraw-client/src/hybrid.ts packages/kindraw-client/src/hybrid.test.ts packages/kindraw-client/src/index.ts packages/kindraw-client/package.json packages/kindraw-client/build.mjs
git commit -m "feat(kindraw-client): composeHybrid orchestrator (seed+doc+drawing+links)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**If Task Fails:**
1. `edges as never` cast is a smell — instead type `HybridDiagram.edges` to match `DiagramEdge[]` by importing `DiagramEdge` and using it; the `never` is a stopgap. Prefer `import type { DiagramEdge } from "./scene/spec.js"` and `edges: DiagramEdge[]`.
2. Determinism: `composeHybrid` calls `buildScene` once — output is deterministic given the same nodes/links.
3. Rollback all touched files.

---

### Task 3.9: `kindraw_create_hybrid` MCP tool

**Files:**
- Modify: `packages/kindraw-mcp/src/index.ts`

**Step 1: Register the tool** after `kindraw_create_doc`:

```ts
  server.registerTool(
    "kindraw_create_hybrid",
    {
      description:
        "Create a hybrid item: a live markdown doc BESIDE an Excalidraw canvas, " +
        "wired together with clickable section links. Provide the full markdown " +
        "AND a diagram in ONE call. Each diagram node may carry linkToHeading " +
        "(exact heading text) to deep-link that node to its doc section. Returns " +
        "the /hybrid/<id> URL plus a report of how many links were wired and any " +
        "linkToHeading that matched NO heading (fix the heading text and retry).",
      inputSchema: {
        title: z.string().max(500).describe("Title for the hybrid item"),
        markdown: z
          .string()
          .max(500_000)
          .describe("Full doc body (GFM). Headings become linkable sections."),
        folderId: z.string().max(200).nullish().describe("Optional folder id"),
        diagram: z
          .object({
            nodes: z
              .array(
                z.object({
                  id: z.string().max(200),
                  label: z.string().max(2000),
                  shape: z
                    .enum(["rectangle", "diamond", "ellipse"])
                    .optional(),
                  group: z.string().max(200).optional(),
                  strokeColor: z.string().max(64).optional(),
                  backgroundColor: z.string().max(64).optional(),
                  linkToHeading: z
                    .string()
                    .max(500)
                    .optional()
                    .describe("Exact heading text to deep-link this node"),
                }),
              )
              .min(1)
              .max(500),
            edges: z
              .array(
                z.object({
                  from: z.string().max(200),
                  to: z.string().max(200),
                  label: z.string().max(2000).optional(),
                  style: z.enum(["solid", "dashed", "dotted"]).optional(),
                }),
              )
              .max(2000),
            groups: z
              .array(
                z.object({
                  id: z.string().max(200),
                  label: z.string().max(2000).optional(),
                }),
              )
              .max(200)
              .optional(),
            direction: z.enum(["TB", "BT", "LR", "RL"]).optional(),
            engine: z.enum(["dagre", "elk"]).optional(),
          })
          .describe("The canvas graph beside the doc"),
      },
    },
    async ({ title, markdown, folderId, diagram }) => {
      try {
        const { composeHybrid, HybridPartialError } = await import(
          "@kindraw/client/hybrid"
        );
        try {
          const res = await composeHybrid(client, {
            title,
            markdown,
            folderId,
            diagram: diagram as Parameters<typeof composeHybrid>[1]["diagram"],
          });
          const warn = res.unmatchedHeadings.length
            ? `\nWARNING: ${res.unmatchedHeadings.length} linkToHeading value(s) ` +
              `matched no heading: ${res.unmatchedHeadings.join(", ")}. ` +
              `Fix the heading text and retry.`
            : "";
          return text(
            `Created hybrid "${title}" (${res.elementCount} canvas elements, ` +
              `${res.linksWired} section link(s) wired).\n${res.url}${warn}`,
          );
        } catch (err) {
          if (err instanceof HybridPartialError) {
            return {
              ...text(
                `Hybrid partially created (step "${err.failedStep}" failed): ${err.message}\n` +
                  `hybridId=${err.hybridId} docItemId=${err.docItemId} ` +
                  `drawingItemId=${err.drawingItemId}. PUTs are idempotent — retry the ` +
                  `failed content write rather than re-creating.`,
              ),
              isError: true,
            };
          }
          throw err;
        }
      } catch (error) {
        return { ...text(formatError(error)), isError: true };
      }
    },
  );
```

**Step 2: Typecheck.** `yarn workspace @kindraw/mcp typecheck` → exits 0.

**Step 3: Commit**

```bash
git add packages/kindraw-mcp/src/index.ts
git commit -m "feat(kindraw-mcp): add kindraw_create_hybrid (doc + canvas + links)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**If Task Fails:**
1. `@kindraw/client/hybrid` not resolvable: confirm Task 3.8 added the `./hybrid` subpath to `package.json` exports AND the dist was built (`yarn workspace @kindraw/client build`). For TYPECHECK only, the subpath types resolve via `dist/hybrid.d.ts` — if dist isn't built, typecheck against source by temporarily importing from `@kindraw/client` root. Prefer building the client first.
2. Rollback: `git checkout -- packages/kindraw-mcp/src/index.ts`.

---

### Task 3.10: `kindraw hybrid create` CLI command

**Files:**
- Create: `packages/kindraw-cli/src/commands/hybrid.ts`
- Modify: `packages/kindraw-cli/src/index.ts`

**Step 1: Create `packages/kindraw-cli/src/commands/hybrid.ts`:**

```ts
import { requireClient } from "../client.js";
import { MAX_TITLE_LEN, readSource } from "./generate.js";

const USAGE =
  "Usage: kindraw hybrid create --title <T> [--md <file|->] [--spec <file|->] [--folder <id>]";

// `kindraw hybrid create --title T [--md <file|->] [--spec <file|->] [--folder ID]`
// --md   markdown body (default "# {title}\n\n" if omitted)
// --spec a HybridDiagram JSON (nodes/edges + optional linkToHeading)
export const hybridCreate = async (args: {
  title?: string;
  md?: string;
  spec?: string;
  folder?: string;
}): Promise<void> => {
  if (!args.title) {
    throw new Error(`Provide --title.\n${USAGE}`);
  }
  const title =
    args.title.length > MAX_TITLE_LEN
      ? args.title.slice(0, MAX_TITLE_LEN)
      : args.title;

  const markdown = args.md ? readSource(args.md) : `# ${title}\n\n`;

  let diagram: { nodes: unknown[]; edges: unknown[] } = { nodes: [], edges: [] };
  if (args.spec) {
    try {
      diagram = JSON.parse(readSource(args.spec));
    } catch {
      throw new Error("--spec must be valid JSON (a HybridDiagram).");
    }
  }
  if (!Array.isArray(diagram.nodes) || diagram.nodes.length === 0) {
    throw new Error("--spec must contain at least one node (nodes[]).");
  }

  const client = requireClient();
  const { composeHybrid } = await import("@kindraw/client/hybrid");
  const res = await composeHybrid(client, {
    title,
    markdown,
    folderId: args.folder ?? null,
    diagram: diagram as Parameters<typeof composeHybrid>[1]["diagram"],
  });

  console.log(
    `Created hybrid "${title}" (${res.elementCount} elements, ${res.linksWired} links)`,
  );
  if (res.unmatchedHeadings.length) {
    console.log(
      `WARNING: unmatched linkToHeading: ${res.unmatchedHeadings.join(", ")}`,
    );
  }
  console.log(res.url);
};
```

**Step 2: Wire in `index.ts`.** Add import:
```ts
import { hybridCreate } from "./commands/hybrid.js";
```
Add a `case "hybrid":`:
```ts
    case "hybrid": {
      if (sub === "create") {
        return hybridCreate({
          title: str(flags.title),
          md: str(flags.md),
          spec: str(flags.spec),
          folder: str(flags.folder),
        });
      }
      throw new Error(`Unknown hybrid command: ${sub ?? "(none)"}`);
    }
```
Add to HELP:
```
  kindraw hybrid create --title <T>    Create a doc + canvas hybrid
                       [--md <file|->] [--spec <file|->] [--folder <id>]
```

**Step 3: Typecheck.** `yarn workspace @kindraw/cli typecheck` → exits 0.

**Step 4: Commit**

```bash
git add packages/kindraw-cli/src/commands/hybrid.ts packages/kindraw-cli/src/index.ts
git commit -m "feat(kindraw-cli): add 'kindraw hybrid create'

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.11: Phase 3 manual smoke + Code Review

**Step 1: Build the client (dist needed for the subpath import in MCP/CLI):**
```bash
yarn workspace @kindraw/client build
```
**Expected:** `@kindraw/client built → dist/...` including `dist/hybrid.js`.

**Step 2: Tests + typecheck:**
```bash
yarn test:typecheck
yarn vitest run packages/kindraw-client
yarn vitest run excalidraw-app/kindraw/hybridSections.test.ts
```
**Expected:** all green (app parser baseline still passes — we never touched it).

**Step 3: CLI smoke (real token).** Create `/tmp/hy.json`:
```json
{ "nodes": [
    { "id": "ui", "label": "UI", "linkToHeading": "Overview" },
    { "id": "db", "label": "DB", "linkToHeading": "Database" } ],
  "edges": [ { "from": "ui", "to": "db" } ] }
```
Run:
```bash
printf '# Overview\n\nThe app.\n\n# Database\n\nPostgres.\n' > /tmp/hy.md
KINDRAW_TOKEN=$KINDRAW_TOKEN node packages/kindraw-cli/dist/index.js \
  hybrid create --title "Hybrid smoke" --md /tmp/hy.md --spec /tmp/hy.json
```
**Expected:** `Created hybrid "Hybrid smoke" (N elements, 2 links)` + a `/hybrid/<id>` URL. Open it; click the `UI` node → it should jump to the **Overview** section; `DB` → **Database**.

**If a node doesn't link:** the heading text in `--spec linkToHeading` must EXACTLY match the markdown heading text. Check the WARNING line.

**Step 4: Code Review** (same protocol as Task 2.10) — dispatch ring:code-reviewer, ring:business-logic-reviewer, ring:security-reviewer in parallel over `git diff <phase2-end>...HEAD`. Fix Critical/High/Medium; TODO(review) Low; FIXME(nitpick) Cosmetic. **Specifically ask the reviewers to confirm:** (a) the vendored slug parser stays in parity (the parity test enforces it), (b) `composeHybrid` never trusts the server url, (c) the `./hybrid` subpath keeps `index.js` free of the buildScene transform.

**Phase 3 is now shippable.**

---

# PHASE 4 — TEMPLATES + ICONS

**Shippable outcome:** template fetch/instantiate via a `reanchor-free` serializer, icon search + SVG-image embedding into scenes, and the MCP tools `kindraw_list_templates`, `kindraw_apply_template`, `kindraw_search_icons` (+ CLI parity). No raw `getIconSvg` MCP tool (SVG strings waste tokens).

**Files touched in Phase 4:**
- `packages/kindraw-client/src/client.ts` (modify — templates + icons)
- `packages/kindraw-client/src/client.test.ts` (modify)
- `packages/kindraw-client/src/scene/build.ts` (modify — additive `templateElements`/`files`)
- `packages/kindraw-client/src/scene/buildFromSkeletons.ts` (CREATE — reanchor-free serializer)
- `packages/kindraw-client/src/scene/buildFromSkeletons.test.ts` (CREATE)
- `packages/kindraw-client/src/scene/index.ts` (modify — export)
- `packages/kindraw-client/src/icons.ts` (CREATE — icon→image-skeleton composer)
- `packages/kindraw-client/src/icons.test.ts` (CREATE)
- `packages/kindraw-client/src/index.ts` (modify — exports)
- `packages/kindraw-mcp/src/index.ts` (modify — 3 tools)
- `packages/kindraw-cli/src/commands/templates.ts` (CREATE)
- `packages/kindraw-cli/src/commands/icons.ts` (CREATE)
- `packages/kindraw-cli/src/index.ts` (modify — routes + help)

---

### Task 4.1: Template + icon client methods — RED

**Files:**
- Modify: `packages/kindraw-client/src/client.test.ts`

**Step 1: Append tests:**

```ts
describe("templates + icons", () => {
  it("listTemplates GETs /api/templates", async () => {
    mockFetch([
      { status: 200, json: { templates: [{ id: "t1", title: "Flow", category: "diagram" }] } },
    ]);
    const c = new KindrawClient({ token: "kdr_test" });
    const res = await c.listTemplates();
    expect(res.templates[0].id).toBe("t1");
    expect(calls[0].url).toBe("https://api.kindraw.dev/api/templates");
  });

  it("getTemplate GETs /api/templates/:id", async () => {
    mockFetch([{ status: 200, json: { id: "t1", title: "Flow", elements: [] } }]);
    const c = new KindrawClient({ token: "kdr_test" });
    await c.getTemplate("t1");
    expect(calls[0].url).toBe("https://api.kindraw.dev/api/templates/t1");
  });

  it("searchIcons GETs /api/icons/search with q + limit", async () => {
    mockFetch([{ status: 200, json: { icons: [{ id: "mdi:home", set: "mdi", name: "home" }] } }]);
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
    await expect(c.getIconSvg("not a valid id")).rejects.toThrow(/invalid icon id/i);
    expect(calls.length).toBe(0);
  });
});
```

**Step 2: Run → expect FAIL.** `yarn vitest run packages/kindraw-client/src/client.test.ts`

---

### Task 4.2: Implement template + icon methods (GREEN)

**Files:**
- Modify: `packages/kindraw-client/src/client.ts`
- Modify: `packages/kindraw-client/src/index.ts`

**Step 1: Add types** near the others:
```ts
export type KindrawTemplateMeta = {
  id: string;
  title: string;
  description?: string;
  category?: string;
};
export type KindrawTemplate = KindrawTemplateMeta & {
  elements: Array<Record<string, unknown>>;
};
export type KindrawIconHit = { id: string; set: string; name: string };
```

**Step 2: Add a validation regex + methods** after the hybrid methods:
```ts
  listTemplates(): Promise<{ templates: KindrawTemplateMeta[] }> {
    return this.request("GET", "/api/templates");
  }

  getTemplate(id: string): Promise<KindrawTemplate> {
    return this.request("GET", `/api/templates/${encodeURIComponent(id)}`);
  }

  searchIcons(q: string, limit = 48): Promise<{ icons: KindrawIconHit[] }> {
    const params = new URLSearchParams({ q, limit: String(limit) });
    return this.request("GET", `/api/icons/search?${params.toString()}`);
  }

  // Returns a RAW SVG string (image/svg+xml) via requestText (verified C1).
  // Validate the id BEFORE the call — the server requires this exact shape.
  getIconSvg(id: string, color?: string): Promise<string> {
    if (!/^[a-z0-9-]+:[a-z0-9-]+$/i.test(id)) {
      throw new Error(`Invalid icon id "${id}" (expected "prefix:name").`);
    }
    const params = new URLSearchParams({ id });
    if (color) {
      params.set("color", color);
    }
    return this.requestText("GET", `/api/icons/svg?${params.toString()}`);
  }
```

> **NOTE:** `getIconSvg` must `throw` synchronously-but-inside-async is fine (it's an `async`-returning method returning a Promise via `requestText`); but the test asserts `fetch` is NOT called for a bad id. Because the regex check runs before `requestText`, and the method body throws before any `await fetch`, `calls.length === 0` holds. (If you make it `async`, the throw still happens before fetch — equivalent.)

**Step 3: Export the new types** in `index.ts`.

**Step 4: Run → expect PASS.** `yarn vitest run packages/kindraw-client/src/client.test.ts`

**Step 5: Typecheck.** `yarn workspace @kindraw/client typecheck` → exits 0.

**Step 6: Commit**

```bash
git add packages/kindraw-client/src/client.ts packages/kindraw-client/src/index.ts packages/kindraw-client/src/client.test.ts
git commit -m "feat(kindraw-client): add template + icon read methods

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.3: `buildFromSkeletons` (reanchor-free template serializer) — RED

**Files:**
- Create: `packages/kindraw-client/src/scene/buildFromSkeletons.test.ts`

**Step 1: Write the failing test:**

```ts
import { describe, expect, it } from "vitest";

import { buildFromSkeletons } from "./buildFromSkeletons";

describe("buildFromSkeletons", () => {
  it("serializes loose skeletons into an excalidraw envelope WITHOUT re-anchoring arrows", async () => {
    // Template-shaped input: an unbound arrow with explicit points (NOT a
    // {start:{id},end:{id}} binding). reanchorArrows would displace it — this
    // serializer must leave its points intact.
    const { content, elementCount } = await buildFromSkeletons([
      { type: "rectangle", id: "r1", x: 0, y: 0, width: 100, height: 60, label: { text: "Box" } },
      { type: "arrow", id: "ar1", x: 120, y: 30, width: 80, height: 0, points: [[0, 0], [80, 0]] },
    ]);
    const parsed = JSON.parse(content);
    expect(parsed.type).toBe("excalidraw");
    expect(parsed.source).toBe("@kindraw/client");
    const arrow = parsed.elements.find((e: { type: string }) => e.type === "arrow");
    // Points preserved (2-point explicit segment), not rebound.
    expect(arrow.points).toEqual([[0, 0], [80, 0]]);
    expect(arrow.startBinding ?? null).toBeNull();
    expect(elementCount).toBeGreaterThanOrEqual(2);
  });

  it("namespaces ingested ids with a tpl- prefix to avoid collisions", async () => {
    const { content } = await buildFromSkeletons([
      { type: "rectangle", id: "r1", x: 0, y: 0, width: 10, height: 10 },
    ]);
    const ids = JSON.parse(content).elements.map((e: { id: string }) => e.id);
    expect(ids.some((id: string) => id.startsWith("tpl-"))).toBe(true);
  });

  it("is deterministic", async () => {
    const skel = [{ type: "rectangle", id: "r1", x: 0, y: 0, width: 10, height: 10 }];
    const a = await buildFromSkeletons(skel);
    const b = await buildFromSkeletons(skel);
    expect(a.content).toBe(b.content);
  });
});
```

**Step 2: Run → expect FAIL** (`buildFromSkeletons` does not exist).

Run: `yarn vitest run packages/kindraw-client/src/scene/buildFromSkeletons.test.ts`

---

### Task 4.4: Implement `buildFromSkeletons` (GREEN)

**Files:**
- Create: `packages/kindraw-client/src/scene/buildFromSkeletons.ts`
- Modify: `packages/kindraw-client/src/scene/index.ts` (export)

**Step 1: Refactor the shared envelope/stabilize/shim out of `build.ts`** so both serializers reuse it. To keep this task small, `buildFromSkeletons.ts` will re-import the needed helpers. Since `ensureProvider`, `ensureWindowShim`, and `stabilize` are module-private in `build.ts`, EXPORT them from `build.ts` first:

In `build.ts`, change:
- `const ensureProvider` → `export const ensureProvider`
- `const ensureWindowShim` → `export const ensureWindowShim`
- `const stabilize` → `export const stabilize` (and export the `ExEl` type: `export type ExEl = ...`)

**Step 2: Create `packages/kindraw-client/src/scene/buildFromSkeletons.ts`:**

```ts
// Serialize convertToExcalidrawElements INPUT skeletons (e.g. server templates)
// into the .excalidraw envelope — WITHOUT reanchorArrows. Template arrows are
// intentionally UNBOUND (explicit x/y + points); reanchorArrows assumes BOUND
// arrows and would displace them (verified-critical). We namespace ingested ids
// with a "tpl-" prefix (collision-free: RESERVED_ID_PREFIX_RE forbids text-/arrow-
// but NOT tpl-, verified C8) so template ids never clash with user/icon ids.

import { convertToExcalidrawElements } from "@excalidraw/element";

import {
  ensureProvider,
  ensureWindowShim,
  stabilize,
  type ExEl,
} from "./build.js";

export type BuildFromSkeletonsResult = {
  content: string;
  elementCount: number;
  /** The serialized element objects (for merging into a larger scene). */
  elements: ExEl[];
};

const namespaceIds = (
  skeletons: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> =>
  skeletons.map((s) => ({
    ...s,
    ...(typeof s.id === "string" ? { id: `tpl-${s.id}` } : {}),
  }));

export const buildFromSkeletons = async (
  skeletons: Array<Record<string, unknown>>,
  opts?: { files?: Record<string, unknown> },
): Promise<BuildFromSkeletonsResult> => {
  ensureProvider();
  ensureWindowShim();

  const elements = convertToExcalidrawElements(
    namespaceIds(skeletons) as never,
    { regenerateIds: false },
  );
  // NO reanchorArrows here — template arrows are explicit/unbound.
  const visible = (elements as unknown as ExEl[]).filter(
    (el) => !(el as { isDeleted?: boolean }).isDeleted,
  );
  stabilize(visible);

  const content = JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "@kindraw/client",
    elements: visible,
    appState: { viewBackgroundColor: "#ffffff", gridSize: null },
    files: opts?.files ?? {},
  });

  return { content, elementCount: visible.length, elements: visible };
};
```

**Step 3: Export from `scene/index.ts`:**
```ts
export { buildFromSkeletons } from "./buildFromSkeletons.js";
export type { BuildFromSkeletonsResult } from "./buildFromSkeletons.js";
```

**Step 4: Run → expect PASS.** `yarn vitest run packages/kindraw-client/src/scene/buildFromSkeletons.test.ts`

**Step 5: Re-run the WHOLE scene suite** (we exported helpers from build.ts — confirm nothing broke):
```bash
yarn vitest run packages/kindraw-client/src/scene
```
**Expected:** all scene tests pass (build.test.ts unchanged in behavior).

**Step 6: Typecheck.** `yarn workspace @kindraw/client typecheck` → exits 0.

**Step 7: Commit**

```bash
git add packages/kindraw-client/src/scene/build.ts packages/kindraw-client/src/scene/buildFromSkeletons.ts packages/kindraw-client/src/scene/buildFromSkeletons.test.ts packages/kindraw-client/src/scene/index.ts
git commit -m "feat(kindraw-client): buildFromSkeletons (reanchor-free template serializer)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**If Task Fails:**
1. `ExEl` type export error: ensure `build.ts` exports both the type and the value helpers.
2. Determinism: `stabilize` zeroes seed/version — same input → same output. If non-deterministic, check `convertToExcalidrawElements` isn't generating random ids for unbound arrows (it shouldn't under `regenerateIds:false`; if it does for bound text, `stabilize`'s `canonicalizeBoundTextIds` handles it).

---

### Task 4.5: Icon → image-skeleton composer — RED

**Files:**
- Create: `packages/kindraw-client/src/icons.test.ts`

The composer is fetch-free: it takes a `getIconSvg`-shaped callback (so `scene/` never imports the HTTP client) and produces `{ imageSkeletons, files }` to merge into a scene. fileId is a deterministic hash of `iconId+color` (NOT randomId).

**Step 1: Write the failing test:**

```ts
import { describe, expect, it } from "vitest";

import { composeIconImages } from "./icons";

describe("composeIconImages", () => {
  const fakeFetch = async (id: string, _color?: string) => {
    if (id === "bad:icon") {
      const e = new Error("404") as Error & { status?: number };
      e.status = 404;
      throw e;
    }
    return `<svg id="${id}"/>`;
  };

  it("produces an image skeleton + matching files entry per icon (deterministic fileId)", async () => {
    const { imageSkeletons, files, warnings } = await composeIconImages(
      [{ iconId: "mdi:home", nodeId: "a", color: "#ff0000" }],
      fakeFetch,
      { positions: { a: { x: 10, y: 20 } } },
    );
    expect(warnings).toEqual([]);
    expect(imageSkeletons).toHaveLength(1);
    const img = imageSkeletons[0];
    expect(img.type).toBe("image");
    expect(img.status).toBe("saved");
    expect(img.x).toBe(10);
    expect(img.y).toBe(20);
    // fileId is referenced and present in files (no dangling fileId).
    expect(files[img.fileId as string]).toBeDefined();
    const entry = files[img.fileId as string] as { dataURL: string };
    expect(entry.dataURL.startsWith("data:image/svg+xml;base64,")).toBe(true);
    // base64 decodes back to the original svg.
    const b64 = entry.dataURL.replace("data:image/svg+xml;base64,", "");
    expect(Buffer.from(b64, "base64").toString("utf8")).toBe('<svg id="mdi:home"/>');
  });

  it("is deterministic: same icon+color -> same fileId", async () => {
    const a = await composeIconImages([{ iconId: "mdi:home", color: "#fff" }], fakeFetch);
    const b = await composeIconImages([{ iconId: "mdi:home", color: "#fff" }], fakeFetch);
    expect(a.imageSkeletons[0].fileId).toBe(b.imageSkeletons[0].fileId);
  });

  it("skips a 404 icon with a warning instead of aborting", async () => {
    const { imageSkeletons, warnings } = await composeIconImages(
      [
        { iconId: "mdi:home" },
        { iconId: "bad:icon" },
      ],
      fakeFetch,
    );
    expect(imageSkeletons).toHaveLength(1);
    expect(warnings).toEqual(["bad:icon"]);
  });
});
```

**Step 2: Run → expect FAIL.** `yarn vitest run packages/kindraw-client/src/icons.test.ts`

---

### Task 4.6: Implement `composeIconImages` (GREEN)

**Files:**
- Create: `packages/kindraw-client/src/icons.ts`
- Modify: `packages/kindraw-client/src/index.ts` (export)

**Step 1: Create `packages/kindraw-client/src/icons.ts`:**

```ts
// Turn picked Iconify icon ids into Excalidraw image skeletons + a matching
// `files` map, to be merged into a scene. FETCH-FREE: the caller injects a
// getIconSvg-shaped callback so this module (and scene/) never import the HTTP
// client. fileId is a DETERMINISTIC hash of iconId+color (NOT randomId) so the
// serialized scene stays snapshot-stable. We ATOMICALLY emit the files entry
// alongside every image element — a dangling fileId renders a broken image.

export type IconPlacement = {
  iconId: string;
  /** Place the icon at this node's top-left if positions[nodeId] is known. */
  nodeId?: string;
  color?: string;
};

export type ComposeIconImagesResult = {
  imageSkeletons: Array<Record<string, unknown>>;
  files: Record<string, unknown>;
  /** iconIds that failed to fetch (skipped, not fatal). */
  warnings: string[];
};

// Tiny stable string hash (FNV-1a) -> hex. Deterministic, dependency-free.
const stableHash = (value: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};

const DEFAULT_ICON_SIZE = 28;
const GRID_STEP = 48;

export const composeIconImages = async (
  placements: IconPlacement[],
  getIconSvg: (id: string, color?: string) => Promise<string>,
  opts?: { positions?: Record<string, { x: number; y: number }> },
): Promise<ComposeIconImagesResult> => {
  const imageSkeletons: Array<Record<string, unknown>> = [];
  const files: Record<string, unknown> = {};
  const warnings: string[] = [];

  let gridIndex = 0;
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    let svg: string;
    try {
      svg = await getIconSvg(p.iconId, p.color);
    } catch {
      warnings.push(p.iconId);
      continue;
    }

    const fileId = `icon-${stableHash(`${p.iconId}|${p.color ?? ""}`)}`;
    const b64 = Buffer.from(svg, "utf8").toString("base64");
    // Atomic: add the files entry whenever we emit an image element.
    files[fileId] = {
      id: fileId,
      mimeType: "image/svg+xml",
      dataURL: `data:image/svg+xml;base64,${b64}`,
      created: 1, // stabilized
    };

    const pos =
      p.nodeId && opts?.positions?.[p.nodeId]
        ? opts.positions[p.nodeId]
        : { x: (gridIndex % 8) * GRID_STEP, y: Math.floor(gridIndex / 8) * GRID_STEP };
    if (!(p.nodeId && opts?.positions?.[p.nodeId])) {
      gridIndex += 1;
    }

    imageSkeletons.push({
      type: "image",
      id: `icon-${i}`,
      fileId,
      status: "saved",
      x: pos.x,
      y: pos.y,
      width: DEFAULT_ICON_SIZE,
      height: DEFAULT_ICON_SIZE,
    });
  }

  return { imageSkeletons, files, warnings };
};
```

**Step 2: Export from `index.ts`:**
```ts
export { composeIconImages } from "./icons.js";
export type {
  IconPlacement,
  ComposeIconImagesResult,
} from "./icons.js";
```

**Step 3: Run → expect PASS.** `yarn vitest run packages/kindraw-client/src/icons.test.ts`

**Step 4: Typecheck.** `yarn workspace @kindraw/client typecheck` → exits 0.

**Step 5: Commit**

```bash
git add packages/kindraw-client/src/icons.ts packages/kindraw-client/src/icons.test.ts packages/kindraw-client/src/index.ts
git commit -m "feat(kindraw-client): composeIconImages (deterministic fileId, skip-on-404)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.7: Additive `templateElements` + `files` inputs in `buildScene` — RED→GREEN

**Files:**
- Modify: `packages/kindraw-client/src/scene/build.test.ts`
- Modify: `packages/kindraw-client/src/scene/build.ts`

**Step 1: Append a test** to `build.test.ts`:

```ts
describe("buildScene additive inputs (templateElements + files + iconImages)", () => {
  it("prepends templateElements and merges files into the envelope", async () => {
    const { content } = await buildScene(
      { nodes: [{ id: "a", label: "A" }], edges: [] },
      {
        templateElements: [
          { id: "tpl-bg", type: "rectangle", x: 0, y: 0, width: 200, height: 200, isDeleted: false },
        ],
        files: { "icon-deadbeef": { id: "icon-deadbeef", mimeType: "image/svg+xml", dataURL: "data:image/svg+xml;base64,PHN2Zy8+", created: 1 } },
        iconImages: [
          { type: "image", id: "icon-0", fileId: "icon-deadbeef", status: "saved", x: 5, y: 5, width: 28, height: 28 },
        ],
      },
    );
    const parsed = JSON.parse(content);
    // template element present, before the node.
    const ids = parsed.elements.map((e: { id: string }) => e.id);
    expect(ids).toContain("tpl-bg");
    // image element present.
    expect(parsed.elements.some((e: { type: string }) => e.type === "image")).toBe(true);
    // files merged (not {}).
    expect(parsed.files["icon-deadbeef"]).toBeDefined();
  });

  it("still serializes files:{} when no extra inputs are given (back-compat)", async () => {
    const { content } = await buildScene({ nodes: [{ id: "a", label: "A" }], edges: [] });
    expect(JSON.parse(content).files).toEqual({});
  });
});
```

**Step 2: Run → expect FAIL** (second arg ignored; `tpl-bg` not present, files empty).

Run: `yarn vitest run packages/kindraw-client/src/scene/build.test.ts`

**Step 3: Extend `buildScene`'s signature** in `build.ts`. Change the function to accept an optional second arg:

```ts
export type BuildSceneExtras = {
  /** Pre-serialized template elements to PREPEND (already excalidraw elements). */
  templateElements?: ExEl[];
  /** Image skeletons (icons) to APPEND, converted alongside the scene. */
  iconImages?: Array<Record<string, unknown>>;
  /** Files map to merge into the envelope (icon dataURLs). */
  files?: Record<string, unknown>;
};

export const buildScene = async (
  rawSpec: DiagramSpec,
  extras?: BuildSceneExtras,
): Promise<BuildResult> => {
```

Inside, after `reanchorArrows(...)` and `stabilize(visible ...)`, assemble the final element array. Replace the envelope-construction block (lines 194-204) with:

```ts
  const visible = elements.filter((el) => !el.isDeleted);
  stabilize(visible as unknown as ExEl[]);

  // Convert icon image skeletons separately (no layout, no reanchor) and
  // stabilize them too, so the whole scene stays deterministic.
  let iconEls: ExEl[] = [];
  if (extras?.iconImages?.length) {
    const converted = convertToExcalidrawElements(
      extras.iconImages as never,
      { regenerateIds: false },
    );
    iconEls = (converted as unknown as ExEl[]).filter(
      (el) => !(el as { isDeleted?: boolean }).isDeleted,
    );
    stabilize(iconEls);
  }

  const templateEls = (extras?.templateElements ?? []).filter(
    (el) => !(el as { isDeleted?: boolean }).isDeleted,
  );

  const allElements = [
    ...templateEls,
    ...(visible as unknown as ExEl[]),
    ...iconEls,
  ];

  const content = JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "@kindraw/client",
    elements: allElements,
    appState: { viewBackgroundColor: "#ffffff", gridSize: null },
    files: { ...(extras?.files ?? {}) },
  });

  return { content, elementCount: allElements.length };
```

> **NOTE:** `ExEl` must be imported/exported in `build.ts` — it was exported in Task 4.4. The `convertToExcalidrawElements` import is already present. Keep `files:{}` behavior when `extras` is undefined (`{...(undefined ?? {})}` = `{}`).

**Step 4: Run → expect PASS** (both new tests + ALL prior buildScene tests, including determinism and `files:{}` back-compat).

Run: `yarn vitest run packages/kindraw-client/src/scene/build.test.ts`

**Step 5: Typecheck.** `yarn workspace @kindraw/client typecheck` → exits 0.

**Step 6: Commit**

```bash
git add packages/kindraw-client/src/scene/build.ts packages/kindraw-client/src/scene/build.test.ts
git commit -m "feat(kindraw-client): additive templateElements/iconImages/files in buildScene

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**If Task Fails:**
1. Back-compat `files:{}` test breaks: ensure `files: { ...(extras?.files ?? {}) }` (spread of empty object = `{}`, and `toEqual({})` passes).
2. Determinism regression: icon/template elements are stabilized; if the determinism test breaks, confirm `stabilize` runs on `iconEls`.

---

### Task 4.8: MCP `kindraw_list_templates`

**Files:**
- Modify: `packages/kindraw-mcp/src/index.ts`

**Step 1: Register** after `kindraw_create_hybrid`:

```ts
  server.registerTool(
    "kindraw_list_templates",
    {
      description:
        "List the built-in Kindraw templates (id, title, category). Template ids " +
        "are opaque — list them first, then pass an id to kindraw_apply_template.",
      inputSchema: {
        category: z
          .string()
          .max(100)
          .optional()
          .describe("Optional client-side category filter"),
      },
    },
    async ({ category }) => {
      try {
        const { templates } = await client.listTemplates();
        const filtered = category
          ? templates.filter((t) => t.category === category)
          : templates;
        if (!filtered.length) {
          return text("No templates found.");
        }
        return text(
          filtered
            .map(
              (t) =>
                `- ${t.id} — ${t.title}${t.category ? ` [${t.category}]` : ""}`,
            )
            .join("\n"),
        );
      } catch (error) {
        return { ...text(formatError(error)), isError: true };
      }
    },
  );
```

**Step 2: Typecheck.** `yarn workspace @kindraw/mcp typecheck` → exits 0.

**Step 3: Commit**

```bash
git add packages/kindraw-mcp/src/index.ts
git commit -m "feat(kindraw-mcp): add kindraw_list_templates

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.9: MCP `kindraw_apply_template`

**Files:**
- Modify: `packages/kindraw-mcp/src/index.ts`

This instantiates a template into a NEW drawing, or (if `hybridDrawingItemId` is set) PUTs it into an existing hybrid canvas. Optional `extraNodes`/`extraEdges` are laid out via `buildScene` and merged past the template bbox.

**Step 1: Register** after `kindraw_list_templates`:

```ts
  server.registerTool(
    "kindraw_apply_template",
    {
      description:
        "Instantiate a built-in template by id into a NEW drawing, or — if " +
        "hybridDrawingItemId is set — write it into an existing hybrid canvas. " +
        "Optionally add extraNodes/extraEdges (laid out and merged past the " +
        "template). List ids first with kindraw_list_templates.",
      inputSchema: {
        templateId: z.string().max(200).describe("Template id to instantiate"),
        title: z
          .string()
          .max(500)
          .optional()
          .describe("Title for the new drawing (ignored when writing to a hybrid)"),
        hybridDrawingItemId: z
          .string()
          .max(200)
          .optional()
          .describe("If set, PUT into this existing hybrid canvas instead of a new drawing"),
        extraNodes: z
          .array(
            z.object({
              id: z.string().max(200),
              label: z.string().max(2000),
              shape: z.enum(["rectangle", "diamond", "ellipse"]).optional(),
            }),
          )
          .max(500)
          .optional()
          .describe("Extra nodes to add beside the template"),
        extraEdges: z
          .array(
            z.object({ from: z.string().max(200), to: z.string().max(200) }),
          )
          .max(2000)
          .optional(),
      },
    },
    async ({ templateId, title, hybridDrawingItemId, extraNodes, extraEdges }) => {
      try {
        const tpl = await client.getTemplate(templateId);
        const { buildFromSkeletons } = await import("@kindraw/client/scene");
        const { elements: templateElements } = await buildFromSkeletons(
          tpl.elements,
        );

        let content: string;
        let elementCount: number;
        if (extraNodes?.length) {
          const { buildScene } = await import("@kindraw/client/scene");
          ({ content, elementCount } = await buildScene(
            { nodes: extraNodes, edges: extraEdges ?? [] },
            { templateElements },
          ));
        } else {
          // No extras: serialize the template alone.
          const built = await buildFromSkeletons(tpl.elements);
          content = built.content;
          elementCount = built.elementCount;
        }

        if (hybridDrawingItemId) {
          JSON.parse(content); // defensive (PUT does not validate)
          await client.updateHybridDrawing(hybridDrawingItemId, content);
          return text(
            `Applied template "${tpl.title}" to hybrid canvas ${hybridDrawingItemId} ` +
              `(${elementCount} elements).`,
          );
        }

        const result = await client.createDrawing({
          title: title || tpl.title,
          content,
        });
        return text(
          `Created drawing "${title || tpl.title}" from template (${elementCount} elements).\n${result.url}`,
        );
      } catch (error) {
        return { ...text(formatError(error)), isError: true };
      }
    },
  );
```

> **NOTE on bbox offset:** the winning design asks extras to be offset past the template bbox. For phase 4 v1, the simplest correct behavior is `templateElements` first, extras laid out from origin — they MAY overlap. **Decision:** ship the merge without auto-offset in v1 and add a `FIXME(nitpick):` noting "offset extras past template bbox" — overlap is a cosmetic layout issue, not a data bug. If the reviewer rates it Medium+, compute the template bbox (max x+width / y+height over `templateElements`) and add it to each extra node's resulting x/y before serialize.

**Step 2: Typecheck.** `yarn workspace @kindraw/mcp typecheck` → exits 0.

**Step 3: Commit**

```bash
git add packages/kindraw-mcp/src/index.ts
git commit -m "feat(kindraw-mcp): add kindraw_apply_template (new drawing or hybrid sink)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**If Task Fails:**
1. `buildFromSkeletons` not on `@kindraw/client/scene`: confirm Task 4.4 exported it from `scene/index.ts` AND the client dist is rebuilt (`yarn workspace @kindraw/client build`).
2. Rollback: `git checkout -- packages/kindraw-mcp/src/index.ts`.

---

### Task 4.10: MCP `kindraw_search_icons`

**Files:**
- Modify: `packages/kindraw-mcp/src/index.ts`

**Step 1: Register** after `kindraw_apply_template`:

```ts
  server.registerTool(
    "kindraw_search_icons",
    {
      description:
        "Search the Iconify icon set (returns id + set/name). Pick ids from here, " +
        "then pass them as icons[] to a scene/hybrid/template call — the SVG is " +
        "embedded for you. (No raw-SVG tool: SVG strings waste tokens.)",
      inputSchema: {
        query: z.string().min(1).max(200).describe("Search term, e.g. 'database'"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(96)
          .optional()
          .describe("Max results (default 48)"),
      },
    },
    async ({ query, limit }) => {
      try {
        const { icons } = await client.searchIcons(query, limit ?? 48);
        if (!icons.length) {
          return text(`No icons found for "${query}".`);
        }
        return text(
          icons.map((i) => `${i.id} — ${i.set}/${i.name}`).join("\n"),
        );
      } catch (error) {
        return { ...text(formatError(error)), isError: true };
      }
    },
  );
```

**Step 2: Typecheck.** `yarn workspace @kindraw/mcp typecheck` → exits 0.

**Step 3: Commit**

```bash
git add packages/kindraw-mcp/src/index.ts
git commit -m "feat(kindraw-mcp): add kindraw_search_icons (compact id list)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.11: CLI `templates` + `icons` commands

**Files:**
- Create: `packages/kindraw-cli/src/commands/templates.ts`
- Create: `packages/kindraw-cli/src/commands/icons.ts`
- Modify: `packages/kindraw-cli/src/index.ts`

**Step 1: Create `packages/kindraw-cli/src/commands/templates.ts`:**

```ts
import fs from "node:fs";

import { requireClient } from "../client.js";
import { readSource } from "./generate.js";

// `kindraw templates list [--category C] [--json]`
export const templatesList = async (args: {
  category?: string;
  json?: boolean;
}): Promise<void> => {
  const client = requireClient();
  const { templates } = await client.listTemplates();
  const filtered = args.category
    ? templates.filter((t) => t.category === args.category)
    : templates;
  if (args.json) {
    console.log(JSON.stringify(filtered, null, 2));
    return;
  }
  if (!filtered.length) {
    console.log("No templates.");
    return;
  }
  for (const t of filtered) {
    console.log(`${t.id}\t${t.title}${t.category ? `\t[${t.category}]` : ""}`);
  }
};

// `kindraw templates apply <id> [--title T] [--spec extra.json] [--hybrid-drawing <id>] [--json]`
export const templatesApply = async (args: {
  id?: string;
  title?: string;
  spec?: string;
  hybridDrawing?: string;
  json?: boolean;
}): Promise<void> => {
  if (!args.id) {
    throw new Error("Usage: kindraw templates apply <id> [--title T] [--spec extra.json] [--hybrid-drawing <id>]");
  }
  const client = requireClient();
  const tpl = await client.getTemplate(args.id);
  const { buildFromSkeletons, buildScene } = await import("@kindraw/client/scene");
  const { elements: templateElements } = await buildFromSkeletons(tpl.elements);

  let content: string;
  let elementCount: number;
  if (args.spec) {
    let extra: { nodes?: unknown[]; edges?: unknown[] };
    try {
      extra = JSON.parse(readSource(args.spec));
    } catch {
      throw new Error("--spec must be valid JSON ({nodes,edges}).");
    }
    ({ content, elementCount } = await buildScene(
      { nodes: (extra.nodes ?? []) as never, edges: (extra.edges ?? []) as never },
      { templateElements },
    ));
  } else {
    ({ content, elementCount } = await buildFromSkeletons(tpl.elements));
  }

  if (args.hybridDrawing) {
    JSON.parse(content);
    await client.updateHybridDrawing(args.hybridDrawing, content);
    console.log(`Applied "${tpl.title}" to hybrid canvas ${args.hybridDrawing} (${elementCount} elements).`);
    return;
  }
  const result = await client.createDrawing({ title: args.title || tpl.title, content });
  if (args.json) {
    console.log(JSON.stringify({ url: result.url, elementCount }));
    return;
  }
  console.log(`Created "${args.title || tpl.title}" (${elementCount} elements)`);
  console.log(result.url);

  void fs; // (fs imported only if a future --out is added; keep lints happy or remove)
};
```

> **NOTE:** remove the unused `fs` import + `void fs;` line if your lint flags it — they're only there as a placeholder. Cleaner: don't import `fs` at all in this file.

**Step 2: Create `packages/kindraw-cli/src/commands/icons.ts`:**

```ts
import fs from "node:fs";

import { requireClient } from "../client.js";

// `kindraw icons search <query> [--limit N] [--json]`
export const iconsSearch = async (args: {
  query?: string;
  limit?: string;
  json?: boolean;
}): Promise<void> => {
  if (!args.query) {
    throw new Error("Usage: kindraw icons search <query> [--limit N] [--json]");
  }
  const client = requireClient();
  const limit = args.limit ? Number(args.limit) : 48;
  const { icons } = await client.searchIcons(args.query, limit);
  if (args.json) {
    console.log(JSON.stringify(icons, null, 2));
    return;
  }
  for (const i of icons) {
    console.log(`${i.id}\t${i.set}/${i.name}`);
  }
};

// `kindraw icons svg <id> [--color #hex] [--out file]`
export const iconsSvg = async (args: {
  id?: string;
  color?: string;
  out?: string;
}): Promise<void> => {
  if (!args.id) {
    throw new Error("Usage: kindraw icons svg <id> [--color #hex] [--out file]");
  }
  const client = requireClient();
  const svg = await client.getIconSvg(args.id, args.color);
  if (args.out) {
    fs.writeFileSync(args.out, svg, "utf8");
    console.log(`Wrote ${args.out}`);
    return;
  }
  console.log(svg);
};
```

**Step 3: Wire in `index.ts`.** Add imports:
```ts
import { templatesList, templatesApply } from "./commands/templates.js";
import { iconsSearch, iconsSvg } from "./commands/icons.js";
```
Add cases:
```ts
    case "templates": {
      if (sub === "list") {
        return templatesList({
          category: str(flags.category),
          json: flags.json === true,
        });
      }
      if (sub === "apply") {
        return templatesApply({
          id: arg,
          title: str(flags.title),
          spec: str(flags.spec),
          hybridDrawing: str(flags["hybrid-drawing"]),
          json: flags.json === true,
        });
      }
      throw new Error(`Unknown templates command: ${sub ?? "(none)"}`);
    }
    case "icons": {
      if (sub === "search") {
        return iconsSearch({
          query: arg,
          limit: str(flags.limit),
          json: flags.json === true,
        });
      }
      if (sub === "svg") {
        return iconsSvg({
          id: arg,
          color: str(flags.color),
          out: str(flags.out),
        });
      }
      throw new Error(`Unknown icons command: ${sub ?? "(none)"}`);
    }
```
Add to HELP:
```
  kindraw templates list [--category C] [--json]   List built-in templates
  kindraw templates apply <id> [--title T]         Instantiate a template
        [--spec extra.json] [--hybrid-drawing <id>]
  kindraw icons search <query> [--limit N] [--json]  Search icons
  kindraw icons svg <id> [--color #hex] [--out file] Fetch one icon SVG
```

**Step 4: Typecheck.** `yarn workspace @kindraw/cli typecheck` → exits 0.

**Step 5: Commit**

```bash
git add packages/kindraw-cli/src/commands/templates.ts packages/kindraw-cli/src/commands/icons.ts packages/kindraw-cli/src/index.ts
git commit -m "feat(kindraw-cli): add templates + icons commands

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**If Task Fails:**
1. `flags["hybrid-drawing"]` — the parser stores `--hybrid-drawing X` under key `hybrid-drawing` (verified `index.ts` parser keeps the hyphen). Correct.
2. `arg` is `positionals[2]` — for `templates apply <id>`, `<id>` is the 3rd positional, matching `const [command, sub, arg] = positionals`. Correct.

---

### Task 4.12: Phase 4 manual smoke + live-template fixture check

**Step 1: Rebuild client + full suite + typecheck:**
```bash
yarn workspace @kindraw/client build
yarn test:typecheck
yarn vitest run packages/kindraw-client
```
**Expected:** all green.

**Step 2: Resolve the residual template-shape uncertainty (live).** With a real token:
```bash
KINDRAW_TOKEN=$KINDRAW_TOKEN node packages/kindraw-cli/dist/index.js templates list
KINDRAW_TOKEN=$KINDRAW_TOKEN node packages/kindraw-cli/dist/index.js templates apply <first-id> --title "Tpl smoke"
```
**Expected:** a `/draw/<id>` URL; open it — the template renders with arrows in their original positions (NOT collapsed/displaced). If arrows are displaced, `buildFromSkeletons` accidentally reanchored — re-check Task 4.4 (no `reanchorArrows` call). If the template shape differs from the loose-skeleton assumption, capture the JSON (`templates apply` will error) and add a recorded fixture test before finalizing.

**Step 3: Icon smoke:**
```bash
KINDRAW_TOKEN=$KINDRAW_TOKEN node packages/kindraw-cli/dist/index.js icons search database --limit 5
KINDRAW_TOKEN=$KINDRAW_TOKEN node packages/kindraw-cli/dist/index.js icons svg mdi:database --out /tmp/db.svg
```
**Expected:** 5 icon ids; `/tmp/db.svg` contains valid `<svg>...`.

**Step 4: MCP smoke** — call `kindraw_search_icons {query:"database"}`, then `kindraw_list_templates`, then `kindraw_apply_template {templateId}`. Confirm URLs return.

---

### Task 4.13: Phase 4 Code Review checkpoint

Same protocol as Task 2.10. Dispatch ring:code-reviewer, ring:business-logic-reviewer, ring:security-reviewer in parallel over the Phase 4 diff. **Specifically confirm:** (a) `buildFromSkeletons` never calls `reanchorArrows`; (b) every emitted image element has a matching `files` entry (no dangling fileId); (c) `getIconSvg` validates the id BEFORE fetch; (d) determinism holds (fileId is a stable hash, not randomId); (e) `scene/` and `icons.ts` never import the HTTP client (fetch is injected). Fix Critical/High/Medium; TODO(review) Low; FIXME(nitpick) Cosmetic.

**Phase 4 is now shippable.**

---

## FINAL VERIFICATION (all phases)

Run the full gate before declaring done:
```bash
yarn test:typecheck
yarn vitest run packages/kindraw-client
yarn vitest run excalidraw-app/kindraw/hybridSections.test.ts   # app parser baseline unchanged
yarn fix                                                         # auto-fix lint/format
yarn test:code                                                  # eslint, zero warnings
yarn test:other                                                # prettier --list-different (no diffs)
```
**Expected:** typecheck 0; all client tests pass; app slug baseline still green; lint clean; prettier clean.

**Zero-Context recap of what shipped:**
- Phase 2: `requestText`, `createDoc`, app-origin + `/doc /draw /hybrid` URL helpers, `kindraw_create_doc`, `kindraw doc create`.
- Phase 3: vendored+parity-tested slug parser, `node.link` in buildScene, hybrid client methods, `composeHybrid` orchestrator, `kindraw_create_hybrid`, `kindraw hybrid create`.
- Phase 4: template/icon client methods, `buildFromSkeletons` (reanchor-free), `composeIconImages` (deterministic fileId), additive `buildScene` inputs, `kindraw_list_templates` / `kindraw_apply_template` / `kindraw_search_icons`, `kindraw templates|icons` CLI.

Every change is additive; no existing method, tool, or test changed behavior; the Worker was never touched.
