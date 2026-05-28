import type { Env, WorkerCacheStorage } from "./types";

declare const caches: WorkerCacheStorage;

const ICONIFY_API_BASE = "https://api.iconify.design";

const DEFAULT_SEARCH_LIMIT = 48;
const MAX_SEARCH_LIMIT = 96;

const SEARCH_CACHE_CONTROL = "public, max-age=3600";
const SVG_CACHE_CONTROL = "public, max-age=31536000, immutable";

const ICON_ID_PATTERN = /^[a-z0-9-]+:[a-z0-9-]+$/iu;
const SAFE_COLOR_PATTERN = /^#?[a-z0-9]+$/iu;

type IconifySearchResponse = {
  icons?: unknown;
  total?: unknown;
};

type NormalizedIcon = {
  id: string;
  name: string;
  set: string;
};

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

const clampLimit = (raw: string | null) => {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SEARCH_LIMIT;
  }
  return Math.min(parsed, MAX_SEARCH_LIMIT);
};

const normalizeIcons = (response: IconifySearchResponse): NormalizedIcon[] => {
  if (!Array.isArray(response.icons)) {
    return [];
  }

  const icons: NormalizedIcon[] = [];
  for (const entry of response.icons) {
    if (typeof entry !== "string") {
      continue;
    }

    const separator = entry.indexOf(":");
    if (separator <= 0 || separator >= entry.length - 1) {
      continue;
    }

    icons.push({
      id: entry,
      set: entry.slice(0, separator),
      name: entry.slice(separator + 1),
    });
  }

  return icons;
};

export const handleIconSearch = async (
  request: Request,
  _env: Env,
): Promise<Response> => {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() || "";

  if (!query) {
    return jsonResponse(
      { icons: [] },
      { headers: { "Cache-Control": SEARCH_CACHE_CONTROL } },
    );
  }

  const limit = clampLimit(url.searchParams.get("limit"));

  const upstreamUrl = new URL(`${ICONIFY_API_BASE}/search`);
  upstreamUrl.searchParams.set("query", query);
  upstreamUrl.searchParams.set("limit", String(limit));

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl.toString(), {
      headers: { Accept: "application/json" },
    });
  } catch {
    return errorResponse(502, "Icon search provider is unavailable.");
  }

  if (!upstream.ok) {
    return errorResponse(502, "Icon search provider returned an error.");
  }

  let payload: IconifySearchResponse;
  try {
    payload = (await upstream.json()) as IconifySearchResponse;
  } catch {
    return errorResponse(502, "Icon search provider returned invalid data.");
  }

  return jsonResponse(
    { icons: normalizeIcons(payload) },
    { headers: { "Cache-Control": SEARCH_CACHE_CONTROL } },
  );
};

export const handleIconSvg = async (
  request: Request,
  _env: Env,
): Promise<Response> => {
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim() || "";

  if (!ICON_ID_PATTERN.test(id)) {
    return errorResponse(400, "A valid icon id (prefix:name) is required.");
  }

  const separator = id.indexOf(":");
  const prefix = id.slice(0, separator);
  const name = id.slice(separator + 1);

  const upstreamUrl = new URL(`${ICONIFY_API_BASE}/${prefix}/${name}.svg`);
  const color = url.searchParams.get("color")?.trim();
  if (color && SAFE_COLOR_PATTERN.test(color)) {
    upstreamUrl.searchParams.set("color", color);
  }

  const cache = caches.default;
  const cacheKey = new Request(upstreamUrl.toString(), { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl.toString(), {
      headers: { Accept: "image/svg+xml" },
    });
  } catch {
    return errorResponse(502, "Icon provider is unavailable.");
  }

  if (!upstream.ok) {
    return errorResponse(404, "Icon not found.");
  }

  const svg = await upstream.text();
  if (!svg.trimStart().startsWith("<svg")) {
    return errorResponse(404, "Icon not found.");
  }

  const response = new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": SVG_CACHE_CONTROL,
    },
  });

  await cache.put(cacheKey, response.clone());

  return response;
};
