// These modules are resolved & bundled by esbuild (build.mjs) from the
// monorepo source / node_modules. tsc only typechecks our own code, so we
// declare them loosely to avoid requiring their (browser-oriented) types here.
declare module "@excalidraw/element" {
  export const convertToExcalidrawElements: (
    elements: unknown[],
    opts?: { regenerateIds?: boolean },
  ) => Array<{ type: string; isDeleted?: boolean; [key: string]: unknown }>;

  export interface TextMetricsProvider {
    getLineWidth(text: string, fontString: string): number;
  }

  export const setCustomTextMetricsProvider: (
    provider: TextMetricsProvider,
  ) => void;
}

declare module "@excalidraw/mermaid-to-excalidraw" {
  export const parseMermaidToExcalidraw: (
    definition: string,
  ) => Promise<{ elements: unknown[]; files?: Record<string, unknown> }>;
}
