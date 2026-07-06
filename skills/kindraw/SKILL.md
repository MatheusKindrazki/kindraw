---
name: kindraw
description: |
  Create and edit diagrams, docs, and hybrid (doc+canvas) items in the user's
  Kindraw workspace. Use for: turning text or Mermaid into a clean diagram;
  composing rich node/edge architecture diagrams with real graph layout; building
  a markdown doc beside an Excalidraw canvas (a "hybrid"); reading or patching an
  existing hybrid's doc or canvas in place; keeping a diagram in lockstep with
  code (diagram-as-code / CI drift check); and mentioning canvas frames inside the
  doc. Triggers: "kindraw", "draw a diagram", "architecture / flowchart / C4
  diagram", "hybrid doc", "update the canvas / doc", "diagram as code", "read the
  scene", any kindraw:// link, or a kindraw.dev URL.
author: Matheus Kindrazki
version: 1.0.0
date: 2026-07-06
---

# Kindraw — diagrams, docs & hybrids

Kindraw is a workspace (kindraw.dev) built on Excalidraw. You act on it through
the **Kindraw MCP tools** (all named `kindraw_*`). If your runtime has no MCP,
use the **CLI / REST fallback** at the bottom — the mental model is identical.

## Setup

- Auth is a Personal Access Token. The MCP server reads `KINDRAW_TOKEN`, else
  `~/.config/kindraw/config.json` (written by `kindraw login`). API base defaults
  to `https://api.kindraw.dev`; the app is `https://kindraw.dev`.
- The MCP server runs from a **local build** today (not yet on npm). If tools are
  missing or stale after a code change, the server must be rebuilt and the client
  **reconnected**.

## Mental model (read this first)

A workspace holds **items**. There are three kinds:

- **drawing** — an Excalidraw canvas.
- **doc** — a markdown document.
- **hybrid** — a *container* that pairs ONE doc item and ONE drawing item,
  wired with clickable section links. **A hybrid is NOT a plain item.**

The single most important fact: **`get_item(hybridId)` 404s.** A hybrid is a
container — resolve it with **`get_hybrid`** to get its `docItemId` and
`drawingItemId`, then act on those. (Read tools below accept a hybrid id directly
and resolve it for you.)

```
hybrid  ──►  { docItemId, drawingItemId }
               │             │
             doc item     drawing item
           (markdown)     (Excalidraw JSON)
```

## Choosing the right tool

| You want to… | Use |
|---|---|
| Quick diagram from a Mermaid string | `kindraw_create_diagram` |
| Rich architecture diagram (clean layout, frames) | `kindraw_create_scene` |
| A markdown doc | `kindraw_create_doc` |
| Doc **and** canvas together, cross-linked | `kindraw_create_hybrid` |
| Resolve a hybrid → its doc/drawing ids | `kindraw_get_hybrid` |
| Read a hybrid's doc markdown | `kindraw_read_doc` |
| Rewrite a hybrid's doc in place | `kindraw_update_doc` |
| "See" a canvas without the megabytes of JSON | `kindraw_read_scene` |
| List frames (to @-mention them in the doc) | `kindraw_list_frames` |
| Regenerate an existing canvas from a spec (or CI drift check) | `kindraw_sync_scene` |
| Start from a template | `kindraw_list_templates` → `kindraw_apply_template` |
| Find an icon | `kindraw_search_icons` |
| List / fetch / delete items | `kindraw_list_items` / `kindraw_get_item` / `kindraw_delete_item` |

## Workflows

### 1. Quick diagram from Mermaid
`kindraw_create_diagram({ mermaid, title })`. Best for **flowchart, sequence,
class** diagrams (these convert to native hand-drawn Excalidraw elements). See the
Mermaid gotcha before using `stateDiagram`, `gantt`, `pie`, `erDiagram`.

### 2. Rich architecture diagram (preferred for anything non-trivial)
`kindraw_create_scene({ title, nodes, edges, groups?, direction?, engine? })`.
You compose the graph; Kindraw runs **real layout** (dagre) so nodes are spaced
and arrows connect borders. 
- `nodes`: `{ id, label, shape?: rectangle|diamond|ellipse|sticky, color? }`
- `edges`: `{ from, to, label? }` (reference node ids)
- `groups`: give nodes a shared `group` id + a matching `groups` entry to draw a
  labeled **frame** boundary around them — ideal for C4 context/container,
  bounded contexts, swimlanes.
- `direction`: `TB | BT | LR | RL`. **`engine: "elk"` currently falls back to
  dagre** (see gotcha) — just use dagre.

### 3. Doc + canvas in one shot (hybrid)
`kindraw_create_hybrid({ title, markdown, diagram })`. The diagram's nodes may
carry `linkToHeading: "<exact heading text>"` to deep-link a node to a doc
section. **Section links attach to TOP-LEVEL `#` headings only** — a `##` is
nested into its parent and is NOT linkable. Structure each linkable section as a
top-level `#`. The result reports which links wired and which `linkToHeading`
matched nothing (with the headings you CAN link to).

### 4. Read & patch an existing hybrid  ← the everyday flow
```
get_hybrid(hybridId) → { docItemId, drawingItemId }
read_doc(hybridId)   → { markdown, sections:[{id,title}] }   # pass the HYBRID id; it resolves the doc
# …edit the markdown…
update_doc(hybridId, newMarkdown) → { previousMarkdown, sections }   # previousMarkdown = cheap undo
```
`read_doc` / `update_doc` accept **either** a hybrid id **or** a bare doc item id.
Always keep the returned `previousMarkdown` if you might need to revert.

### 5. See the canvas cheaply
`kindraw_read_scene(hybridId | drawingItemId, detail?)` → a compact graph:
`{ counts, frames:[{frameId,name}], nodes:[{id,label,frame}], edges:[{from,to,label}] }`.
`detail:"full"` adds node geometry. This is how you "see" a canvas without parsing
hundreds of elements — a 27-element scene summarizes to ~1.5 KB.

### 6. Mention canvas frames in the doc
`kindraw_list_frames(hybridId)` → `[{ frameId, name }]`. Write a mention into the
doc markdown as a link: `[◳ Frame name](kindraw://frame/<frameId>)`. In the app
that renders as a chip; clicking it focuses the frame on the canvas. (Frames need
names to be useful — unnamed frames come back with `name: null`.)

### 7. Diagram-as-code / CI drift check
`kindraw_sync_scene({ itemId, check?, ...spec })` regenerates an existing canvas
from a spec. `itemId` = the **drawing** item id (for a hybrid, get it from
`get_hybrid`). **A non-check sync OVERWRITES the canvas — it destroys manual
edits.** Pass **`check: true`** to detect drift WITHOUT writing (the CI gate).
There is no partial/frame-scoped sync yet — it is all-or-nothing.

## Gotchas (hard-won)

1. **`get_item` 404s on a hybrid** — it's a container. Use `get_hybrid`. (The
   tool now returns a hint pointing you there.)
2. **`update_doc` returns `previousMarkdown`** — your undo. Grab it before large
   rewrites.
3. **`sync_scene` (non-check) overwrites the whole canvas.** Manual edits are
   lost. Use `check: true` first, or only sync canvases that are 100% spec-owned.
4. **Mermaid on the CANVAS**: `mermaid-to-excalidraw` natively converts only
   **flowchart / sequence / class**. `stateDiagram`, `gantt`, `pie`, `erDiagram`,
   etc. fall back to a rasterized image that can render badly on the canvas.
   Prefer flowchart for the canvas; for other diagram types, put a ```mermaid
   block in the DOC markdown (the doc renders any Mermaid type as inline SVG).
   Avoid `<br/>` in diagram labels.
5. **`engine: "elk"` = dagre.** elk (orthogonal routing) crashes elkjs's runtime
   under Node, so it safely falls back to dagre with a stderr warning. Use dagre.
6. **Section links are top-level-`#` only** (`create_hybrid` linkToHeading,
   `kindraw://section/<id>`). Deeper headings nest and aren't linkable.
7. **Read tools take a hybrid id OR a child item id** and resolve automatically
   (`read_doc`, `update_doc`, `read_scene`, `list_frames`).
8. Canvas graph shape: **nodes** = rectangle/ellipse/diamond (label = bound text
   via `containerId`); **edges** = arrows (`startBinding.elementId` →
   `endBinding.elementId`).

## Without the MCP (Codex / CLI / curl)

Same model over the CLI or REST. Auth: `Authorization: Bearer $KINDRAW_TOKEN`.

CLI (`kindraw`): `login` · `whoami` · `generate --mermaid <f> [--title T]` ·
`items list|get|delete`.

Key REST endpoints (base `https://api.kindraw.dev`):
- `GET  /api/hybrid-items/:id` — resolve a hybrid → `{hybrid:{docItemId,drawingItemId,…}}`
- `GET  /v1/api/items` — list items · `GET /v1/api/items/:id` — `{item,content}`
- `PUT  /api/items/:id/content` — body `{content}` — overwrite a doc/drawing in place
  (**bare `/api`, not `/v1/api`** — this is the verified contract)
- `POST /v1/api/items:generate` — server-side generation
- `POST /api/hybrid-items` — create a hybrid container

To patch a hybrid doc via curl: `GET /api/hybrid-items/:id` → `docItemId`;
`GET /v1/api/items/:docItemId` for the current markdown; `PUT
/api/items/:docItemId/content` with the new markdown.

See `reference.md` for the full tool catalog and `README.md` for installing this
skill into Claude Code, Codex, and Hermes.
