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

// Shared hybrid section parser (slug parity source of truth). Light: only pulls
// in `marked`, no @excalidraw transform — safe for the light index entry.
export {
  slugify,
  buildSectionId,
  parseHybridMarkdownSections,
  buildKindrawSectionLink,
  parseKindrawSectionLink,
} from "./sections/index.js";
export type { KindrawHybridSection } from "./sections/index.js";
