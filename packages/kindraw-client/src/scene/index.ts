// Public surface of the scene builder. This is the opt-in heavier path
// (bundles @excalidraw/element transform + dagre), exposed via
// "@kindraw/client/scene". It does NOT import jsdom or mermaid — that's the
// whole point: structured specs lay out DOM-free with real spacing.

export { buildScene, sceneMaxY } from "./build.js";
export type { BuildResult, BuildSceneExtras, ExEl } from "./build.js";

export { buildFromSkeletons } from "./buildFromSkeletons.js";
export type { BuildFromSkeletonsResult } from "./buildFromSkeletons.js";

export { validateDiagramSpec } from "./spec.js";
export type {
  DiagramSpec,
  DiagramNode,
  DiagramEdge,
  DiagramGroup,
  NodeShape,
  Direction,
  NormalizedSpec,
} from "./spec.js";

export { layoutNodes, layoutNodesAsync } from "./layout.js";
export type { PlacedNode } from "./layout.js";

export { extractDiagramSpec } from "./extract.js";
export type {
  RawSceneElement,
  ExtractWarning,
  ExtractDiagramSpecResult,
} from "./extract.js";

export { syncScene } from "./sync.js";
export type {
  SceneSyncClient,
  SyncSceneInput,
  SyncSceneResult,
} from "./sync.js";
