# Kindraw MCP — full tool reference

All tools are prefixed `kindraw_`. Inputs listed are the top-level fields. Read `SKILL.md` first for the mental model and workflows.

## Create

### `kindraw_create_diagram`

`{ mermaid, title? }` → drawing URL. Drawing from a Mermaid string (best for flowchart / sequence / class; other types rasterize — see SKILL gotcha #4).

### `kindraw_create_scene`

`{ title?, nodes[], edges[], groups?, direction?, engine? }` → drawing URL. Structured node/edge spec with real dagre layout. `nodes:{id,label,shape?,color?}`, `edges:{from,to,label?}`, `groups` → labeled frame boundaries. Prefer this over Mermaid for rich/architecture diagrams.

### `kindraw_create_doc`

`{ title?, markdown, folderId? }` → `/doc/<id>`. A markdown document (GFM: headings, lists, tables, code).

### `kindraw_create_hybrid`

`{ title, markdown, folderId?, diagram, icons? }` → `/hybrid/<id>`. A doc BESIDE a canvas in one call. Diagram nodes may carry `linkToHeading` (exact top-level `#` heading text) to deep-link a node to a doc section. Reports wired links + any `linkToHeading` that matched no section.

### `kindraw_create_board`

`{ board, folderId? }` → hybrid. Materialize a complete engineering board from a typed recipe. List recipes with `kindraw_list_boards` first.

### `kindraw_create_drawing`

`{ title?, content }` → drawing URL. From pre-serialized Excalidraw JSON. Use `create_diagram`/`create_scene` unless you already have valid `.excalidraw` content.

## Read / resolve

### `kindraw_get_hybrid`

`{ id }` → `{ id, title, docItemId, drawingItemId, url, updatedAt }`. Resolve a hybrid container. **Use this whenever `get_item` 404s on a hybrid id.**

### `kindraw_read_doc`

`{ id }` → `{ docItemId, title, markdown, sections:[{id,title}] }`. `id` may be a hybrid id (auto-resolves the doc) or a doc item id. Section `id` = the target of `kindraw://section/<id>`.

### `kindraw_read_scene`

`{ id, detail? }` → `{ drawingItemId, counts, frames:[{frameId,name}], nodes:[{id,label,frame}], edges:[{from,to,label}] }`. `id` = hybrid or drawing id. `detail:"full"` adds node geometry. Compact graph, no multi-MB JSON.

### `kindraw_list_frames`

`{ id }` → `{ drawingItemId, frames:[{frameId,name}] }`. `id` = hybrid or drawing id. Needed to write `kindraw://frame/<frameId>` mentions into the doc.

### `kindraw_list_items`

`{}` → the workspace's drawings, docs and hybrids (id, kind, title, timestamps).

### `kindraw_get_item`

`{ id }` → `{ item, content }`. Drawings and docs only. **404s on a hybrid** → returns a hint pointing at `get_hybrid`.

## Write / mutate

### `kindraw_update_doc`

`{ id, markdown }` → `{ docItemId, ok, sections, previousMarkdown }`. Overwrite a hybrid's doc (or a doc item) IN PLACE. `previousMarkdown` = cheap undo. `id` may be a hybrid or doc item id.

### `kindraw_sync_scene`

`{ itemId, check?, nodes[], edges[], groups?, direction?, engine? }`. Regenerate an existing canvas from a spec (docs-as-code). `itemId` = drawing item id (from `get_hybrid` for a hybrid). **`check:true` = drift detection, no write (CI gate). A non-check sync OVERWRITES the canvas, destroying manual edits.** No partial/frame-scoped sync yet.

### `kindraw_apply_template`

`{ templateId, title?, hybridDrawingItemId?, extraNodes?, extraEdges?, icons? }`. Instantiate a template into a new drawing, or into an existing hybrid canvas when `hybridDrawingItemId` is set. List ids via `kindraw_list_templates`.

### `kindraw_delete_item`

`{ id }` → deleted kind. Permanent. Handles drawings, docs AND hybrids (a hybrid's backing doc + drawing are cleaned up too).

## Discovery / assets

### `kindraw_list_boards`

`{}` → available board recipes for `create_board` (type, title, output).

### `kindraw_list_templates`

`{ category? }` → built-in templates (id, title, category). Ids are opaque.

### `kindraw_search_icons`

`{ query, limit? }` → `{ icons:[{id,…}] }` from Iconify. Pass ids as `icons[]` to `apply_template` / `create_hybrid` — the SVG is embedded for you.

## Not yet available (roadmap — do not assume these exist)

- `patch_scene` — surgical `deleteElements` / `updateText` / `deleteFrame` without a full regen (today `sync_scene` is all-or-nothing).
- `sync_scene` upgrades — accept a hybrid id directly, preserve `linkToHeading` links, `scope: frameId` for partial regen.
- `update_hybrid` — one cohesive call to PUT doc + canvas and re-link.
- Native `engine:"elk"` under Node (falls back to dagre).
