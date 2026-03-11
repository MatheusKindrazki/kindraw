import type {
  KindrawHybridItem,
  KindrawHybridView,
  KindrawItem,
} from "./types";

const ROUTE_EVENT = "kindraw:route-change";
let historyPatched = false;

export type KindrawRoute =
  | { kind: "workspace"; folderId: string | null }
  | { kind: "drawing"; itemId: string }
  | { kind: "doc"; itemId: string }
  | {
      kind: "hybrid";
      hybridId: string;
      view: KindrawHybridView;
      sectionId: string | null;
    }
  | {
      kind: "share";
      token: string;
      view: KindrawHybridView;
      sectionId: string | null;
    }
  | { kind: "public" };

const trimTrailingSlash = (pathname: string) => {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.replace(/\/+$/, "");
  }
  return pathname;
};

const normalizeRouteInput = (value: string) => {
  const url = new URL(value, "http://kindraw.local");
  return {
    pathname: trimTrailingSlash(url.pathname),
    searchParams: url.searchParams,
  };
};

const parseHybridView = (
  value: string | null,
  fallback: KindrawHybridView,
): KindrawHybridView =>
  value === "document" || value === "both" || value === "canvas"
    ? value
    : fallback;

export const matchKindrawRoute = (pathname: string): KindrawRoute => {
  const { pathname: normalized, searchParams } = normalizeRouteInput(pathname);

  if (normalized === "/") {
    return { kind: "workspace", folderId: null };
  }

  if (normalized.startsWith("/folder/")) {
    const folderId = normalized.replace("/folder/", "");
    return { kind: "workspace", folderId: folderId || null };
  }

  if (normalized.startsWith("/draw/")) {
    return { kind: "drawing", itemId: normalized.replace("/draw/", "") };
  }

  if (normalized.startsWith("/doc/")) {
    return { kind: "doc", itemId: normalized.replace("/doc/", "") };
  }

  if (normalized.startsWith("/hybrid/")) {
    return {
      kind: "hybrid",
      hybridId: normalized.replace("/hybrid/", ""),
      view: parseHybridView(searchParams.get("view"), "both"),
      sectionId: searchParams.get("section"),
    };
  }

  if (normalized.startsWith("/share/")) {
    return {
      kind: "share",
      token: normalized.replace("/share/", ""),
      view: parseHybridView(searchParams.get("view"), "both"),
      sectionId: searchParams.get("section"),
    };
  }

  return { kind: "public" };
};

export const isKindrawPath = (pathname: string) =>
  matchKindrawRoute(pathname).kind !== "public";

export const buildFolderPath = (folderId: string | null) =>
  folderId ? `/folder/${folderId}` : "/";

export const buildItemPath = (item: Pick<KindrawItem, "id" | "kind">) =>
  item.kind === "drawing" ? `/draw/${item.id}` : `/doc/${item.id}`;

export const buildHybridPath = (
  hybridId: string,
  opts?: {
    view?: KindrawHybridView;
    sectionId?: string | null;
  },
) => {
  const params = new URLSearchParams();
  params.set("view", opts?.view || "both");
  if (opts?.sectionId) {
    params.set("section", opts.sectionId);
  }
  return `/hybrid/${hybridId}?${params.toString()}`;
};

export const buildHybridItemPath = (
  item: Pick<KindrawHybridItem, "id" | "defaultView">,
) =>
  buildHybridPath(item.id, {
    view: item.defaultView,
  });

export const buildSharePath = (
  token: string,
  opts?: {
    view?: KindrawHybridView;
    sectionId?: string | null;
  },
) => {
  const params = new URLSearchParams();
  if (opts?.view) {
    params.set("view", opts.view);
  }
  if (opts?.sectionId) {
    params.set("section", opts.sectionId);
  }
  return params.size
    ? `/share/${token}?${params.toString()}`
    : `/share/${token}`;
};

export const shouldAutoCreateRootDrawing = (
  pathname: string,
  route: KindrawRoute,
) => pathname === "/" && route.kind === "workspace" && route.folderId === null;

const emitRouteChange = () => {
  window.dispatchEvent(new Event(ROUTE_EVENT));
};

const patchHistory = () => {
  if (historyPatched || typeof window === "undefined") {
    return;
  }

  historyPatched = true;

  const { pushState, replaceState } = window.history;

  window.history.pushState = function pushStatePatched(...args) {
    const result = pushState.apply(this, args);
    emitRouteChange();
    return result;
  };

  window.history.replaceState = function replaceStatePatched(...args) {
    const result = replaceState.apply(this, args);
    emitRouteChange();
    return result;
  };
};

export const navigateKindraw = (
  nextPath: string,
  opts?: { replace?: boolean },
) => {
  patchHistory();
  if (opts?.replace) {
    window.history.replaceState({}, "", nextPath);
  } else {
    window.history.pushState({}, "", nextPath);
  }
};

export const subscribeToLocation = (listener: () => void) => {
  patchHistory();
  window.addEventListener("popstate", listener);
  window.addEventListener(ROUTE_EVENT, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(ROUTE_EVENT, listener);
  };
};

export const getLocationPathname = () =>
  typeof window === "undefined"
    ? "/"
    : `${window.location.pathname}${window.location.search}`;
