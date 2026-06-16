# Kindraw Scene Builder Implementation Plan

> **For Agents:** REQUIRED SUB-SKILL: Use ring:executing-plans to implement this plan task-by-task.

**Goal:** Add a deterministic, DOM-free "scene builder" to `@kindraw/client` that turns a structured JSON spec (nodes + edges + groups) into high-quality Excalidraw scenes with real layout (dagre/elk), and expose it through a new MCP tool and CLI command — so Claude (the MCP client) can compose rich diagrams without the fake-jsdom layout that currently produces cramped, mis-anchored canvases.

**Architecture:** A new pure module `packages/kindraw-client/src/scene/` takes a `DiagramSpec` (nodes + edges + optional groups), measures each node's label with a DOM-free text metrics provider (injected into `@excalidraw/element` via `setCustomTextMetricsProvider`), runs **dagre** (default) or **elkjs** (opt-in flag) to compute positions with real rank/node separation, emits `ExcalidrawElementSkeleton[]`, converts them with `convertToExcalidrawElements`, re-anchors bound arrows border-to-border (reusing the existing `reanchor.ts`), and serializes to the same `.excalidraw` envelope `createDrawing` already accepts. The existing mermaid path (jsdom-based) stays untouched and isolated. A new `kindraw_create_scene` MCP tool and `kindraw generate --spec` CLI command call this builder; backward compatibility for `kindraw_create_diagram` (mermaid) is preserved.

**Tech Stack:** TypeScript (ESM, Node ≥18), esbuild (bundling `@kindraw/client`), vitest (jsdom env, but the scene builder is tested DOM-free), `@excalidraw/element` (`convertToExcalidrawElements`, `setCustomTextMetricsProvider`), **dagre** + **@types/dagre** (new dep), **elkjs** (new dep, opt-in), `@modelcontextprotocol/sdk` (MCP), `zod` (MCP schemas).

**Global Prerequisites:**
- Environment: macOS/Linux, Node ≥18, Yarn (workspaces; this is a Yarn monorepo — do NOT use npm install).
- Tools: `node --version` (≥18), `yarn --version`, `git`.
- Access: No API keys needed for unit tests. Manual MCP smoke test needs a real `KINDRAW_TOKEN` (from `kindraw login` or env) and network access to `https://api.kindraw.dev`.
- State: Work from a clean tree on a feature branch. The repo default branch is `master`.

**Verification before starting:**
```bash
# Run ALL these from the repo root and verify output:
cd /Users/matheuskindrazki/development/crazy-ideas/kindraw
node --version          # Expected: v18.x or higher
yarn --version          # Expected: 1.22+ (classic) — this repo uses Yarn workspaces
git status              # Expected: clean working tree (or only intended changes)
git rev-parse --abbrev-ref HEAD  # note the branch; create a feature branch if on master
ls packages/kindraw-client/src/  # Expected: client.ts dom.ts generate.ts reanchor.ts reanchor.test.ts index.ts auth.ts ambient.d.ts
```

**Create the feature branch (if on master):**
```bash
git checkout -b feat/kindraw-scene-builder
```

---

## Verified Facts (read before planning tasks — these resolve the key uncertainties)

These were confirmed by reading the actual source. They are the foundation of the whole plan:

1. **`convertToExcalidrawElements` is exported from `@excalidraw/element`** (re-export in `packages/element/src/index.ts:96` → `./transform`). Signature (`packages/element/src/transform.ts`):
   ```ts
   convertToExcalidrawElements(
     elementsSkeleton: ExcalidrawElementSkeleton[] | null,
     opts?: { regenerateIds: boolean },
   ): ExcalidrawElement[]
   ```
2. **It needs DOM ONLY for text measurement.** It calls `measureText` → `getTextWidth` → `getLineWidth`, which lazily constructs a `CanvasTextMetricsProvider` that does `document.createElement("canvas")`. There is an escape hatch: `setCustomTextMetricsProvider(provider)` (exported from `@excalidraw/element`, re-export at `packages/element/src/index.ts:94` → `./textMeasurements`). The provider interface is `{ getLineWidth(text: string, fontString: FontString): number }`. **Setting a custom provider BEFORE the first `convertToExcalidrawElements` call removes the DOM requirement entirely.** No other `document`/`window`/`canvas` usage exists in `transform.ts` (verified by grep).
3. **The skeleton input shape** (from `packages/element/src/transform.ts`, `ExcalidrawElementSkeleton`, `ValidContainer`, `ValidLinearElement`):
   - Container with label: `{ type: "rectangle"|"diamond"|"ellipse", x, y, width?, height?, label?: { text, fontSize?, ... }, backgroundColor?, strokeColor?, strokeWidth?, strokeStyle?, fillStyle?, roundness?, id? }`
   - Arrow binding two existing nodes by id: `{ type: "arrow", x, y, start: { id: "<nodeId>" }, end: { id: "<nodeId>" }, label?: { text }, ... }`
   - Frame (group): `{ type: "frame", children: readonly string[], name?: string }`
   - Image: `{ type: "image", x, y, fileId, width?, height?, status?: "saved" }`
4. **The Worker route the client uses today** is `POST /v1/api/items:generate` (`workers/api/src/index.ts:1036-1083`). Body: `{ title?, folderId?, content }` where `content` is a serialized Excalidraw JSON string with an `elements` array. **`kind` is hard-coded to `"drawing"`** server-side; the caller cannot set it on this route. The Worker only does cheap structural validation (`JSON.parse`, `Array.isArray(parsed.elements)`).
5. **For docs (Phase 2): the generic `POST /v1/api/items` route exists** (`workers/api/src/index.ts:1021-1031`) and accepts `{ kind: "drawing"|"doc", title, folderId, content }`, returning `{ itemId, url }` with status 201. `content` for a doc is a markdown string (e.g. `"# Title\n\n"`). This route is NOT exposed in `@kindraw/client` today — that's the Phase 2 work.
6. **No public `/v1/api/*` route creates `hybrid` items.** Hybrid creation is `POST /api/hybrid-items` (note: NOT under `/v1`), body `{ title, folderId? }`, returns `{ hybridId, docItemId, drawingItemId }`. It auto-creates the doc (`# {title}\n\n`) and an empty drawing, then content is filled via the per-item content routes. **UNCERTAIN — see Phase 3 — verify whether the public API token is accepted on the non-`/v1` `/api/hybrid-items` route, or whether a new `/v1` route must be added to the Worker.**
7. **`reanchorArrows`** (`packages/kindraw-client/src/reanchor.ts`) already rewrites bound arrows to border-to-border straight lines using real node positions. The scene builder reuses it verbatim after `convertToExcalidrawElements`.
8. **vitest runs in `jsdom` environment** (`vitest.config.mts:59`). This means inside tests `document` exists, so `convertToExcalidrawElements` would work even without a custom provider — but we MUST still set a custom provider so the test exercises the production (DOM-free) path and so spacing invariants are deterministic. In `isTestEnv()` Excalidraw's own canvas provider returns `charCount * 10`; our custom provider must be used to keep numbers stable and DOM-free.
9. **Build config** (`packages/kindraw-client/build.mjs`): two entrypoints (`index`, `generate`). `jsdom`, `canvas`, `@excalidraw/mermaid-to-excalidraw` are kept `external`. `@excalidraw/*` workspace packages are bundled via an esbuild resolver alias. **The structured scene path does NOT need jsdom or the mermaid bundle** — it will be a NEW third entrypoint `scene` that does not import `./dom.js` or mermaid.

---

## Phase 1 — Canvas Quality: The Deterministic Scene Builder (MOST DETAILED)

Phase 1 is the priority. It is built test-first (TDD). The module layout under `packages/kindraw-client/src/scene/`:

- `types.ts` — the `DiagramSpec` contract (nodes, edges, groups, options).
- `textMetrics.ts` — DOM-free `TextMetricsProvider` + label sizing.
- `layout.ts` — dagre (default) / elk (opt-in) → positioned nodes.
- `build.ts` — orchestrates: measure → layout → skeleton → convert → reanchor → serialize.
- `index.ts` — public `buildScene(spec)` entry.
- Tests: `types.test.ts` (validation), `textMetrics.test.ts`, `layout.test.ts`, `build.test.ts`.

### Task 1: Add dependencies to @kindraw/client

**Files:**
- Modify: `packages/kindraw-client/package.json:27-35`

**Prerequisites:**
- Tools: Yarn workspaces. Run install from repo root.
- File must exist: `packages/kindraw-client/package.json`.

**Step 1: Add `dagre` and `elkjs` to dependencies and `@types/dagre` to devDependencies**

Edit `packages/kindraw-client/package.json` so the `dependencies` and `devDependencies` blocks read exactly:

```json
  "dependencies": {
    "@excalidraw/mermaid-to-excalidraw": "2.0.0-rc4",
    "canvas": "^3.0.0",
    "dagre": "^0.8.5",
    "elkjs": "^0.9.3",
    "jsdom": "^24.0.0"
  },
  "devDependencies": {
    "@types/dagre": "^0.7.52",
    "@types/jsdom": "28.0.3",
    "esbuild": "^0.21.0"
  }
```

**Step 2: Install from the repo root**

Run: `cd /Users/matheuskindrazki/development/crazy-ideas/kindraw && yarn install`

**Expected output:** Yarn resolves and links `dagre`, `elkjs`, `@types/dagre` without errors. Last line resembles `Done in N.NNs.` or `success Saved lockfile.`

**If you see different output:** If yarn complains about an unknown version, run `yarn info dagre versions` / `yarn info elkjs versions` and pick the latest matching the caret range. `dagre@0.8.5`, `elkjs@0.9.3`, `@types/dagre@0.7.52` are known-good as of this plan.

**Step 3: Commit**

```bash
git add packages/kindraw-client/package.json yarn.lock
git commit -m "build(kindraw-client): add dagre, elkjs, @types/dagre deps"
```

**If Task Fails:**
1. **`yarn install` errors on lockfile:** Run `git checkout -- yarn.lock` and re-run `yarn install` (regenerates cleanly).
2. **Network blocked:** Document and STOP — deps are mandatory; cannot proceed offline.
3. **Can't recover:** `git checkout -- packages/kindraw-client/package.json`, return to human.

---

### Task 2: Write the failing test for the DiagramSpec types & validation

**Files:**
- Create: `packages/kindraw-client/src/scene/spec.ts` (empty placeholder so the import resolves — see Step 3)
- Create: `packages/kindraw-client/src/scene/spec.test.ts`

**Prerequisites:**
- Tools: vitest (run via `yarn test`). Files must exist: `vitest.config.mts` at repo root.
- Mirror the style of `packages/kindraw-client/src/reanchor.test.ts`.

**Step 1: Write the failing test**

Create `packages/kindraw-client/src/scene/spec.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { validateDiagramSpec } from "./spec";

describe("validateDiagramSpec", () => {
  it("accepts a minimal valid spec", () => {
    const spec = {
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "a", to: "b" }],
    };
    expect(() => validateDiagramSpec(spec)).not.toThrow();
  });

  it("rejects a spec with no nodes", () => {
    expect(() => validateDiagramSpec({ nodes: [], edges: [] })).toThrow(
      /at least one node/i,
    );
  });

  it("rejects duplicate node ids", () => {
    expect(() =>
      validateDiagramSpec({
        nodes: [
          { id: "x", label: "X" },
          { id: "x", label: "X2" },
        ],
        edges: [],
      }),
    ).toThrow(/duplicate node id/i);
  });

  it("rejects an edge referencing an unknown node", () => {
    expect(() =>
      validateDiagramSpec({
        nodes: [{ id: "a", label: "A" }],
        edges: [{ from: "a", to: "ghost" }],
      }),
    ).toThrow(/unknown node/i);
  });

  it("rejects an invalid shape", () => {
    expect(() =>
      validateDiagramSpec({
        nodes: [{ id: "a", label: "A", shape: "octagon" }],
        edges: [],
      }),
    ).toThrow(/shape/i);
  });

  it("returns a normalized spec with defaults applied", () => {
    const out = validateDiagramSpec({
      nodes: [{ id: "a", label: "A" }],
      edges: [],
    });
    expect(out.direction).toBe("TB");
    expect(out.nodes[0].shape).toBe("rectangle");
  });
});
```

**Step 2: Create an empty placeholder so the import resolves**

Create `packages/kindraw-client/src/scene/spec.ts` with a single line so vitest can import it and fail on the missing export (not a module-not-found):

```ts
export {};
```

**Step 3: Run the test to verify it fails**

Run: `cd /Users/matheuskindrazki/development/crazy-ideas/kindraw && yarn vitest run packages/kindraw-client/src/scene/spec.test.ts`

**Expected output:** All cases fail because `validateDiagramSpec` is not exported. Look for:
```
Error: ... does not provide an export named 'validateDiagramSpec'
```
or test failures referencing `validateDiagramSpec is not a function`.

**If you see "Cannot find module":** You created the test in the wrong directory. Confirm path is `packages/kindraw-client/src/scene/spec.test.ts`.

**Step 4: Commit the RED state**

```bash
git add packages/kindraw-client/src/scene/spec.test.ts packages/kindraw-client/src/scene/spec.ts
git commit -m "test(kindraw-client): failing spec validation tests (RED)"
```

**If Task Fails:**
1. **vitest can't find the config:** Always run from repo root, not the package dir.
2. **Rollback:** `git checkout -- .` and recreate.

---

### Task 3: Implement DiagramSpec types + validation (make Task 2 green)

**Files:**
- Modify: `packages/kindraw-client/src/scene/spec.ts`

**Prerequisites:** Task 2 committed (failing tests exist).

**Step 1: Implement the spec types and `validateDiagramSpec`**

Replace the entire contents of `packages/kindraw-client/src/scene/spec.ts` with:

```ts
// The structured diagram contract. This is the PRIMARY input format for the
// scene builder: a graph of nodes + edges (+ optional groups), independent of
// Excalidraw's internal element shape. Claude (the MCP client) composes one of
// these; the builder turns it into a laid-out Excalidraw scene.

export type NodeShape = "rectangle" | "diamond" | "ellipse";

export type Direction = "TB" | "BT" | "LR" | "RL";

export type DiagramNode = {
  id: string;
  label: string;
  shape?: NodeShape;
  /** Group/frame id this node belongs to (optional). */
  group?: string;
  /** Excalidraw stroke color, e.g. "#1971c2". */
  strokeColor?: string;
  /** Excalidraw fill color, e.g. "#a5d8ff". */
  backgroundColor?: string;
};

export type DiagramEdge = {
  from: string;
  to: string;
  label?: string;
  /** Visual style of the connector. */
  style?: "solid" | "dashed" | "dotted";
};

export type DiagramGroup = {
  id: string;
  label?: string;
};

export type DiagramSpec = {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups?: DiagramGroup[];
  /** Layout direction. Default "TB" (top-to-bottom). */
  direction?: Direction;
  /** Layout engine. "dagre" (default, fast/sync) or "elk" (orthogonal routing). */
  engine?: "dagre" | "elk";
};

// A spec with all defaults applied. The builder works on this normalized form.
export type NormalizedSpec = Required<
  Pick<DiagramSpec, "direction" | "engine">
> & {
  nodes: Array<Required<Pick<DiagramNode, "id" | "label" | "shape">> & DiagramNode>;
  edges: DiagramEdge[];
  groups: DiagramGroup[];
};

const VALID_SHAPES: ReadonlySet<string> = new Set([
  "rectangle",
  "diamond",
  "ellipse",
]);
const VALID_DIRECTIONS: ReadonlySet<string> = new Set([
  "TB",
  "BT",
  "LR",
  "RL",
]);

/**
 * Validate and normalize a raw DiagramSpec. Throws a descriptive Error on any
 * structural problem. Returns a NormalizedSpec with defaults applied.
 */
export const validateDiagramSpec = (raw: unknown): NormalizedSpec => {
  if (!raw || typeof raw !== "object") {
    throw new Error("DiagramSpec must be an object.");
  }
  const spec = raw as DiagramSpec;

  if (!Array.isArray(spec.nodes) || spec.nodes.length === 0) {
    throw new Error("DiagramSpec must have at least one node.");
  }
  if (!Array.isArray(spec.edges)) {
    throw new Error("DiagramSpec.edges must be an array.");
  }

  const ids = new Set<string>();
  for (const node of spec.nodes) {
    if (!node || typeof node.id !== "string" || node.id.length === 0) {
      throw new Error("Every node must have a non-empty string id.");
    }
    if (ids.has(node.id)) {
      throw new Error(`Duplicate node id: "${node.id}".`);
    }
    ids.add(node.id);
    if (typeof node.label !== "string") {
      throw new Error(`Node "${node.id}" must have a string label.`);
    }
    if (node.shape !== undefined && !VALID_SHAPES.has(node.shape)) {
      throw new Error(
        `Node "${node.id}" has invalid shape "${node.shape}". ` +
          `Allowed: rectangle, diamond, ellipse.`,
      );
    }
  }

  for (const edge of spec.edges) {
    if (!edge || typeof edge.from !== "string" || typeof edge.to !== "string") {
      throw new Error("Every edge must have string `from` and `to`.");
    }
    if (!ids.has(edge.from)) {
      throw new Error(`Edge references unknown node "${edge.from}".`);
    }
    if (!ids.has(edge.to)) {
      throw new Error(`Edge references unknown node "${edge.to}".`);
    }
  }

  if (
    spec.direction !== undefined &&
    !VALID_DIRECTIONS.has(spec.direction)
  ) {
    throw new Error(
      `Invalid direction "${spec.direction}". Allowed: TB, BT, LR, RL.`,
    );
  }
  if (spec.engine !== undefined && spec.engine !== "dagre" && spec.engine !== "elk") {
    throw new Error(`Invalid engine "${spec.engine}". Allowed: dagre, elk.`);
  }

  return {
    direction: spec.direction ?? "TB",
    engine: spec.engine ?? "dagre",
    nodes: spec.nodes.map((n) => ({
      ...n,
      shape: n.shape ?? "rectangle",
    })),
    edges: spec.edges,
    groups: spec.groups ?? [],
  };
};
```

**Step 2: Run the test to verify it passes**

Run: `cd /Users/matheuskindrazki/development/crazy-ideas/kindraw && yarn vitest run packages/kindraw-client/src/scene/spec.test.ts`

**Expected output:**
```
✓ packages/kindraw-client/src/scene/spec.test.ts (6 tests)
Test Files  1 passed (1)
     Tests  6 passed (6)
```

**Step 3: Commit (GREEN)**

```bash
git add packages/kindraw-client/src/scene/spec.ts
git commit -m "feat(kindraw-client): DiagramSpec types + validation (GREEN)"
```

**If Task Fails:**
1. **A case still fails:** Read the assertion message; the regex in the test (`/duplicate node id/i`, etc.) must match your thrown message substring. Adjust the thrown text, not the test.
2. **Rollback:** `git checkout -- packages/kindraw-client/src/scene/spec.ts` (keeps the test).

---

### Task 4: Write the failing test for the DOM-free text metrics provider

**Files:**
- Create: `packages/kindraw-client/src/scene/textMetrics.ts` (placeholder)
- Create: `packages/kindraw-client/src/scene/textMetrics.test.ts`

**Prerequisites:** Task 3 committed.

**Step 1: Write the failing test**

Create `packages/kindraw-client/src/scene/textMetrics.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { NodeTextMetricsProvider, measureLabel } from "./textMetrics";

describe("NodeTextMetricsProvider", () => {
  it("returns a positive width proportional to text length", () => {
    const provider = new NodeTextMetricsProvider();
    const font = "20px Virgil, Segoe UI Emoji";
    const short = provider.getLineWidth("Hi", font);
    const long = provider.getLineWidth("Hello world, this is long", font);
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
  });

  it("is deterministic for identical input", () => {
    const provider = new NodeTextMetricsProvider();
    const font = "20px Virgil";
    expect(provider.getLineWidth("Service", font)).toBe(
      provider.getLineWidth("Service", font),
    );
  });
});

describe("measureLabel", () => {
  it("sizes a node big enough to contain its label with padding", () => {
    const { width, height } = measureLabel("Authentication Service", 20);
    // Multi-character label → comfortably wider than tall, with padding.
    expect(width).toBeGreaterThan(100);
    expect(height).toBeGreaterThanOrEqual(40);
  });

  it("enforces a sensible minimum size for short labels", () => {
    const { width, height } = measureLabel("X", 20);
    expect(width).toBeGreaterThanOrEqual(60);
    expect(height).toBeGreaterThanOrEqual(40);
  });
});
```

**Step 2: Create placeholder**

Create `packages/kindraw-client/src/scene/textMetrics.ts`:

```ts
export {};
```

**Step 3: Run to verify it fails**

Run: `cd /Users/matheuskindrazki/development/crazy-ideas/kindraw && yarn vitest run packages/kindraw-client/src/scene/textMetrics.test.ts`

**Expected output:** Failure: `does not provide an export named 'NodeTextMetricsProvider'` (and `measureLabel`).

**Step 4: Commit (RED)**

```bash
git add packages/kindraw-client/src/scene/textMetrics.test.ts packages/kindraw-client/src/scene/textMetrics.ts
git commit -m "test(kindraw-client): failing text metrics tests (RED)"
```

**If Task Fails:** `git checkout -- .` and recreate at the exact paths.

---

### Task 5: Implement the DOM-free text metrics provider (make Task 4 green)

**Files:**
- Modify: `packages/kindraw-client/src/scene/textMetrics.ts`

**Prerequisites:** Task 4 committed.

**Note on approach:** We avoid jsdom entirely. We use the `canvas` npm package (already a dependency) for accurate text measurement when available, and fall back to a per-character heuristic so the module never throws in a constrained environment. The provider is also what we register via `setCustomTextMetricsProvider` so `convertToExcalidrawElements` never reaches for `document`.

**Step 1: Implement**

Replace the entire contents of `packages/kindraw-client/src/scene/textMetrics.ts` with:

```ts
// DOM-free text measurement for the scene builder.
//
// `convertToExcalidrawElements` from @excalidraw/element measures label text to
// size containers. By default it does `document.createElement("canvas")`, which
// is not available in plain Node. We provide a TextMetricsProvider that uses the
// `canvas` npm package (real font metrics) when it loads, and a deterministic
// per-character fallback otherwise. Register it via setCustomTextMetricsProvider
// BEFORE the first convertToExcalidrawElements call (see build.ts).

import type { TextMetricsProvider } from "@excalidraw/element";

// Lazily-created node-canvas 2d context, shared across measurements.
let nodeCanvasCtx:
  | { measureText: (t: string) => { width: number }; font: string }
  | null
  | undefined;

const getNodeCanvasCtx = () => {
  if (nodeCanvasCtx !== undefined) {
    return nodeCanvasCtx;
  }
  try {
    // `canvas` is a dependency of this package. require() keeps this synchronous
    // so the provider can satisfy the synchronous getLineWidth contract.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createCanvas } = require("canvas") as {
      createCanvas: (w: number, h: number) => {
        getContext: (t: "2d") => {
          measureText: (t: string) => { width: number };
          font: string;
        };
      };
    };
    nodeCanvasCtx = createCanvas(10, 10).getContext("2d");
  } catch {
    nodeCanvasCtx = null; // canvas unavailable → use fallback
  }
  return nodeCanvasCtx;
};

// Average glyph width as a fraction of font size, for the fallback path. Tuned
// to roughly match a sans/handwritten font so layout spacing stays sane.
const AVG_CHAR_RATIO = 0.55;

const parseFontSize = (fontString: string): number => {
  // fontString looks like "20px Virgil, Segoe UI Emoji".
  const match = /(\d+(\.\d+)?)px/.exec(fontString);
  return match ? parseFloat(match[1]) : 16;
};

export class NodeTextMetricsProvider implements TextMetricsProvider {
  getLineWidth(text: string, fontString: string): number {
    const ctx = getNodeCanvasCtx();
    if (ctx) {
      ctx.font = fontString;
      const w = ctx.measureText(text).width;
      if (w > 0) {
        return w;
      }
    }
    // Fallback: deterministic, font-size-aware per-character estimate.
    const fontSize = parseFontSize(fontString);
    return Math.max(1, text.length) * fontSize * AVG_CHAR_RATIO;
  }
}

// Padding around a label inside its container (matches Excalidraw's feel).
const LABEL_PADDING_X = 30;
const LABEL_PADDING_Y = 20;
const MIN_NODE_WIDTH = 60;
const MIN_NODE_HEIGHT = 40;
const LINE_HEIGHT_RATIO = 1.25;

const sharedProvider = new NodeTextMetricsProvider();

/**
 * Measure the box needed to contain `label` at `fontSize`, including padding and
 * enforcing minimums. Multi-line labels (\n) are supported. DOM-free.
 */
export const measureLabel = (
  label: string,
  fontSize: number,
): { width: number; height: number } => {
  const fontString = `${fontSize}px Virgil, Segoe UI Emoji`;
  const lines = (label.length ? label : " ").split("\n");
  let maxWidth = 0;
  for (const line of lines) {
    maxWidth = Math.max(
      maxWidth,
      sharedProvider.getLineWidth(line || " ", fontString),
    );
  }
  const width = Math.max(MIN_NODE_WIDTH, Math.ceil(maxWidth) + LABEL_PADDING_X);
  const height = Math.max(
    MIN_NODE_HEIGHT,
    Math.ceil(lines.length * fontSize * LINE_HEIGHT_RATIO) + LABEL_PADDING_Y,
  );
  return { width, height };
};
```

**Step 2: Run to verify it passes**

Run: `cd /Users/matheuskindrazki/development/crazy-ideas/kindraw && yarn vitest run packages/kindraw-client/src/scene/textMetrics.test.ts`

**Expected output:**
```
✓ packages/kindraw-client/src/scene/textMetrics.test.ts (4 tests)
     Tests  4 passed (4)
```

**If you see a type error about `TextMetricsProvider`:** Confirm the import path. `TextMetricsProvider` is exported from `@excalidraw/element` (re-export of `textMeasurements.ts`). If `yarn vitest` can't resolve the type, ensure the vitest alias in `vitest.config.mts` maps `@excalidraw/element` to `packages/element/src/index.ts` (it does — lines 17-23). Types resolve at runtime through vitest's alias.

**If `require("canvas")` triggers an ESLint/TS error in this ESM file:** This file is bundled by esbuild (Task 14) where `require` is shimmed for CJS interop; for the TS check, add `import { createRequire } from "node:module"; const require = createRequire(import.meta.url);` at the top instead of relying on a global `require`. Prefer the `createRequire` form to avoid relying on a global. (Adjust the implementation accordingly.)

**Step 3: Commit (GREEN)**

```bash
git add packages/kindraw-client/src/scene/textMetrics.ts
git commit -m "feat(kindraw-client): DOM-free text metrics provider (GREEN)"
```

**If Task Fails:**
1. **`require` undefined under TS/ESM:** Use the `createRequire` form noted above.
2. **Width is 0 in fallback:** Ensure `AVG_CHAR_RATIO * fontSize * length` is used; check `parseFontSize` regex.
3. **Rollback:** `git checkout -- packages/kindraw-client/src/scene/textMetrics.ts`.

---

### Task 6: Write the failing test for the layout engine (spacing invariants)

**Files:**
- Create: `packages/kindraw-client/src/scene/layout.ts` (placeholder)
- Create: `packages/kindraw-client/src/scene/layout.test.ts`

**Prerequisites:** Task 5 committed. `dagre` installed (Task 1).

**Step 1: Write the failing test — these are the core spacing invariants**

Create `packages/kindraw-client/src/scene/layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { layoutNodes } from "./layout";
import { validateDiagramSpec } from "./spec";

// Two boxes overlap if they intersect on BOTH axes.
const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

const chainSpec = (n: number) =>
  validateDiagramSpec({
    nodes: Array.from({ length: n }, (_, i) => ({
      id: `n${i}`,
      label: `Node ${i}`,
    })),
    edges: Array.from({ length: n - 1 }, (_, i) => ({
      from: `n${i}`,
      to: `n${i + 1}`,
    })),
  });

describe("layoutNodes (dagre)", () => {
  it("produces no overlapping nodes", () => {
    const spec = chainSpec(5);
    const placed = layoutNodes(spec);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(overlaps(placed[i], placed[j])).toBe(false);
      }
    }
  });

  it("separates ranks vertically for direction TB", () => {
    const spec = chainSpec(3);
    const placed = layoutNodes(spec);
    const byId = new Map(placed.map((p) => [p.id, p]));
    // In TB, each downstream node sits strictly below its predecessor.
    expect(byId.get("n1")!.y).toBeGreaterThan(byId.get("n0")!.y);
    expect(byId.get("n2")!.y).toBeGreaterThan(byId.get("n1")!.y);
  });

  it("lays out left-to-right for direction LR", () => {
    const spec = validateDiagramSpec({
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "a", to: "b" }],
      direction: "LR",
    });
    const placed = layoutNodes(spec);
    const byId = new Map(placed.map((p) => [p.id, p]));
    expect(byId.get("b")!.x).toBeGreaterThan(byId.get("a")!.x);
  });

  it("is deterministic: same spec → identical positions", () => {
    const spec = chainSpec(4);
    const a = layoutNodes(spec);
    const b = layoutNodes(spec);
    expect(a).toEqual(b);
  });

  it("gives every node a measured non-trivial size", () => {
    const spec = chainSpec(2);
    const placed = layoutNodes(spec);
    for (const p of placed) {
      expect(p.width).toBeGreaterThanOrEqual(60);
      expect(p.height).toBeGreaterThanOrEqual(40);
    }
  });
});
```

**Step 2: Create placeholder**

Create `packages/kindraw-client/src/scene/layout.ts`:

```ts
export {};
```

**Step 3: Run to verify it fails**

Run: `cd /Users/matheuskindrazki/development/crazy-ideas/kindraw && yarn vitest run packages/kindraw-client/src/scene/layout.test.ts`

**Expected output:** Failure: `does not provide an export named 'layoutNodes'`.

**Step 4: Commit (RED)**

```bash
git add packages/kindraw-client/src/scene/layout.test.ts packages/kindraw-client/src/scene/layout.ts
git commit -m "test(kindraw-client): failing layout spacing invariants (RED)"
```

**If Task Fails:** `git checkout -- .` and recreate.

---

### Task 7: Implement the dagre layout engine (make Task 6 green)

**Files:**
- Modify: `packages/kindraw-client/src/scene/layout.ts`

**Prerequisites:** Task 6 committed.

**Step 1: Implement dagre layout (elk is added later in Task 8)**

Replace the entire contents of `packages/kindraw-client/src/scene/layout.ts` with:

```ts
// Layout engine: turns a NormalizedSpec into positioned nodes with real
// spacing. dagre is the default (synchronous, no DOM). elk is opt-in (added
// in a later task) for orthogonal routing on complex architecture diagrams.

import dagre from "dagre";

import { measureLabel } from "./textMetrics.js";
import type { NormalizedSpec } from "./spec.js";

export type PlacedNode = {
  id: string;
  label: string;
  shape: NormalizedSpec["nodes"][number]["shape"];
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor?: string;
  backgroundColor?: string;
  group?: string;
};

// Default font size used to measure labels. Matches Excalidraw's medium size.
const LABEL_FONT_SIZE = 20;

// Generous separations so the canvas never looks cramped (the whole point).
const RANK_SEP = 80; // distance between ranks (along layout direction)
const NODE_SEP = 60; // distance between nodes in the same rank
const EDGE_SEP = 40;

/**
 * Run dagre and return positioned nodes. Node x/y are TOP-LEFT corners (dagre
 * gives centers; we convert). Deterministic for a given spec.
 */
export const layoutWithDagre = (spec: NormalizedSpec): PlacedNode[] => {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({
    rankdir: spec.direction,
    ranksep: RANK_SEP,
    nodesep: NODE_SEP,
    edgesep: EDGE_SEP,
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const sized = new Map<string, { width: number; height: number }>();
  for (const node of spec.nodes) {
    const { width, height } = measureLabel(node.label, LABEL_FONT_SIZE);
    sized.set(node.id, { width, height });
    g.setNode(node.id, { width, height });
  }
  spec.edges.forEach((edge, i) => {
    // Unique name keeps multigraph edges distinct & deterministic.
    g.setEdge(edge.from, edge.to, {}, `e${i}`);
  });

  dagre.layout(g);

  return spec.nodes.map((node) => {
    const pos = g.node(node.id);
    const size = sized.get(node.id)!;
    return {
      id: node.id,
      label: node.label,
      shape: node.shape,
      // dagre pos.x/pos.y are centers; convert to top-left.
      x: Math.round(pos.x - size.width / 2),
      y: Math.round(pos.y - size.height / 2),
      width: size.width,
      height: size.height,
      strokeColor: node.strokeColor,
      backgroundColor: node.backgroundColor,
      group: node.group,
    };
  });
};

/**
 * Public layout entry. Dispatches to the configured engine. (elk added later.)
 */
export const layoutNodes = (spec: NormalizedSpec): PlacedNode[] => {
  // elk is async + opt-in; for the sync API we only support dagre here. The
  // async elk path is exposed separately (layoutNodesAsync) in a later task.
  return layoutWithDagre(spec);
};
```

**Step 2: Run to verify it passes**

Run: `cd /Users/matheuskindrazki/development/crazy-ideas/kindraw && yarn vitest run packages/kindraw-client/src/scene/layout.test.ts`

**Expected output:**
```
✓ packages/kindraw-client/src/scene/layout.test.ts (5 tests)
     Tests  5 passed (5)
```

**If the "deterministic" test fails:** dagre can be deterministic but ensure you pass a fixed edge name (`e${i}`) and do not rely on object key ordering. If it still varies, sort `spec.nodes`/`spec.edges` by id before adding to the graph.

**If "no overlap" fails:** Increase `NODE_SEP`/`RANK_SEP`, or verify you converted center→top-left correctly (a common bug is forgetting the `- size/2`).

**Step 3: Commit (GREEN)**

```bash
git add packages/kindraw-client/src/scene/layout.ts
git commit -m "feat(kindraw-client): dagre layout with real spacing (GREEN)"
```

**If Task Fails:**
1. **`Cannot find module 'dagre'`:** Re-run `yarn install` (Task 1 not completed).
2. **`dagre.graphlib` undefined:** Some dagre builds export graphlib differently; use `import dagre from "dagre";` then `dagre.graphlib.Graph`. If TS complains, the `@types/dagre` package provides the namespace. If still failing, `import * as dagre from "dagre";`.
3. **Rollback:** `git checkout -- packages/kindraw-client/src/scene/layout.ts`.

---

### Task 8: Add the opt-in elkjs engine (async) behind the flag

**Files:**
- Modify: `packages/kindraw-client/src/scene/layout.ts`
- Create: `packages/kindraw-client/src/scene/layout.elk.test.ts`

**Prerequisites:** Task 7 committed. `elkjs` installed (Task 1).

**Step 1: Write the failing test for the elk path**

Create `packages/kindraw-client/src/scene/layout.elk.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { layoutNodesAsync } from "./layout";
import { validateDiagramSpec } from "./spec";

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

describe("layoutNodesAsync (elk engine)", () => {
  it("produces non-overlapping positioned nodes via elk", async () => {
    const spec = validateDiagramSpec({
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "c", label: "C" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "a", to: "c" },
      ],
      engine: "elk",
    });
    const placed = await layoutNodesAsync(spec);
    expect(placed).toHaveLength(3);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(overlaps(placed[i], placed[j])).toBe(false);
      }
    }
  });

  it("falls back to dagre when engine is dagre", async () => {
    const spec = validateDiagramSpec({
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "a", to: "b" }],
      engine: "dagre",
    });
    const placed = await layoutNodesAsync(spec);
    expect(placed).toHaveLength(2);
  });
});
```

**Step 2: Run to confirm it fails**

Run: `cd /Users/matheuskindrazki/development/crazy-ideas/kindraw && yarn vitest run packages/kindraw-client/src/scene/layout.elk.test.ts`

**Expected output:** Failure: `does not provide an export named 'layoutNodesAsync'`.

**Step 3: Add the elk engine + async dispatcher to `layout.ts`**

Append to `packages/kindraw-client/src/scene/layout.ts` (after `layoutNodes`):

```ts
/**
 * elk layout (async). Orthogonal-friendly routing for complex diagrams.
 * Opt-in via spec.engine === "elk". Returns the same PlacedNode[] contract.
 */
export const layoutWithElk = async (
  spec: NormalizedSpec,
): Promise<PlacedNode[]> => {
  // elkjs is heavy; import it lazily so dagre-only callers don't pay for it.
  const ELK = (await import("elkjs")).default;
  const elk = new ELK();

  const sized = new Map<string, { width: number; height: number }>();
  const children = spec.nodes.map((node) => {
    const { width, height } = measureLabel(node.label, LABEL_FONT_SIZE);
    sized.set(node.id, { width, height });
    return { id: node.id, width, height };
  });

  const elkDirection =
    spec.direction === "LR"
      ? "RIGHT"
      : spec.direction === "RL"
        ? "LEFT"
        : spec.direction === "BT"
          ? "UP"
          : "DOWN";

  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": elkDirection,
      "elk.layered.spacing.nodeNodeBetweenLayers": String(RANK_SEP),
      "elk.spacing.nodeNode": String(NODE_SEP),
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children,
    edges: spec.edges.map((edge, i) => ({
      id: `e${i}`,
      sources: [edge.from],
      targets: [edge.to],
    })),
  };

  const laid = (await elk.layout(graph)) as {
    children?: Array<{ id: string; x?: number; y?: number }>;
  };
  const posById = new Map(
    (laid.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]),
  );

  return spec.nodes.map((node) => {
    const size = sized.get(node.id)!;
    const pos = posById.get(node.id) ?? { x: 0, y: 0 };
    return {
      id: node.id,
      label: node.label,
      shape: node.shape,
      x: Math.round(pos.x), // elk already returns top-left corners
      y: Math.round(pos.y),
      width: size.width,
      height: size.height,
      strokeColor: node.strokeColor,
      backgroundColor: node.backgroundColor,
      group: node.group,
    };
  });
};

/**
 * Async layout entry: dispatches to elk when requested, else dagre.
 */
export const layoutNodesAsync = async (
  spec: NormalizedSpec,
): Promise<PlacedNode[]> => {
  if (spec.engine === "elk") {
    return layoutWithElk(spec);
  }
  return layoutWithDagre(spec);
};
```

**Step 4: Run to verify it passes**

Run: `cd /Users/matheuskindrazki/development/crazy-ideas/kindraw && yarn vitest run packages/kindraw-client/src/scene/layout.elk.test.ts`

**Expected output:**
```
✓ packages/kindraw-client/src/scene/layout.elk.test.ts (2 tests)
     Tests  2 passed (2)
```

**If elk import fails under vitest:** `elkjs` ships an ESM build at `elkjs` and a worker build; `(await import("elkjs")).default` is the main API. If `.default` is undefined, try `const ELK = (await import("elkjs/lib/elk.bundled.js")).default;`. Note this for Task 14 (esbuild must keep `elkjs` external).

**Step 5: Commit (GREEN)**

```bash
git add packages/kindraw-client/src/scene/layout.ts packages/kindraw-client/src/scene/layout.elk.test.ts
git commit -m "feat(kindraw-client): opt-in elkjs orthogonal layout (GREEN)"
```

**If Task Fails:**
1. **elk hangs/timeouts:** elkjs in Node may spawn a web worker; if so, force the sync build per the note above. Add a 5s vitest timeout if needed but prefer the bundled import.
2. **Rollback:** `git checkout -- packages/kindraw-client/src/scene/layout.ts packages/kindraw-client/src/scene/layout.elk.test.ts`.

---

### Task 9: Run Code Review (Batch 1: spec + metrics + layout)

1. **Dispatch all 3 reviewers in parallel:**
   - REQUIRED SUB-SKILL: Use ring:requesting-code-review
   - Run ring:code-reviewer, ring:business-logic-reviewer, ring:security-reviewer simultaneously against the diff so far (Tasks 1-8).
   - Wait for all to complete.

2. **Handle findings by severity (MANDATORY):**
   - **Critical/High/Medium:** Fix immediately (no TODO comments). Re-run all 3 reviewers after fixes. Repeat until zero remain. Focus areas to expect: input validation completeness in `validateDiagramSpec` (untrusted spec from an LLM — make sure no prototype-pollution via `group`/`id` keys, no unbounded node counts), determinism of dagre, and the `require("canvas")` interop.
   - **Low:** Add `TODO(review): [desc] (reported by [reviewer] on 2026-06-16, severity: Low)` at the location.
   - **Cosmetic:** Add `FIXME(nitpick): [desc] (reported by [reviewer] on 2026-06-16, severity: Cosmetic)`.

3. **Proceed only when** zero Critical/High/Medium remain and Low/Cosmetic are annotated.

**Suggested guard to add if not already present (Medium, likely flagged):** Cap node/edge counts in `validateDiagramSpec` to avoid pathological inputs, e.g.:
```ts
if (spec.nodes.length > 500) {
  throw new Error("DiagramSpec is too large (max 500 nodes).");
}
```
Add a matching test in `spec.test.ts` if you add this guard.

---

### Task 10: Write the failing test for the scene builder (end-to-end, DOM-free)

**Files:**
- Create: `packages/kindraw-client/src/scene/build.ts` (placeholder)
- Create: `packages/kindraw-client/src/scene/build.test.ts`

**Prerequisites:** Task 9 complete (batch reviewed).

**Step 1: Write the failing test — this asserts the full output contract & invariants**

Create `packages/kindraw-client/src/scene/build.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildScene } from "./build";

// Helper to extract a node element by its label text (bound text container).
const nodeBoxes = (elements: any[]) =>
  elements.filter((e) =>
    ["rectangle", "diamond", "ellipse"].includes(e.type),
  );

describe("buildScene", () => {
  it("returns a valid excalidraw envelope with the right element kinds", async () => {
    const { content, elementCount } = await buildScene({
      nodes: [
        { id: "a", label: "Client", shape: "rectangle" },
        { id: "b", label: "API", shape: "rectangle" },
        { id: "c", label: "Database", shape: "ellipse" },
      ],
      edges: [
        { from: "a", to: "b", label: "HTTP" },
        { from: "b", to: "c" },
      ],
    });

    const parsed = JSON.parse(content);
    expect(parsed.type).toBe("excalidraw");
    expect(parsed.version).toBe(2);
    expect(Array.isArray(parsed.elements)).toBe(true);
    expect(elementCount).toBeGreaterThan(0);

    const boxes = nodeBoxes(parsed.elements);
    // 3 node shapes present.
    expect(boxes.length).toBe(3);
    // At least 2 arrows present.
    expect(
      parsed.elements.filter((e: any) => e.type === "arrow").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("produces non-overlapping node boxes (real spacing)", async () => {
    const { content } = await buildScene({
      nodes: [
        { id: "n0", label: "Alpha" },
        { id: "n1", label: "Beta" },
        { id: "n2", label: "Gamma" },
      ],
      edges: [
        { from: "n0", to: "n1" },
        { from: "n1", to: "n2" },
      ],
    });
    const boxes = nodeBoxes(JSON.parse(content).elements);
    const overlaps = (a: any, b: any) =>
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(overlaps(boxes[i], boxes[j])).toBe(false);
      }
    }
  });

  it("binds arrows to their endpoint nodes (border-to-border)", async () => {
    const { content } = await buildScene({
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "a", to: "b" }],
    });
    const elements = JSON.parse(content).elements;
    const arrow = elements.find((e: any) => e.type === "arrow");
    expect(arrow).toBeTruthy();
    expect(arrow.startBinding?.elementId).toBeTruthy();
    expect(arrow.endBinding?.elementId).toBeTruthy();
    // After reanchor, the arrow is a straight 2-point segment.
    expect(arrow.points.length).toBe(2);
  });

  it("is deterministic: same spec → identical serialized content", async () => {
    const spec = {
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      edges: [{ from: "a", to: "b" }],
    };
    const first = await buildScene(spec);
    const second = await buildScene(spec);
    expect(first.content).toBe(second.content);
  });
});
```

**Step 2: Create placeholder**

Create `packages/kindraw-client/src/scene/build.ts`:

```ts
export {};
```

**Step 3: Run to confirm it fails**

Run: `cd /Users/matheuskindrazki/development/crazy-ideas/kindraw && yarn vitest run packages/kindraw-client/src/scene/build.test.ts`

**Expected output:** Failure: `does not provide an export named 'buildScene'`.

**Step 4: Commit (RED)**

```bash
git add packages/kindraw-client/src/scene/build.test.ts packages/kindraw-client/src/scene/build.ts
git commit -m "test(kindraw-client): failing scene builder e2e tests (RED)"
```

**Note on determinism:** `convertToExcalidrawElements` with `{ regenerateIds: true }` produces random ids, which would break the "identical serialized content" test. The implementation in Task 11 MUST pass `{ regenerateIds: false }` and provide stable ids in the skeleton, OR seed/strip ids before serialization. The plan uses stable skeleton ids + `regenerateIds: false`. If Excalidraw still injects randomness (seed/versionNonce), the build step normalizes those (see Task 11, Step 1).

**If Task Fails:** `git checkout -- .` and recreate at exact paths.

---

### Task 11: Implement the scene builder (make Task 10 green)

**Files:**
- Modify: `packages/kindraw-client/src/scene/build.ts`

**Prerequisites:** Task 10 committed.

**Step 1: Implement the full pipeline**

Replace the entire contents of `packages/kindraw-client/src/scene/build.ts` with:

```ts
// The deterministic scene builder. Pipeline:
//   spec → validate/normalize → layout (dagre/elk) → skeleton →
//   convertToExcalidrawElements → reanchor arrows → serialize.
//
// DOM-free: we register a custom text metrics provider so
// convertToExcalidrawElements never reaches for document.createElement.

import {
  convertToExcalidrawElements,
  setCustomTextMetricsProvider,
} from "@excalidraw/element";

import { reanchorArrows } from "../reanchor.js";
import { layoutNodesAsync, type PlacedNode } from "./layout.js";
import { NodeTextMetricsProvider } from "./textMetrics.js";
import { validateDiagramSpec, type DiagramSpec } from "./spec.js";

export type BuildResult = {
  content: string; // serialized .excalidraw JSON string
  elementCount: number;
};

// Register the DOM-free provider exactly once, before any conversion.
let providerInstalled = false;
const ensureProvider = () => {
  if (!providerInstalled) {
    setCustomTextMetricsProvider(new NodeTextMetricsProvider());
    providerInstalled = true;
  }
};

const LABEL_FONT_SIZE = 20;

// Map our edge style to Excalidraw strokeStyle.
const STROKE_STYLE = {
  solid: "solid",
  dashed: "dashed",
  dotted: "dotted",
} as const;

const toSkeleton = (placed: PlacedNode[], spec: ReturnType<typeof validateDiagramSpec>) => {
  const skeleton: Record<string, unknown>[] = [];

  for (const node of placed) {
    skeleton.push({
      type: node.shape,
      id: node.id, // stable id → deterministic, and arrows bind by id
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      label: { text: node.label, fontSize: LABEL_FONT_SIZE },
      ...(node.strokeColor ? { strokeColor: node.strokeColor } : {}),
      ...(node.backgroundColor
        ? { backgroundColor: node.backgroundColor }
        : {}),
      roundness: node.shape === "rectangle" ? { type: 3 } : null,
    });
  }

  spec.edges.forEach((edge, i) => {
    skeleton.push({
      type: "arrow",
      id: `arrow-${i}`,
      x: 0,
      y: 0,
      start: { id: edge.from },
      end: { id: edge.to },
      ...(edge.label ? { label: { text: edge.label } } : {}),
      ...(edge.style && edge.style !== "solid"
        ? { strokeStyle: STROKE_STYLE[edge.style] }
        : {}),
    });
  });

  return skeleton;
};

// Strip non-deterministic fields so identical specs serialize identically.
const stabilize = (elements: Array<Record<string, unknown>>) => {
  for (const el of elements) {
    el.seed = 1;
    el.versionNonce = 1;
    el.version = 1;
    el.updated = 1;
  }
  return elements;
};

/**
 * Build a complete Excalidraw scene from a structured DiagramSpec.
 */
export const buildScene = async (rawSpec: DiagramSpec): Promise<BuildResult> => {
  ensureProvider();
  const spec = validateDiagramSpec(rawSpec);

  const placed = await layoutNodesAsync(spec);
  const skeleton = toSkeleton(placed, spec);

  const elements = convertToExcalidrawElements(
    skeleton as Parameters<typeof convertToExcalidrawElements>[0],
    { regenerateIds: false },
  );

  // Deterministically connect arrows border-to-border using real positions.
  reanchorArrows(elements as unknown as Parameters<typeof reanchorArrows>[0]);

  const visible = (elements as Array<{ isDeleted?: boolean }>).filter(
    (el) => !el.isDeleted,
  );
  stabilize(visible as Array<Record<string, unknown>>);

  const content = JSON.stringify({
    type: "excalidraw",
    version: 2,
    source: "@kindraw/client",
    elements: visible,
    appState: { viewBackgroundColor: "#ffffff", gridSize: null },
    files: {},
  });

  return { content, elementCount: visible.length };
};
```

**Step 2: Run to verify it passes**

Run: `cd /Users/matheuskindrazki/development/crazy-ideas/kindraw && yarn vitest run packages/kindraw-client/src/scene/build.test.ts`

**Expected output:**
```
✓ packages/kindraw-client/src/scene/build.test.ts (4 tests)
     Tests  4 passed (4)
```

**If the determinism test fails:** Identify which field still varies by diffing the two `content` strings (temporarily `console.log(JSON.parse(first.content).elements[0])` vs second). Add that field to `stabilize`. Common culprits: `seed`, `versionNonce`, `version`, `updated`, `index` (fractional index — if present, set `el.index = "a0"` per position or strip it).

**If arrows have no binding:** The skeleton `start`/`end` must reference node ids that exist in the SAME `convertToExcalidrawElements` call. Ensure node skeletons come BEFORE arrow skeletons in the array (they do here) and that ids match exactly.

**If a node box is missing/oversized:** Confirm the custom provider is installed (the `ensureProvider()` call runs first). Without it, `convertToExcalidrawElements` may use Excalidraw's `isTestEnv()` path (`charCount * 10`) and produce huge boxes.

**Step 3: Commit (GREEN)**

```bash
git add packages/kindraw-client/src/scene/build.ts
git commit -m "feat(kindraw-client): deterministic scene builder pipeline (GREEN)"
```

**If Task Fails:**
1. **`convertToExcalidrawElements` throws referencing `document`:** The provider wasn't installed before the call. Verify `ensureProvider()` is the first line of `buildScene` and `setCustomTextMetricsProvider` is imported from `@excalidraw/element`.
2. **Type error on skeleton:** It's intentionally typed `Record<string, unknown>[]` and cast at the call site; keep the `as Parameters<...>[0]` cast.
3. **Rollback:** `git checkout -- packages/kindraw-client/src/scene/build.ts`.

---

### Task 12: Add the public `buildScene` export + a `scene` entry module

**Files:**
- Create: `packages/kindraw-client/src/scene/index.ts`

**Prerequisites:** Task 11 committed.

**Step 1: Create the scene entry barrel**

Create `packages/kindraw-client/src/scene/index.ts`:

```ts
// Public surface of the scene builder. This is the opt-in heavy-ish path
// (bundles @excalidraw/element transform), exposed via "@kindraw/client/scene".
// It does NOT import jsdom or mermaid — that's the whole point.
export { buildScene } from "./build.js";
export type { BuildResult } from "./build.js";
export { validateDiagramSpec } from "./spec.js";
export type {
  DiagramSpec,
  DiagramNode,
  DiagramEdge,
  DiagramGroup,
  NodeShape,
  Direction,
} from "./spec.js";
```

**Step 2: Typecheck the package**

Run: `cd /Users/matheuskindrazki/development/crazy-ideas/kindraw/packages/kindraw-client && yarn typecheck`

(Equivalently from root: `yarn workspace @kindraw/client typecheck`.)

**Expected output:** No errors (command exits 0, prints nothing or a success line).

**If you see TS errors about `.js` import extensions:** The package `tsconfig.json` uses `"moduleResolution": "Bundler"` and `"allowImportingTsExtensions": true`. `.js` specifiers that resolve to `.ts` source are fine under Bundler resolution. If a specific import errors, confirm the sibling file exists at that path.

**Step 3: Commit**

```bash
git add packages/kindraw-client/src/scene/index.ts
git commit -m "feat(kindraw-client): public scene builder entry"
```

**If Task Fails:** `git checkout -- packages/kindraw-client/src/scene/index.ts`.

---

### Task 13: Add `scene` to esbuild build + the package `exports` map

**Files:**
- Modify: `packages/kindraw-client/build.mjs:75` (external list), `:85-91` (entryPoints), `:95-99` (tsc declaration list)
- Modify: `packages/kindraw-client/package.json:10-19` (exports map)

**Prerequisites:** Task 12 committed.

**Step 1: Add the `scene` entrypoint and keep dagre/elk handling correct**

In `packages/kindraw-client/build.mjs`, the `external` array currently is:
```js
  external: ["jsdom", "canvas", "@excalidraw/mermaid-to-excalidraw"],
```
Change it to also keep `dagre` and `elkjs` external (they are real npm deps installed by the consumer; no need to bundle, and elkjs's worker build does not bundle cleanly):
```js
  external: ["jsdom", "canvas", "@excalidraw/mermaid-to-excalidraw", "dagre", "elkjs"],
```

In the `entryPoints` object (currently `index` and `generate`), add `scene`:
```js
  entryPoints: {
    index: path.resolve(__dirname, "src/index.ts"),
    generate: path.resolve(__dirname, "src/generate.ts"),
    scene: path.resolve(__dirname, "src/scene/index.ts"),
  },
```

In the `tsc` declaration command string, add the scene entry so `.d.ts` is emitted. Change:
```js
    "--skipLibCheck --types node src/index.ts src/client.ts src/auth.ts src/generate.ts src/dom.ts",
```
to:
```js
    "--skipLibCheck --types node src/index.ts src/client.ts src/auth.ts src/generate.ts src/dom.ts src/scene/index.ts",
```

**Step 2: Add the `./scene` export to `package.json`**

In `packages/kindraw-client/package.json`, change the `exports` block to add the scene subpath:
```json
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./generate": {
      "types": "./dist/generate.d.ts",
      "default": "./dist/generate.js"
    },
    "./scene": {
      "types": "./dist/scene/index.d.ts",
      "default": "./dist/scene/index.js"
    }
  },
```

**Step 3: Build the package**

Run: `cd /Users/matheuskindrazki/development/crazy-ideas/kindraw/packages/kindraw-client && yarn build`

**Expected output:** esbuild prints bundle info for `index.js`, `generate.js`, `scene.js`. tsc emits declarations. Final line:
```
@kindraw/client built → dist/index.js, dist/generate.js (+ .d.ts)
```
(The console.log message text is fine as-is; the important part is that `dist/scene.js` and `dist/scene/index.d.ts` now exist. Verify with the next command.)

**Step 4: Verify the scene artifacts exist**

Run: `ls packages/kindraw-client/dist/scene.js packages/kindraw-client/dist/scene/index.d.ts`

**Expected output:** Both paths print (no "No such file").

**If `dist/scene/index.d.ts` is missing:** tsc emits declarations preserving the source folder structure, so the `.d.ts` lands at `dist/scene/index.d.ts` while esbuild emits the bundle at `dist/scene.js` (flat, because the entryPoint key is `scene`). The `exports` map above already points `types` → `./dist/scene/index.d.ts` and `default` → `./dist/scene/index.js`. **MISMATCH RISK:** esbuild emits `dist/scene.js` (flat) but the exports map says `./dist/scene/index.js`. Fix by changing the esbuild entryPoint key to a nested path so the bundle also lands at `dist/scene/index.js`:
```js
  entryPoints: {
    index: path.resolve(__dirname, "src/index.ts"),
    generate: path.resolve(__dirname, "src/generate.ts"),
    "scene/index": path.resolve(__dirname, "src/scene/index.ts"),
  },
```
Re-run `yarn build` and re-verify `ls packages/kindraw-client/dist/scene/index.js packages/kindraw-client/dist/scene/index.d.ts` — both must exist. This nested-key form is the correct one; use it.

**Step 5: Commit**

```bash
git add packages/kindraw-client/build.mjs packages/kindraw-client/package.json
git commit -m "build(kindraw-client): emit @kindraw/client/scene entrypoint"
```

**If Task Fails:**
1. **esbuild can't resolve dagre/elkjs:** They must be in `external` (Step 1). Re-check.
2. **`dist/scene/index.js` not where exports expects:** Use the nested entryPoint key form from Step 4's fix.
3. **Rollback:** `git checkout -- packages/kindraw-client/build.mjs packages/kindraw-client/package.json` and `rm -rf packages/kindraw-client/dist`.

---

### Task 14: Expose `createScene` on `@kindraw/client` (thin convenience, optional)

**Files:**
- Modify: `packages/kindraw-client/src/index.ts`

**Note:** The light `index.ts` must stay free of `@excalidraw/element`/dagre/elk imports (it's the lean CRUD entry). So we do NOT import `buildScene` here directly. Instead, document the subpath. This task only adds a doc comment + re-export of the *types* (type-only, erased at build, no runtime weight).

**Prerequisites:** Task 13 committed.

**Step 1: Add type-only re-exports**

Append to `packages/kindraw-client/src/index.ts`:

```ts
// Structured scene building lives in the opt-in "@kindraw/client/scene" subpath
// (it pulls in @excalidraw/element + dagre). Re-export the spec TYPES here for
// convenience — these are type-only and add zero runtime weight to this entry.
export type {
  DiagramSpec,
  DiagramNode,
  DiagramEdge,
  DiagramGroup,
  NodeShape,
  Direction,
  BuildResult,
} from "./scene/index.js";
```

**Step 2: Typecheck**

Run: `cd /Users/matheuskindrazki/development/crazy-ideas/kindraw/packages/kindraw-client && yarn typecheck`

**Expected output:** No errors.

**Step 3: Verify the light entry stays runtime-light**

Run: `cd /Users/matheuskindrazki/development/crazy-ideas/kindraw/packages/kindraw-client && yarn build && node -e "import('./dist/index.js').then(()=>console.log('index loaded without excalidraw/dagre'))"`

**Expected output:** `index loaded without excalidraw/dagre` (proves `dist/index.js` has no eager heavy imports; type-only re-exports are erased).

**If it errors trying to load dagre/element:** A value import leaked into `index.ts`. Ensure the new export is `export type { ... }` (type-only), not `export { ... }`.

**Step 4: Commit**

```bash
git add packages/kindraw-client/src/index.ts
git commit -m "feat(kindraw-client): re-export scene spec types from light entry"
```

**If Task Fails:** `git checkout -- packages/kindraw-client/src/index.ts`.

---

### Task 15: Add the `kindraw_create_scene` MCP tool

**Files:**
- Modify: `packages/kindraw-mcp/src/index.ts` (add a new `registerTool` block after `kindraw_create_diagram`, around line 97)

**Prerequisites:** Task 14 committed. The MCP server already imports `KindrawClient` and `z` (zod).

**Step 1: Add the tool registration**

In `packages/kindraw-mcp/src/index.ts`, immediately after the closing `);` of the `kindraw_create_diagram` registration (currently ends at line 97), insert:

```ts
  server.registerTool(
    "kindraw_create_scene",
    {
      description:
        "Create a high-quality diagram in the user's Kindraw workspace from a " +
        "STRUCTURED spec of nodes and edges (preferred over Mermaid for rich " +
        "layouts). The server runs real graph layout (dagre by default) so " +
        "nodes are well-spaced and arrows connect borders cleanly. Provide " +
        "nodes with ids + labels, edges referencing those ids, optional shape " +
        "per node (rectangle/diamond/ellipse), optional colors, direction " +
        "(TB/LR/...), and engine (dagre or elk for orthogonal routing). " +
        "Returns the drawing URL.",
      inputSchema: {
        title: z.string().optional().describe("Title for the new drawing"),
        nodes: z
          .array(
            z.object({
              id: z.string().describe("Unique node id, referenced by edges"),
              label: z.string().describe("Text shown inside the node"),
              shape: z
                .enum(["rectangle", "diamond", "ellipse"])
                .optional()
                .describe("Node shape (default rectangle)"),
              group: z
                .string()
                .optional()
                .describe("Optional group id (reserved for grouping)"),
              strokeColor: z
                .string()
                .optional()
                .describe("Stroke color hex, e.g. #1971c2"),
              backgroundColor: z
                .string()
                .optional()
                .describe("Fill color hex, e.g. #a5d8ff"),
            }),
          )
          .min(1)
          .describe("The diagram nodes (at least one)"),
        edges: z
          .array(
            z.object({
              from: z.string().describe("Source node id"),
              to: z.string().describe("Target node id"),
              label: z.string().optional().describe("Optional edge label"),
              style: z
                .enum(["solid", "dashed", "dotted"])
                .optional()
                .describe("Connector style (default solid)"),
            }),
          )
          .describe("The directed edges between nodes"),
        direction: z
          .enum(["TB", "BT", "LR", "RL"])
          .optional()
          .describe("Layout direction (default TB, top-to-bottom)"),
        engine: z
          .enum(["dagre", "elk"])
          .optional()
          .describe(
            "Layout engine: dagre (default, fast) or elk (orthogonal routing)",
          ),
      },
    },
    async ({ title, nodes, edges, direction, engine }) => {
      try {
        const { buildScene } = await import("@kindraw/client/scene");
        const { content, elementCount } = await buildScene({
          nodes,
          edges,
          direction,
          engine,
        });
        const result = await client.createDrawing({
          title: title || "Untitled diagram",
          content,
        });
        return text(
          `Created diagram "${title || "Untitled diagram"}" (${elementCount} elements).\n${result.url}`,
        );
      } catch (error) {
        return { ...text(formatError(error)), isError: true };
      }
    },
  );
```

**Step 2: Typecheck the MCP package**

Run: `cd /Users/matheuskindrazki/development/crazy-ideas/kindraw && yarn workspace @kindraw/mcp typecheck` (if a `typecheck` script exists; otherwise `cd packages/kindraw-mcp && npx tsc --noEmit`).

**Expected output:** No errors. If `@kindraw/client/scene` types aren't found, ensure Task 13 built the package (`dist/scene/index.d.ts` exists) — the MCP package depends on the built `@kindraw/client`.

**If the import `@kindraw/client/scene` is unresolved:** Confirm `packages/kindraw-client/package.json` has the `./scene` export (Task 13) and that `dist/scene/index.js` + `dist/scene/index.d.ts` exist. The MCP server resolves the dependency from `node_modules/@kindraw/client` (workspace symlink), which points at the built `dist`.

**Step 3: Build the MCP package**

Run: `cd /Users/matheuskindrazki/development/crazy-ideas/kindraw/packages/kindraw-mcp && yarn build`

**Expected output:** Build succeeds (check `packages/kindraw-mcp/build.mjs` for the exact success line; it should emit `dist/index.js`).

**Step 4: Commit**

```bash
git add packages/kindraw-mcp/src/index.ts
git commit -m "feat(kindraw-mcp): add kindraw_create_scene structured tool"
```

**If Task Fails:**
1. **zod schema rejects valid input at runtime:** Loosen `.min(1)` placement; the array `.min(1)` is on `nodes` only.
2. **Rollback:** `git checkout -- packages/kindraw-mcp/src/index.ts`.

---

### Task 16: Add the `kindraw generate --spec` CLI command (parity)

**Files:**
- Create: `packages/kindraw-cli/src/commands/scene.ts`
- Modify: `packages/kindraw-cli/src/index.ts` (HELP text + dispatch)

**Prerequisites:** Task 15 committed.

**Step 1: Create the CLI scene command**

Create `packages/kindraw-cli/src/commands/scene.ts`:

```ts
import fs from "node:fs";

import { KindrawClient } from "@kindraw/client";

import { requireClient } from "../client.js";

// `kindraw scene --spec <file|-> [--title T]`
// Reads a structured DiagramSpec JSON (from file or stdin), builds a laid-out
// Excalidraw scene locally, and creates a drawing in the workspace.
export const scene = async (args: {
  spec?: string;
  title?: string;
}): Promise<void> => {
  const client: KindrawClient = requireClient();

  if (!args.spec) {
    throw new Error(
      "Usage: kindraw scene --spec <file|-> [--title <title>]",
    );
  }

  const raw =
    args.spec === "-"
      ? fs.readFileSync(0, "utf8")
      : fs.readFileSync(args.spec, "utf8");

  let spec: unknown;
  try {
    spec = JSON.parse(raw);
  } catch {
    throw new Error("--spec must be valid JSON (a DiagramSpec).");
  }

  // Opt-in heavy path (bundles @excalidraw/element + dagre) — loaded only here.
  const { buildScene } = await import("@kindraw/client/scene");
  const { content, elementCount } = await buildScene(
    spec as Parameters<typeof buildScene>[0],
  );
  const title = args.title || "Untitled diagram";
  const result = await client.createDrawing({ title, content });

  console.log(`Created "${title}" (${elementCount} elements)`);
  console.log(result.url);
};
```

**Step 2: Wire it into the CLI dispatcher**

In `packages/kindraw-cli/src/index.ts`:

(a) Add the import near the other command imports (after the `generate` import, line 4):
```ts
import { scene } from "./commands/scene.js";
```

(b) Add a HELP line in the `Usage:` block (after the `generate` lines, around line 19):
```
  kindraw scene    --spec <file|->      Create a drawing from a structured spec
                  [--title <title>]
```

(c) Add a `case` in the `switch (command)` (after the `generate` case, line 72-76):
```ts
    case "scene":
      return scene({
        spec: str(flags.spec),
        title: str(flags.title),
      });
```

**Step 3: Typecheck the CLI**

Run: `cd /Users/matheuskindrazki/development/crazy-ideas/kindraw && yarn workspace @kindraw/cli typecheck` (or `cd packages/kindraw-cli && npx tsc --noEmit`).

**Expected output:** No errors.

**Step 4: Build the CLI**

Run: `cd /Users/matheuskindrazki/development/crazy-ideas/kindraw/packages/kindraw-cli && yarn build`

**Expected output:** Build succeeds, emits `dist/index.js`.

**Step 5: Commit**

```bash
git add packages/kindraw-cli/src/commands/scene.ts packages/kindraw-cli/src/index.ts
git commit -m "feat(kindraw-cli): add `kindraw scene --spec` command"
```

**If Task Fails:**
1. **`str` / `flags` not defined:** They're defined in `index.ts` already (`str` helper line 53, `flags` from `parse`). Use them as the existing `generate` case does.
2. **Rollback:** `git checkout -- packages/kindraw-cli/src/index.ts && rm packages/kindraw-cli/src/commands/scene.ts`.

---

### Task 17: Full verification + Code Review (Batch 2: builder + MCP + CLI)

**Files:** none (verification + review).

**Step 1: Run the project typecheck and test suite (per CLAUDE.md)**

Run from repo root:
```bash
cd /Users/matheuskindrazki/development/crazy-ideas/kindraw
yarn test:typecheck
yarn vitest run packages/kindraw-client/src/scene
```

**Expected output:**
- `yarn test:typecheck` → exits 0 (TypeScript clean).
- The scene tests → all suites pass:
```
Test Files  5 passed (5)
     Tests  ~19 passed
```
(spec.test, textMetrics.test, layout.test, layout.elk.test, build.test)

**Note on `yarn test:update`:** Per CLAUDE.md the snapshot command is `yarn test:update`. Our scene tests use explicit assertions, not snapshots, so they don't need snapshot updates. Still run the existing `reanchor.test.ts` to confirm no regression:
```bash
yarn vitest run packages/kindraw-client/src/reanchor.test.ts
```
**Expected:** `Tests  3 passed (3)`.

**Step 2: Lint/format (per CLAUDE.md `yarn fix`)**

Run: `cd /Users/matheuskindrazki/development/crazy-ideas/kindraw && yarn fix`

**Expected output:** Formatting/lint auto-fixes applied (if any). Re-run typecheck if files changed.

**Step 3: Code Review — dispatch all 3 reviewers in parallel**
- REQUIRED SUB-SKILL: Use ring:requesting-code-review
- Run ring:code-reviewer, ring:business-logic-reviewer, ring:security-reviewer simultaneously over the full Phase 1 diff (Tasks 10-16).
- Wait for all.

**Step 4: Handle findings by severity (MANDATORY)**
- **Critical/High/Medium:** fix immediately, re-run all 3 reviewers, repeat until zero. Expect scrutiny on: MCP input validation (the spec comes from an LLM — ensure `buildScene`'s `validateDiagramSpec` runs before any layout, which it does), error messages not leaking internals, and the determinism `stabilize` hack (flag if it could corrupt a real scene — it only sets metadata fields Excalidraw recomputes on load).
- **Low:** `TODO(review): ... (reported by [reviewer] on 2026-06-16, severity: Low)`.
- **Cosmetic:** `FIXME(nitpick): ... (reported by [reviewer] on 2026-06-16, severity: Cosmetic)`.

**Step 5: Commit any fixes**
```bash
git add -A
git commit -m "fix(kindraw): address Phase 1 review findings"
```

**If Task Fails:**
1. **`yarn test:typecheck` fails in unrelated packages:** Confirm the failures are pre-existing (run `git stash && yarn test:typecheck` on clean tree to compare). Only fix what your changes broke.
2. **Snapshot mismatch elsewhere:** If `yarn test:update` is required by CI, run it and inspect the diff before committing.

---

### Task 18: Manual smoke test of the MCP tool (end-to-end against the real API)

**Files:** none (manual verification). This proves the canvas-quality goal with a real drawing URL.

**Prerequisites:** A valid `KINDRAW_TOKEN` (run `kindraw login` first, or export the token). Network access. The MCP package built (Task 15).

**Step 1: Smoke-test the builder output locally (no network) first**

Create a temp spec and build it via the CLI without posting — actually the CLI posts; to test build-only, use a tiny node snippet:
```bash
cd /Users/matheuskindrazki/development/crazy-ideas/kindraw/packages/kindraw-client
node --input-type=module -e "
import { buildScene } from './dist/scene/index.js';
const r = await buildScene({
  nodes: [
    { id: 'u', label: 'User', shape: 'rectangle' },
    { id: 'api', label: 'API Gateway', shape: 'rectangle' },
    { id: 'svc', label: 'Auth Service', shape: 'rectangle' },
    { id: 'db', label: 'Postgres', shape: 'ellipse' },
  ],
  edges: [
    { from: 'u', to: 'api', label: 'HTTPS' },
    { from: 'api', to: 'svc' },
    { from: 'svc', to: 'db', label: 'SQL' },
  ],
  direction: 'TB',
});
const scene = JSON.parse(r.content);
console.log('elements:', r.elementCount);
const boxes = scene.elements.filter(e => ['rectangle','ellipse','diamond'].includes(e.type));
console.log('boxes:', boxes.map(b => ({ id: b.id, x: b.x, y: b.y, w: b.width, h: b.height })));
"
```
**Expected output:** Prints `elements: <N>` (≥ 7: 4 shapes + 4 bound text + 3 arrows minus container/text dedup) and a list of boxes whose x/y are spread out (no two boxes share the same x AND y; y increases down the chain for TB). This is the visual-quality proof: real spacing, not `text.length*8`.

**Step 2: Smoke-test the CLI end-to-end (posts a real drawing)**

```bash
cd /Users/matheuskindrazki/development/crazy-ideas/kindraw
echo '{"nodes":[{"id":"a","label":"Frontend"},{"id":"b","label":"Backend"},{"id":"c","label":"Database","shape":"ellipse"}],"edges":[{"from":"a","to":"b","label":"REST"},{"from":"b","to":"c","label":"SQL"}],"direction":"TB"}' | node packages/kindraw-cli/dist/index.js scene --spec - --title "Scene smoke test"
```
**Expected output:**
```
Created "Scene smoke test" (N elements)
https://kindraw.dev/draw/<itemId>   (or the configured base URL)
```

**Step 3: Open the URL and visually confirm**
- Open the printed URL in a browser.
- **Expected:** Three nodes laid out top-to-bottom with comfortable spacing, "Database" as an ellipse, two labeled arrows whose heads/tails touch the node borders (not floating, not overlapping). Compare against a Mermaid-generated drawing of the same graph (`kindraw generate --mermaid`) — the scene version should look noticeably cleaner.

**Step 4: (Optional) MCP tool smoke test via an MCP client**
If you have Claude Code wired to the kindraw MCP server, invoke `kindraw_create_scene` with the same nodes/edges and confirm the returned URL renders identically. Otherwise Step 2 (CLI) exercises the same `buildScene` + `createDrawing` path and is sufficient.

**Step 5: Clean up the smoke-test drawing (optional)**
```bash
node packages/kindraw-cli/dist/index.js items list
node packages/kindraw-cli/dist/index.js items delete <itemId>
```

**If Task Fails:**
1. **401 Unauthorized:** Run `kindraw login` or `export KINDRAW_TOKEN=...`.
2. **400 "content is not valid Excalidraw JSON":** The builder output is malformed — re-run Step 1 and inspect `r.content` for a missing `elements` array.
3. **Drawing renders cramped/overlapping:** The custom text provider isn't being used at runtime (boxes too big/small). Confirm `dist/scene/index.js` was rebuilt after Task 11 and that `setCustomTextMetricsProvider` runs in `buildScene`.

---

### Task 19: Phase 1 wrap-up — docs + final commit

**Files:**
- Modify: `packages/kindraw-client/README.md`, `packages/kindraw-mcp/README.md`, `packages/kindraw-cli/README.md`

**Step 1: Document the new capability**

Add a short section to each README:
- `kindraw-client/README.md`: document `import { buildScene } from "@kindraw/client/scene"` with the `DiagramSpec` shape and an example.
- `kindraw-mcp/README.md`: document the `kindraw_create_scene` tool and when to prefer it over `kindraw_create_diagram` (structured > mermaid for layout quality).
- `kindraw-cli/README.md`: document `kindraw scene --spec <file|->`.

(Keep each addition under ~25 lines; copy the `DiagramSpec` example from Task 18 Step 1.)

**Step 2: Final typecheck + test**

Run:
```bash
cd /Users/matheuskindrazki/development/crazy-ideas/kindraw
yarn test:typecheck
yarn vitest run packages/kindraw-client/src
```
**Expected:** typecheck clean; all kindraw-client tests pass (scene suites + reanchor).

**Step 3: Commit**
```bash
git add packages/kindraw-client/README.md packages/kindraw-mcp/README.md packages/kindraw-cli/README.md
git commit -m "docs(kindraw): document structured scene builder (Phase 1)"
```

**Phase 1 is complete.** The canvas quality problem (jsdom fake layout) is solved for the structured path: real dagre/elk layout, DOM-free text measurement, border-to-border arrows, deterministic output, exposed via MCP + CLI, backward compatible with the mermaid tools.

---

## Phase 2 — Expose `doc` (markdown) creation via MCP/CLI (less detail)

**Goal:** Let Claude create a markdown `doc` item directly (the data model already exists; only the client/MCP/CLI surface is missing).

**Verified facts driving this phase:**
- The Worker route `POST /v1/api/items` (`workers/api/src/index.ts:1021-1031`) accepts `{ kind: "drawing"|"doc", title, folderId, content }` and returns `{ itemId, url }` (status 201). A `doc`'s `content` is a markdown string. This route is currently NOT exposed in `@kindraw/client`.

**Tasks (each 2-5 min, TDD where logic exists):**

1. **Add `createDoc` to `KindrawClient`** — `packages/kindraw-client/src/client.ts`. New method:
   ```ts
   createDoc(input: { title: string; markdown: string; folderId?: string | null }): Promise<CreateDrawingResult> {
     return this.request<CreateDrawingResult>("POST", "/v1/api/items", {
       kind: "doc",
       title: input.title,
       folderId: input.folderId ?? null,
       content: input.markdown,
     });
   }
   ```
   - **VERIFY FIRST:** Re-read `workers/api/src/index.ts:1021-1031` and `store.createItem` to confirm the response field names (`itemId`, `url`) match `CreateDrawingResult`. The `:generate` route returns `{ itemId, url }`; confirm the generic POST returns the same (it does — line 1025-1030). If the generic route's `url` differs (it calls `drawingUrl` which may produce a `/draw/` path even for docs), note it; a doc URL may need a `/doc/` path. **Read `drawingUrl` in the Worker to confirm doc URLs.**
2. **Unit test `createDoc`** — mirror by mocking `fetch` (no existing client test; add `packages/kindraw-client/src/client.test.ts` with a `vi.stubGlobal("fetch", ...)` asserting the POST body has `kind: "doc"` and the markdown as `content`).
3. **Add `kindraw_create_doc` MCP tool** — `packages/kindraw-mcp/src/index.ts`. Schema: `{ title: string, markdown: string }`. Calls `client.createDoc`. No heavy import needed (pure HTTP).
4. **Add `kindraw doc --markdown <file|->` CLI command** — `packages/kindraw-cli/src/commands/doc.ts` + wire into `index.ts` dispatcher (mirror the `scene` command, but no `@kindraw/client/scene` import — just `client.createDoc`).
5. **Code review (3 reviewers parallel)** + fix Critical/High/Medium.
6. **Smoke test:** `echo '# Hello\n\nWorld' | kindraw doc --markdown - --title "Doc smoke"` → open URL, confirm it renders as a TipTap markdown doc.

**Uncertainties to resolve in Phase 2 (read before implementing):**
- Confirm the generic `POST /v1/api/items` accepts a session-or-token from the public API (it's under `/v1/api/`, which `requireAuth` guards — verified it requires auth, accepts Bearer token). 
- Confirm the returned `url` for a `doc` opens the markdown editor, not the canvas. Read `drawingUrl` in `workers/api/src/index.ts`.

---

## Phase 3 — Expose `hybrid` doc creation (canvas + pre-populated sections + links)

**Goal:** Let Claude create a `hybrid` item — a canvas + a live markdown document with pre-built sections, optionally cross-linked from canvas elements via `kindraw://section/{hybridId}/{sectionId}`.

**Verified facts driving this phase:**
- Hybrid creation is `POST /api/hybrid-items` (NOT `/v1`), body `{ title, folderId? }`, returns `{ hybridId, docItemId, drawingItemId }`. It auto-creates a doc (`# {title}\n\n`) and an empty drawing. Content is then filled via per-item content routes.
- `excalidraw-app/kindraw/hybridSections.ts` is **PURE (Node-importable)** — only depends on `marked`. It exports: `parseHybridMarkdownSections`, `appendHybridSection(markdown, title) → { markdown, sectionId }`, `buildKindrawSectionLink(hybridId, sectionId)`, `replaceHybridMarkdownSection`, etc. This is the helper to reuse for composing pre-populated sections.

**Tasks (each 2-5 min):**

1. **Vendor or share `hybridSections.ts` into `@kindraw/client`** — since it's pure, copy it to `packages/kindraw-client/src/scene/hybridSections.ts` (or a new `src/doc/` folder) and add `marked` as a dependency. **Decision point:** copy vs. import across package boundary. The app file lives in `excalidraw-app/` (not a published package), so **copy it** into `@kindraw/client` and add a test asserting `buildKindrawSectionLink` + `appendHybridSection` behavior. (Flag: keep a comment noting the source of truth to avoid drift.)
2. **Add hybrid methods to `KindrawClient`** — `createHybrid({ title, folderId? })` calling `POST /api/hybrid-items`. **UNCERTAIN — VERIFY:** does the public API token authenticate on the non-`/v1` `/api/hybrid-items` route? Read `workers/api/src/index.ts` around line 1432+ and the `requireAuth` usage on `/api/*` routes. If the token is NOT accepted there, you must add a `/v1/api/hybrid-items` route to the Worker (a separate Worker task — flag for human, as it changes the backend contract). Document the finding before coding.
3. **Add `putItemContent` usage** — after `createHybrid`, fill the drawing via `updateContent(drawingItemId, sceneContent)` (reuse `buildScene` from Phase 1) and the doc via `updateContent(docItemId, composedMarkdown)` (built with `hybridSections` helpers). Note `updateContent` already exists on the client (`client.ts:113`) but is unexposed.
4. **Add `kindraw_create_hybrid` MCP tool** — schema accepts `{ title, spec (DiagramSpec for the canvas), sections: [{ title, markdown }] }`. Compose markdown with `appendHybridSection`, build canvas with `buildScene`, optionally inject `kindraw://section/...` links into canvas node `link` fields (extend `buildScene` to accept an optional `link` per node).
5. **Add `kindraw hybrid` CLI command** — mirror, reading a JSON spec with `{ title, canvas, sections }`.
6. **Code review (3 reviewers)** + fix Critical/High/Medium.
7. **Smoke test:** create a hybrid, open the URL, confirm canvas + sectioned doc render and (if links added) clicking a canvas node scrolls to its section.

**Uncertainties to resolve in Phase 3 (highest risk — read first):**
- The `/api/hybrid-items` auth question above (token vs. session). This is the gating unknown; resolve before estimating Phase 3.
- The exact element `link` field that triggers section navigation in the app — read `excalidraw-app/kindraw/` for where `kindraw://section/...` links are consumed (the link must be set on the Excalidraw element's `link` property; confirm `convertToExcalidrawElements` skeleton supports `link` — `ElementConstructorOpts` includes `link`, so a node skeleton can carry `link`).

---

## Phase 4 — Wire templates + icons into the scene builder

**Goal:** Let a scene start from a curated template, and let nodes embed searched icons as image elements.

**Verified facts driving this phase:**
- `excalidraw-app/kindraw/templatesApi.ts`: `getTemplate(id)` returns `{ ...meta, elements: KindrawTemplateSkeleton[] }` where `elements` are Excalidraw element skeletons fed to `convertToExcalidrawElements`. It's browser-coupled only via `getApiBaseUrl()` (uses `window.location.origin` / `import.meta.env`) — needs an injectable base URL for Node.
- `excalidraw-app/kindraw/iconsApi.ts`: `searchIcons(query)` → `KindrawIcon[]`; `fetchIconSvg(id)` → raw SVG string. The app turns an icon into an image element via: normalize SVG → `SVGStringToFile` → `generateIdFromFile` → `getDataURL` → register file → `convertToExcalidrawElements([{ type:"image", fileId, x,y,w,h, status:"saved" }])`. Several of those helpers are browser/excalidraw-coupled.
- `curatedLibraries.ts`: metadata pointers to `.excalidrawlib` blobs (browser import UI consumes them) — likely NOT needed server-side for Phase 4; skip unless a clear use emerges.

**Tasks (each 2-5 min):**

1. **Port a Node-friendly templates fetch** into `@kindraw/client` — `fetchTemplate(baseUrl, id)` using plain `fetch` (the client already has a `baseUrl`). Returns the skeleton `elements`. Add a `buildScene` option `startFromTemplate?: { id: string }` that prepends the template skeleton to the generated skeleton (offsetting generated nodes so they don't collide — reuse layout bounds). **VERIFY:** the template API path — is it `/api/templates/{id}` or `/v1/api/templates/{id}`? Read the Worker for a templates route; the app uses `/api/templates`. If only `/api/*` exists, confirm token auth there or add a `/v1` route (flag).
2. **Port icon embedding into Node** — this is the hardest part because `SVGStringToFile`/`getDataURL`/`generateIdFromFile` are excalidraw-app utilities. Investigate whether they're importable from `@excalidraw/*` packages or must be reimplemented (an SVG data URL + `fileId` hash can be built in Node with `Buffer` + a hash; the image element skeleton is straightforward). Add `buildScene` support for `node.icon?: string` (an icon id): fetch SVG, build a `files` map entry + an `image` skeleton, and place it near the node.
3. **Extend `buildScene` `files` output** — currently emits `files: {}`. Icons require populating `files` with `{ [fileId]: { mimeType, dataURL, id, created } }`. Add tests asserting the `files` map and image elements.
4. **Add MCP/CLI surface** — extend `kindraw_create_scene` schema with optional `template` and per-node `icon`. 
5. **Code review + smoke test** (create a scene from a template with an icon node; confirm it renders).

**Uncertainties to resolve in Phase 4 (read first):**
- Are `SVGStringToFile`, `getDataURL`, `generateIdFromFile`, `normalizeSVG` exported from any `@excalidraw/*` package (e.g. `@excalidraw/excalidraw` or `@excalidraw/utils`), or are they app-only? Grep `packages/` for each. If app-only, reimplement minimally in Node (data URL + content hash). This determines Phase 4 effort.
- The templates/icons API auth & path (`/api/*` vs `/v1/api/*`) — same pattern as Phase 2/3.

---

## Cross-Cutting Notes & Risks

**New dependencies (where they go):**
- `packages/kindraw-client/package.json` → `dagre` (dep), `elkjs` (dep), `@types/dagre` (devDep). Phase 3 adds `marked` (dep) if hybrid sections are vendored. Phase 4 may add nothing new (icons reuse `Buffer`/hash).

**Build config:**
- The structured scene path is a NEW third esbuild entrypoint (`scene/index`) that does NOT import `./dom.js` or mermaid. `dagre` and `elkjs` are kept `external` (installed by the consumer). The mermaid path (`generate.ts` + `dom.ts`) is untouched and stays isolated — both can coexist; a caller pays for jsdom only if they import `@kindraw/client/generate`.

**Determinism:** `convertToExcalidrawElements` injects randomness (`seed`, `versionNonce`, random ids when `regenerateIds: true`). The builder uses stable skeleton ids + `regenerateIds: false` + a `stabilize()` pass that zeroes metadata fields. If a future Excalidraw version changes which fields are randomized, the determinism test (Task 10) will catch it.

**The custom text metrics provider is global state** (`setCustomTextMetricsProvider` sets a module-level singleton in `@excalidraw/element`). In the MCP/CLI process this is fine (single purpose). If `@kindraw/client/generate` (mermaid) and `@kindraw/client/scene` are ever used in the SAME process, the provider set by `scene` would also affect mermaid's conversion — which is harmless (the DOM-free provider is strictly better than jsdom's `text.length*8` shim). Note this in code comments.

**Backward compatibility:** `kindraw_create_diagram` (mermaid), `kindraw_create_drawing` (raw JSON), and `kindraw generate --mermaid` are all untouched and keep working. The scene builder is purely additive.

**What is NOT covered (out of scope, flag for product):** grouping/frames in `buildScene` are stubbed in the spec (`group` field accepted, `groups` validated) but the skeleton emission does NOT yet create `frame` elements — that's a natural Phase 1.5 follow-up (emit `{ type: "frame", children: [...nodeIds], name }` per group). The plan keeps the field in the contract so it's forward-compatible, but actual frame rendering is deferred. Flag this to the human if grouping is a launch requirement.

---

## Final Checklist (verify before declaring done)

- [ ] `yarn test:typecheck` passes (repo root).
- [ ] `yarn vitest run packages/kindraw-client/src` — all scene suites + reanchor pass.
- [ ] `packages/kindraw-client/dist/scene/index.js` and `.d.ts` exist after `yarn build`.
- [ ] `dist/index.js` loads without eagerly importing `@excalidraw/element`/dagre (Task 14 Step 3).
- [ ] `kindraw scene --spec -` produces a real, well-spaced drawing URL (Task 18).
- [ ] `kindraw_create_scene` MCP tool registered and typechecks.
- [ ] No Critical/High/Medium review findings open; Low → `TODO(review):`, Cosmetic → `FIXME(nitpick):`.
- [ ] Mermaid path (`kindraw generate --mermaid`, `kindraw_create_diagram`) still works (regression check).
