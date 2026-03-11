export type KindrawCuratedLibrary = {
  id: string;
  title: string;
  description: string;
  source: string;
};

const CDN_BASE =
  "https://cdn.jsdelivr.net/gh/excalidraw/excalidraw-libraries@main";

export const KINDRAW_CURATED_LIBRARIES: KindrawCuratedLibrary[] = [
  {
    id: "c4-architecture",
    title: "C4 Architecture",
    description:
      "Containers, systems and relationships for architecture sketches and reviews.",
    source: `${CDN_BASE}/libraries/dmitry-burnyshev/c4-architecture.excalidrawlib`,
  },
  {
    id: "uml-er",
    title: "UML + ER",
    description:
      "Entities, relations and modeling blocks for product and backend diagrams.",
    source: `${CDN_BASE}/libraries/BjoernKW/UML-ER-library.excalidrawlib`,
  },
  {
    id: "system-design",
    title: "System Design",
    description:
      "General-purpose service, API and infrastructure shapes for technical flows.",
    source: `${CDN_BASE}/libraries/aretecode/system-design-template.excalidrawlib`,
  },
  {
    id: "presentation-bundle",
    title: "Presentation Bundle",
    description:
      "Slide, storyboard and workshop primitives for demos and async updates.",
    source: `${CDN_BASE}/libraries/gabrielamacakova/presentation-bundle.excalidrawlib`,
  },
];
