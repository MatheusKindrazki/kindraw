export type KindrawCuratedLibrary = {
  id: string;
  title: string;
  description: string;
  source: string;
};

/**
 * Mirrors the base-url resolution used in `./api.ts` / `./iconsApi.ts`. Kept
 * local so the curated-library data layer stays self-contained while remaining
 * consistent with the rest of the Kindraw API client.
 */
const getApiBaseUrl = () => {
  const configuredBaseUrl =
    import.meta.env.VITE_APP_KINDRAW_API_BASE_URL?.trim();
  return configuredBaseUrl
    ? configuredBaseUrl.replace(/\/+$/, "")
    : window.location.origin;
};

/**
 * The curated catalog now lives in the worker (`workers/api/src/libraries.ts`),
 * which also proxies the upstream `.excalidrawlib` blobs. The front-end only
 * needs the worker-relative ids/metadata; each `source` resolves to the
 * worker's blob proxy so no CDN URL is hardcoded here.
 */
export const KINDRAW_CURATED_LIBRARIES: KindrawCuratedLibrary[] = [
  {
    id: "c4-architecture",
    title: "C4 Architecture",
    description:
      "Containers, systems and relationships for architecture sketches and reviews.",
    source: `${getApiBaseUrl()}/api/libraries/c4-architecture`,
  },
  {
    id: "uml-er",
    title: "UML + ER",
    description:
      "Entities, relations and modeling blocks for product and backend diagrams.",
    source: `${getApiBaseUrl()}/api/libraries/uml-er`,
  },
  {
    id: "system-design",
    title: "System Design",
    description:
      "General-purpose service, API and infrastructure shapes for technical flows.",
    source: `${getApiBaseUrl()}/api/libraries/system-design`,
  },
  {
    id: "presentation-bundle",
    title: "Presentation Bundle",
    description:
      "Slide, storyboard and workshop primitives for demos and async updates.",
    source: `${getApiBaseUrl()}/api/libraries/presentation-bundle`,
  },
];
