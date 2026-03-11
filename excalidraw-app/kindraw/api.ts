import { isKindrawHybridItem } from "./types";

import type {
  KindrawCollaborationBootstrapResponse,
  KindrawCollaborationRoom,
  KindrawHybridItemResponse,
  KindrawHybridView,
  KindrawItemKind,
  KindrawItemResponse,
  KindrawPublicItemResponse,
  KindrawSession,
  KindrawTreeResponse,
  KindrawWorkspaceTreeResponse,
} from "./types";

type JsonRequestInit = Omit<RequestInit, "body"> & {
  body?: unknown;
};

const getApiBaseUrl = () => {
  const configuredBaseUrl =
    import.meta.env.VITE_APP_KINDRAW_API_BASE_URL?.trim();
  return configuredBaseUrl
    ? configuredBaseUrl.replace(/\/+$/, "")
    : window.location.origin;
};

const createUrl = (pathname: string) => `${getApiBaseUrl()}${pathname}`;

const requestJson = async <T>(pathname: string, init?: JsonRequestInit) => {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(createUrl(pathname), {
    credentials: "include",
    ...init,
    headers,
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const isJsonResponse =
    response.headers.get("Content-Type")?.includes("application/json") || false;
  const payload = isJsonResponse ? await response.json() : null;

  if (!response.ok) {
    throw new Error(
      (payload as { error?: string } | null)?.error ||
        `Kindraw API error (${response.status})`,
    );
  }

  return payload as T;
};

export const openGithubLogin = () => {
  const returnTo = encodeURIComponent(window.location.origin);
  window.location.assign(
    createUrl(`/api/auth/login/github?returnTo=${returnTo}`),
  );
};

export const getSession = () =>
  requestJson<KindrawSession | null>("/api/auth/session");

export const logout = () =>
  requestJson<void>("/api/auth/logout", {
    method: "POST",
  });

export const getWorkspaceTree = () =>
  requestJson<KindrawWorkspaceTreeResponse>("/api/tree");

export const getTree = async (): Promise<KindrawTreeResponse> => {
  const tree = await getWorkspaceTree();
  return {
    ...tree,
    items: tree.items.filter((item) => !isKindrawHybridItem(item)),
  };
};

export const createFolder = (name: string, parentId: string | null) =>
  requestJson<{ folderId: string }>("/api/folders", {
    method: "POST",
    body: {
      name,
      parentId,
    },
  });

export const renameFolder = (folderId: string, name: string) =>
  requestJson<void>(`/api/folders/${folderId}`, {
    method: "PATCH",
    body: { name },
  });

export const deleteFolder = (folderId: string) =>
  requestJson<void>(`/api/folders/${folderId}`, {
    method: "DELETE",
  });

export const createItem = (input: {
  kind: KindrawItemKind;
  title: string;
  folderId: string | null;
  content: string;
}) =>
  requestJson<{ itemId: string }>("/api/items", {
    method: "POST",
    body: input,
  });

export const createHybridItem = (input: {
  title: string;
  folderId: string | null;
}) =>
  requestJson<{
    hybridId: string;
    docItemId: string;
    drawingItemId: string;
  }>("/api/hybrid-items", {
    method: "POST",
    body: input,
  });

export const getItem = (itemId: string) =>
  requestJson<KindrawItemResponse>(`/api/items/${itemId}`);

export const getHybridItem = (hybridId: string) =>
  requestJson<KindrawHybridItemResponse>(`/api/hybrid-items/${hybridId}`);

export const updateItemMeta = (
  itemId: string,
  input: {
    title?: string;
    folderId?: string | null;
    archived?: boolean;
  },
) =>
  requestJson<void>(`/api/items/${itemId}/meta`, {
    method: "PATCH",
    body: input,
  });

export const updateHybridItemMeta = (
  hybridId: string,
  input: {
    title?: string;
    folderId?: string | null;
    defaultView?: KindrawHybridView;
  },
) =>
  requestJson<void>(`/api/hybrid-items/${hybridId}/meta`, {
    method: "PATCH",
    body: input,
  });

export const archiveItem = (itemId: string) =>
  updateItemMeta(itemId, { archived: true });

export const restoreItem = (itemId: string) =>
  updateItemMeta(itemId, { archived: false });

export const updateItemContent = (itemId: string, content: string) =>
  requestJson<void>(`/api/items/${itemId}/content`, {
    method: "PUT",
    body: { content },
  });

export const deleteItem = (itemId: string) =>
  requestJson<void>(`/api/items/${itemId}`, {
    method: "DELETE",
  });

export const deleteHybridItem = (hybridId: string) =>
  requestJson<void>(`/api/hybrid-items/${hybridId}`, {
    method: "DELETE",
  });

export const createShareLink = (itemId: string) =>
  requestJson<{
    shareLink: {
      id: string;
      token: string;
      createdAt: string;
      revokedAt: string | null;
    };
  }>(`/api/items/${itemId}/share-links`, {
    method: "POST",
  });

export const createHybridShareLink = (hybridId: string) =>
  requestJson<{
    shareLink: {
      id: string;
      token: string;
      createdAt: string;
      revokedAt: string | null;
    };
  }>(`/api/hybrid-items/${hybridId}/share-links`, {
    method: "POST",
  });

export const enableCollaborationRoom = (itemId: string) =>
  requestJson<{
    collaborationRoom: KindrawCollaborationRoom;
  }>(`/api/items/${itemId}/collaboration-room`, {
    method: "POST",
  });

export const getCollaborationRoomBootstrap = (
  itemId: string,
  roomKey: string,
) =>
  requestJson<KindrawCollaborationBootstrapResponse>(
    `/api/collaboration-room/${itemId}/bootstrap?key=${encodeURIComponent(
      roomKey,
    )}`,
    {
      credentials: "omit",
    },
  );

export const disableCollaborationRoom = (itemId: string) =>
  requestJson<void>(`/api/items/${itemId}/collaboration-room`, {
    method: "DELETE",
  });

export const revokeShareLink = (shareLinkId: string) =>
  requestJson<void>(`/api/share-links/${shareLinkId}`, {
    method: "DELETE",
  });

export const getPublicItem = (
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

  const suffix = params.size ? `?${params.toString()}` : "";

  return requestJson<KindrawPublicItemResponse>(
    `/api/public/${token}${suffix}`,
    {
      credentials: "omit",
    },
  );
};

export const buildPublicShareUrl = (
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

  const suffix = params.size ? `?${params.toString()}` : "";
  return `${window.location.origin}/share/${token}${suffix}`;
};
