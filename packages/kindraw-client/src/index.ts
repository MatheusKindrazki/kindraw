// Light entrypoint: HTTP client + OAuth loopback. No mermaid/jsdom/canvas here
// so `kindraw items` and MCP CRUD stay lean. Mermaid→Excalidraw generation
// lives in the opt-in "@kindraw/client/generate" subpath.
export {
  KindrawClient,
  KindrawApiError,
  DEFAULT_API_BASE_URL,
} from "./client.js";
export type {
  KindrawClientOptions,
  KindrawItemSummary,
  KindrawMe,
  CreateDrawingResult,
  CreateDocResult,
  CreateHybridResult,
} from "./client.js";
export { startLoopbackLogin } from "./auth.js";
export type { LoopbackLoginOptions, LoopbackLoginResult } from "./auth.js";

// The shared hybrid section parser (slugify, buildSectionId,
// parseHybridMarkdownSections, buildKindrawSectionLink, parseKindrawSectionLink)
// is intentionally NOT re-exported here: it pulls in `marked`, and this index is
// the documented LIGHT entry (no heavy deps). Consumers that need the slug
// helpers import them from the dedicated "@kindraw/client/sections" entrypoint.
