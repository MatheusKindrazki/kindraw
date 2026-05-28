import type { Env, WorkerCacheStorage } from "./types";

declare const caches: WorkerCacheStorage;

type KindrawCuratedLibrary = {
  id: string;
  title: string;
  description: string;
  source: string;
};

const CDN_BASE =
  "https://cdn.jsdelivr.net/gh/excalidraw/excalidraw-libraries@main";

const LIST_CACHE_CONTROL = "public, max-age=300";
const BLOB_CACHE_CONTROL = "public, max-age=86400";

const CURATED_LIBRARIES: KindrawCuratedLibrary[] = [
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

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

const errorResponse = (status: number, message: string) =>
  jsonResponse(
    {
      error: message,
      status,
    },
    { status },
  );

const isExcalidrawLibrary = (raw: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return false;
  }

  const candidate = parsed as Record<string, unknown>;
  return (
    candidate.type === "excalidrawlib" ||
    Array.isArray(candidate.libraryItems) ||
    Array.isArray(candidate.library)
  );
};

export const handleLibraryList = async (
  _request: Request,
  _env: Env,
): Promise<Response> => {
  const libraries = CURATED_LIBRARIES.map(({ id, title, description }) => ({
    id,
    title,
    description,
  }));

  return jsonResponse(
    { libraries },
    { headers: { "Cache-Control": LIST_CACHE_CONTROL } },
  );
};

export const handleLibraryBlob = async (
  _request: Request,
  _env: Env,
  id: string,
): Promise<Response> => {
  const library = CURATED_LIBRARIES.find((entry) => entry.id === id);

  if (!library) {
    return errorResponse(404, "Library not found.");
  }

  const cache = caches.default;
  const cacheKey = new Request(library.source, { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  let upstream: Response;
  try {
    upstream = await fetch(library.source, {
      headers: { Accept: "application/json" },
    });
  } catch {
    return errorResponse(502, "Library provider is unavailable.");
  }

  if (!upstream.ok) {
    return errorResponse(502, "Library provider returned an error.");
  }

  const body = await upstream.text();
  if (!isExcalidrawLibrary(body)) {
    return errorResponse(502, "Library provider returned invalid data.");
  }

  const response = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": BLOB_CACHE_CONTROL,
    },
  });

  await cache.put(cacheKey, response.clone());

  return response;
};
