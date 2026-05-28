export type KindrawTemplateMeta = {
  id: string;
  title: string;
  description: string;
  category: string;
};

/**
 * Excalidraw element skeletons (the input shape of
 * `convertToExcalidrawElements`). Typed loosely on purpose - the converter
 * validates/normalizes the payload, so a precise type buys us little here.
 */
export type KindrawTemplateSkeleton = Record<string, unknown>;

export type KindrawTemplate = KindrawTemplateMeta & {
  elements: readonly KindrawTemplateSkeleton[];
};

type KindrawTemplateListResponse = {
  templates: KindrawTemplateMeta[];
};

/**
 * Mirrors the base-url resolution used in `./iconsApi.ts`. Kept local so the
 * template data layer stays self-contained while remaining consistent with the
 * rest of the Kindraw API client.
 */
const getApiBaseUrl = () => {
  const configuredBaseUrl =
    import.meta.env.VITE_APP_KINDRAW_API_BASE_URL?.trim();
  return configuredBaseUrl
    ? configuredBaseUrl.replace(/\/+$/, "")
    : window.location.origin;
};

export const listTemplates = async (options?: {
  signal?: AbortSignal;
}): Promise<KindrawTemplateMeta[]> => {
  const response = await fetch(`${getApiBaseUrl()}/api/templates`, {
    signal: options?.signal,
    // Curated content can change; avoid the browser serving a stale catalog.
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Kindraw template list failed (${response.status})`);
  }

  const payload = (await response.json()) as KindrawTemplateListResponse;
  return payload.templates ?? [];
};

export const getTemplate = async (
  id: string,
  options?: { signal?: AbortSignal },
): Promise<KindrawTemplate> => {
  const response = await fetch(
    `${getApiBaseUrl()}/api/templates/${encodeURIComponent(id)}`,
    {
      signal: options?.signal,
      // Curated content can change; avoid the browser serving a stale template.
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Kindraw template fetch failed (${response.status})`);
  }

  return (await response.json()) as KindrawTemplate;
};
