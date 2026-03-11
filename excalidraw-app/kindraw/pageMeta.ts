import { APP_NAME } from "@excalidraw/common";

import type { KindrawItemKind } from "./types";

type KindrawMetaSurface = "editor" | "share";

type KindrawPageMeta = {
  documentTitle?: string | null;
  metaTitle?: string | null;
  description?: string | null;
  url?: string | null;
};

const DEFAULT_TITLE_ATTRIBUTE = "data-kindraw-default-title";
const DEFAULT_CONTENT_ATTRIBUTE = "data-kindraw-default-content";
const DEFAULT_HREF_ATTRIBUTE = "data-kindraw-default-href";

const trimValue = (value?: string | null) => value?.trim() || "";

const formatKindrawItemTitle = (title: string) => `${title} · ${APP_NAME}`;

const buildKindrawDescription = (
  title: string,
  kind: KindrawItemKind,
  surface: KindrawMetaSurface,
) => {
  if (surface === "share") {
    return kind === "doc"
      ? `Read ${title} in Kindraw.`
      : `View ${title} in Kindraw.`;
  }

  return kind === "doc"
    ? `Open ${title} in Kindraw to edit and share the document.`
    : `Open ${title} in Kindraw for drawing and realtime collaboration.`;
};

const getDefaultDocumentTitle = () => {
  const html = document.documentElement;
  const storedTitle = html.getAttribute(DEFAULT_TITLE_ATTRIBUTE);

  if (storedTitle !== null) {
    return storedTitle;
  }

  html.setAttribute(DEFAULT_TITLE_ATTRIBUTE, document.title);
  return document.title;
};

const getMetaElement = (selector: string) =>
  document.head.querySelector<HTMLMetaElement>(selector);

const getDefaultMetaContent = (selector: string) => {
  const element = getMetaElement(selector);

  if (!element) {
    return null;
  }

  const storedContent = element.getAttribute(DEFAULT_CONTENT_ATTRIBUTE);

  if (storedContent !== null) {
    return storedContent;
  }

  element.setAttribute(DEFAULT_CONTENT_ATTRIBUTE, element.content);
  return element.content;
};

const getCanonicalElement = (selector: string) =>
  document.head.querySelector<HTMLLinkElement>(selector);

const getDefaultCanonicalHref = (selector: string) => {
  const element = getCanonicalElement(selector);

  if (!element) {
    return null;
  }

  const storedHref = element.getAttribute(DEFAULT_HREF_ATTRIBUTE);

  if (storedHref !== null) {
    return storedHref;
  }

  const href = element.getAttribute("href") || "";
  element.setAttribute(DEFAULT_HREF_ATTRIBUTE, href);
  return href;
};

const normalizeMetaUrl = (url?: string | null) => {
  const trimmedUrl = trimValue(url);

  if (!trimmedUrl) {
    return "";
  }

  try {
    const normalizedUrl = new URL(trimmedUrl, window.location.origin);
    normalizedUrl.hash = "";
    return normalizedUrl.toString();
  } catch {
    return trimmedUrl;
  }
};

const setMetaContent = (selector: string, value?: string | null) => {
  const element = getMetaElement(selector);

  if (!element) {
    return;
  }

  const fallback = getDefaultMetaContent(selector) || "";
  element.content = trimValue(value) || fallback;
};

const setCanonicalHref = (selector: string, value?: string | null) => {
  const element = getCanonicalElement(selector);

  if (!element) {
    return;
  }

  const fallback = getDefaultCanonicalHref(selector) || "";
  const nextValue = normalizeMetaUrl(value) || fallback;

  if (nextValue) {
    element.setAttribute("href", nextValue);
  }
};

export const createKindrawItemPageMeta = ({
  title,
  kind,
  surface = "editor",
  url,
}: {
  title?: string | null;
  kind: KindrawItemKind;
  surface?: KindrawMetaSurface;
  url?: string | null;
}): KindrawPageMeta | null => {
  const trimmedTitle = trimValue(title);

  if (!trimmedTitle) {
    return null;
  }

  const formattedTitle = formatKindrawItemTitle(trimmedTitle);

  return {
    documentTitle: formattedTitle,
    metaTitle: formattedTitle,
    description: buildKindrawDescription(trimmedTitle, kind, surface),
    url: normalizeMetaUrl(url),
  };
};

export const syncKindrawPageMeta = (meta?: KindrawPageMeta | null) => {
  if (typeof document === "undefined") {
    return;
  }

  const defaultDocumentTitle = getDefaultDocumentTitle();
  document.title = trimValue(meta?.documentTitle) || defaultDocumentTitle;

  setMetaContent('meta[name="title"]', meta?.metaTitle);
  setMetaContent('meta[name="description"]', meta?.description);
  setMetaContent('meta[property="og:title"]', meta?.metaTitle);
  setMetaContent('meta[property="og:description"]', meta?.description);
  setMetaContent('meta[property="twitter:title"]', meta?.metaTitle);
  setMetaContent('meta[property="twitter:description"]', meta?.description);
  setMetaContent('meta[property="og:url"]', meta?.url);
  setMetaContent('meta[property="twitter:url"]', meta?.url);
  setCanonicalHref('link[rel="canonical"]', meta?.url);
};
