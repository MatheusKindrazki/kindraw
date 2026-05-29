export type KindrawIcon = {
  id: string;
  name: string;
  set: string;
};

type KindrawIconSearchResponse = {
  icons: KindrawIcon[];
};

/**
 * Mirrors the base-url resolution used in `./api.ts`. Kept local so the icon
 * data layer stays self-contained while remaining consistent with the rest of
 * the Kindraw API client.
 */
const getApiBaseUrl = () => {
  const configuredBaseUrl =
    import.meta.env.VITE_APP_KINDRAW_API_BASE_URL?.trim();
  return configuredBaseUrl
    ? configuredBaseUrl.replace(/\/+$/, "")
    : window.location.origin;
};

/**
 * Direct URL to the worker's SVG proxy. Suitable for use as an `<img src>` -
 * the browser fetches and renders the SVG without any JS parsing.
 */
export const iconSvgUrl = (id: string, color?: string) => {
  const params = new URLSearchParams({ id });
  if (color) {
    params.set("color", color);
  }
  return `${getApiBaseUrl()}/api/icons/svg?${params.toString()}`;
};

export const searchIcons = async (
  query: string,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<KindrawIcon[]> => {
  const params = new URLSearchParams({ q: query });
  if (options?.limit) {
    params.set("limit", String(options.limit));
  }

  const response = await fetch(
    `${getApiBaseUrl()}/api/icons/search?${params.toString()}`,
    {
      signal: options?.signal,
    },
  );

  if (!response.ok) {
    throw new Error(`Kindraw icon search failed (${response.status})`);
  }

  const payload = (await response.json()) as KindrawIconSearchResponse;
  return payload.icons ?? [];
};

/**
 * Fetches the raw SVG markup for an icon. Needed (unlike the preview) because
 * inserting the icon onto the canvas requires the SVG source to build a File.
 */
export const fetchIconSvg = async (
  id: string,
  options?: { color?: string; signal?: AbortSignal },
): Promise<string> => {
  const response = await fetch(iconSvgUrl(id, options?.color), {
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(`Kindraw icon fetch failed (${response.status})`);
  }

  return response.text();
};
