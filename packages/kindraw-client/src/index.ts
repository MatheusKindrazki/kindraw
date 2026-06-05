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
} from "./client.js";
export { startLoopbackLogin } from "./auth.js";
export type { LoopbackLoginOptions, LoopbackLoginResult } from "./auth.js";
