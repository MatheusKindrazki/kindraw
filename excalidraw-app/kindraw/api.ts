import { isKindrawHybridItem } from "./types";

import type {
  KindrawAcceptInviteResult,
  KindrawApiToken,
  KindrawApiTokenSecret,
  KindrawCollaborationBootstrapResponse,
  KindrawCollaborationRoom,
  KindrawCreatedInvite,
  KindrawFolderShare,
  KindrawHybridShare,
  KindrawHybridItemResponse,
  KindrawHybridView,
  KindrawInviteMetadata,
  KindrawItemKind,
  KindrawItemResponse,
  KindrawPendingInvite,
  KindrawPublicItemResponse,
  KindrawSession,
  KindrawShareLinkAccess,
  KindrawShareRole,
  KindrawTreeResponse,
  KindrawUser,
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

// returnTo inclui a ORIGEM + o PATH atual (sem query/hash), para que o
// pós-login volte à mesma página — ex.: /invite/<token>. O backend revalida o
// path com whitelist anti-open-redirect (parseReturnPath em index.ts); quando o
// path não passa, ele cai de volta para "/".
const currentReturnTo = () =>
  encodeURIComponent(window.location.origin + window.location.pathname);

export const openGithubLogin = () => {
  window.location.assign(
    createUrl(`/api/auth/login/github?returnTo=${currentReturnTo()}`),
  );
};

export const openGoogleLogin = () => {
  window.location.assign(
    createUrl(`/api/auth/login/google?returnTo=${currentReturnTo()}`),
  );
};

export const getSession = () =>
  requestJson<KindrawSession | null>("/api/auth/session");

// Public landing-page waitlist capture. No auth; the backend validates the
// email and is idempotent on duplicates. Throws on 400 (invalid email) so the
// form can surface an inline error.
export const joinWaitlist = (email: string, source = "landing") =>
  requestJson<{ ok: true }>("/api/waitlist", {
    method: "POST",
    body: { email, source },
  });

export const listApiTokens = () =>
  requestJson<{ tokens: KindrawApiToken[] }>("/api/auth/tokens");

export const createApiToken = (name: string) =>
  requestJson<KindrawApiTokenSecret>("/api/auth/tokens", {
    method: "POST",
    body: { name },
  });

export const revokeApiToken = (prefix: string) =>
  requestJson<void>(`/api/auth/tokens/${encodeURIComponent(prefix)}`, {
    method: "DELETE",
  });

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

/* ────────────────────────────────────────────────────────
   Compartilhamento de pastas com usuários específicos
   ──────────────────────────────────────────────────────── */

export const searchKindrawUsers = (q: string) =>
  requestJson<{ users: KindrawUser[] }>(
    `/api/users/search?q=${encodeURIComponent(q)}`,
  );

export const listFolderShares = (folderId: string) =>
  requestJson<{ shares: KindrawFolderShare[] }>(
    `/api/folders/${folderId}/shares`,
  );

export const grantFolderShare = (
  folderId: string,
  login: string,
  role: KindrawShareRole,
) =>
  requestJson<{ share: KindrawFolderShare }>(
    `/api/folders/${folderId}/shares`,
    {
      method: "POST",
      body: { login, role },
    },
  );

export const updateFolderShareRole = (
  folderId: string,
  shareId: string,
  role: KindrawShareRole,
) =>
  requestJson<{ share: KindrawFolderShare }>(
    `/api/folders/${folderId}/shares/${shareId}`,
    {
      method: "PATCH",
      body: { role },
    },
  );

export const revokeFolderShare = (folderId: string, shareId: string) =>
  requestJson<void>(`/api/folders/${folderId}/shares/${shareId}`, {
    method: "DELETE",
  });

/* ────────────────────────────────────────────────────────
   Compartilhamento de documentos híbridos com usuários específicos
   ──────────────────────────────────────────────────────── */

export const listHybridShares = (hybridId: string) =>
  requestJson<{ shares: KindrawHybridShare[] }>(
    `/api/hybrid-items/${hybridId}/shares`,
  );

export const grantHybridShare = (
  hybridId: string,
  login: string,
  role: KindrawShareRole,
) =>
  requestJson<{ share: KindrawHybridShare }>(
    `/api/hybrid-items/${hybridId}/shares`,
    {
      method: "POST",
      body: { login, role },
    },
  );

export const updateHybridShareRole = (
  hybridId: string,
  shareId: string,
  role: KindrawShareRole,
) =>
  requestJson<{ share: KindrawHybridShare }>(
    `/api/hybrid-items/${hybridId}/shares/${shareId}`,
    {
      method: "PATCH",
      body: { role },
    },
  );

export const revokeHybridShare = (hybridId: string, shareId: string) =>
  requestJson<void>(`/api/hybrid-items/${hybridId}/shares/${shareId}`, {
    method: "DELETE",
  });

/* ────────────────────────────────────────────────────────
   Convites por link (para quem ainda não tem acesso/conta)
   ──────────────────────────────────────────────────────── */

// Metadados de um convite resolvido por token. NÃO exige login (a página de
// convite mostra "Fulano convidou você para X" antes de o visitante logar).
export const getInvite = (token: string) =>
  requestJson<{ invite: KindrawInviteMetadata }>(
    `/api/invites/${encodeURIComponent(token)}`,
    { credentials: "include" },
  );

// Aceita o convite no nome da conta logada (exige sessão). Devolve onde
// redirecionar (pasta ou híbrido).
export const acceptInvite = (token: string) =>
  requestJson<KindrawAcceptInviteResult>(
    `/api/invites/${encodeURIComponent(token)}/accept`,
    { method: "POST" },
  );

export const createFolderInvite = (
  folderId: string,
  email: string,
  role: KindrawShareRole,
) =>
  requestJson<{ invite: KindrawCreatedInvite }>(
    `/api/folders/${folderId}/invites`,
    {
      method: "POST",
      body: { email, role },
    },
  );

export const listFolderInvites = (folderId: string) =>
  requestJson<{ invites: KindrawPendingInvite[] }>(
    `/api/folders/${folderId}/invites`,
  );

export const revokeFolderInvite = (folderId: string, inviteId: string) =>
  requestJson<void>(`/api/folders/${folderId}/invites/${inviteId}`, {
    method: "DELETE",
  });

export const createHybridInvite = (
  hybridId: string,
  email: string,
  role: KindrawShareRole,
) =>
  requestJson<{ invite: KindrawCreatedInvite }>(
    `/api/hybrid-items/${hybridId}/invites`,
    {
      method: "POST",
      body: { email, role },
    },
  );

export const listHybridInvites = (hybridId: string) =>
  requestJson<{ invites: KindrawPendingInvite[] }>(
    `/api/hybrid-items/${hybridId}/invites`,
  );

export const revokeHybridInvite = (hybridId: string, inviteId: string) =>
  requestJson<void>(`/api/hybrid-items/${hybridId}/invites/${inviteId}`, {
    method: "DELETE",
  });

// Monta a URL absoluta de um convite a partir do link relativo (/invite/<token>)
// retornado pelo backend.
export const buildInviteUrl = (link: string) =>
  `${window.location.origin}${link}`;

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

// Converte um drawing existente em documento híbrido (cria um doc novo ligado
// ao canvas atual). Devolve os ids do híbrido criado.
export const convertDrawingToHybrid = (
  drawingItemId: string,
  input?: { title?: string },
) =>
  requestJson<{
    hybridId: string;
    docItemId: string;
    drawingItemId: string;
  }>(`/api/items/${drawingItemId}/convert-to-hybrid`, {
    method: "POST",
    body: input ?? {},
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

export const createHybridShareLink = (
  hybridId: string,
  access: KindrawShareLinkAccess = "read",
) =>
  requestJson<{
    shareLink: {
      id: string;
      token: string;
      createdAt: string;
      revokedAt: string | null;
      access: KindrawShareLinkAccess;
    };
  }>(`/api/hybrid-items/${hybridId}/share-links`, {
    method: "POST",
    body: { access },
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
