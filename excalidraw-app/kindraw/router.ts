import type { KindrawItem } from "./types";

const ROUTE_EVENT = "kindraw:route-change";
let historyPatched = false;

export type KindrawRoute =
  | { kind: "workspace"; folderId: string | null }
  | { kind: "drawing"; itemId: string }
  | { kind: "doc"; itemId: string }
  | { kind: "share"; token: string }
  | { kind: "public" };

const trimTrailingSlash = (pathname: string) => {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.replace(/\/+$/, "");
  }
  return pathname;
};

export const matchKindrawRoute = (pathname: string): KindrawRoute => {
  const normalized = trimTrailingSlash(pathname);

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

  if (normalized.startsWith("/share/")) {
    return { kind: "share", token: normalized.replace("/share/", "") };
  }

  return { kind: "public" };
};

export const isKindrawPath = (pathname: string) =>
  matchKindrawRoute(pathname).kind !== "public";

export const buildFolderPath = (folderId: string | null) =>
  folderId ? `/folder/${folderId}` : "/";

export const buildItemPath = (item: Pick<KindrawItem, "id" | "kind">) =>
  item.kind === "drawing" ? `/draw/${item.id}` : `/doc/${item.id}`;

export const buildSharePath = (token: string) => `/share/${token}`;

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
  typeof window === "undefined" ? "/" : window.location.pathname;
