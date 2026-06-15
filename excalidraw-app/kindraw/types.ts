export type KindrawItemKind = "drawing" | "doc";
export type KindrawHybridView = "document" | "both" | "canvas";
export type KindrawHybridRole = "doc" | "drawing";

export type KindrawUser = {
  id: string;
  githubLogin: string;
  name: string;
  avatarUrl: string | null;
};

export type KindrawSession = {
  user: KindrawUser;
};

export type KindrawShareRole = "viewer" | "editor";

export type KindrawFolderShare = {
  id: string;
  role: KindrawShareRole;
  user: KindrawUser;
  createdAt: string;
};

// Mesmo shape do folder share, mas para um documento híbrido.
export type KindrawHybridShare = KindrawFolderShare;

export type KindrawFolderSharedMeta = {
  role: KindrawShareRole;
  ownerId: string;
  ownerLogin: string;
  ownerName: string;
};

export type KindrawFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Presente apenas quando a pasta foi compartilhada COMIGO (ausente = pasta própria). */
  shared?: KindrawFolderSharedMeta;
};

export type KindrawShareLinkAccess = "read" | "live-edit";

export type KindrawShareLink = {
  id: string;
  token: string;
  createdAt: string;
  revokedAt: string | null;
  // Default "read" para links antigos.
  access?: KindrawShareLinkAccess;
};

// API token shown when listing (no secret). Revocation is keyed by `prefix`.
export type KindrawApiToken = {
  prefix: string;
  name: string;
  scope: string;
  createdAt: string;
  expiresAt: string | null;
  lastSeenAt: string | null;
};

// Returned exactly once, on creation — `secret` is the raw token.
export type KindrawApiTokenSecret = {
  secret: string;
  token: KindrawApiToken;
};

export type KindrawCollaborationRoom = {
  roomId: string;
  roomKey: string;
  enabledAt: string;
};

export type KindrawHybridMetadata = {
  hybridId: string;
  role: KindrawHybridRole;
  docItemId: string;
  drawingItemId: string;
  defaultView: KindrawHybridView;
};

export type KindrawItem = {
  id: string;
  kind: KindrawItemKind;
  title: string;
  folderId: string | null;
  ownerId: string;
  updatedAt: string;
  createdAt: string;
  archivedAt: string | null;
  shareLinks: KindrawShareLink[];
  collaborationRoomId: string | null;
  collaborationEnabledAt: string | null;
  hybrid?: KindrawHybridMetadata | null;
  /** Preview do conteúdo gerado no autosave (geração ainda não implementada). */
  thumbnailUrl?: string | null;
  /** Presente quando o item pertence a uma pasta compartilhada COMIGO (ausente = item próprio, acesso total). */
  sharedRole?: KindrawShareRole;
};

export type KindrawHybridItem = {
  id: string;
  kind: "hybrid";
  title: string;
  folderId: string | null;
  ownerId: string;
  updatedAt: string;
  createdAt: string;
  archivedAt: null;
  shareLinks: KindrawShareLink[];
  defaultView: KindrawHybridView;
  docItemId: string;
  drawingItemId: string;
  /** Preview do conteúdo gerado no autosave (geração ainda não implementada). */
  thumbnailUrl?: string | null;
  /** Presente quando o item pertence a uma pasta compartilhada COMIGO (ausente = item próprio, acesso total). */
  sharedRole?: KindrawShareRole;
};

export type KindrawTreeItem = KindrawItem | KindrawHybridItem;

export type KindrawTreeResponse = {
  folders: KindrawFolder[];
  items: KindrawItem[];
};

export type KindrawWorkspaceTreeResponse = {
  folders: KindrawFolder[];
  items: KindrawTreeItem[];
};

export type KindrawItemResponse = {
  item: KindrawItem;
  content: string;
  collaborationRoom: KindrawCollaborationRoom | null;
};

export type KindrawHybridItemResponse = {
  hybrid: KindrawHybridItem;
  document: KindrawItemResponse;
  drawing: KindrawItemResponse;
};

export type KindrawCollaborationBootstrapResponse = {
  item: Pick<KindrawItem, "id" | "kind" | "title" | "updatedAt" | "createdAt">;
  content: string;
  collaborationRoom: KindrawCollaborationRoom;
};

export type KindrawPublicItemResponse = {
  item: Pick<KindrawItem, "id" | "kind" | "title" | "updatedAt">;
  content: string;
  hybrid?: {
    id: string;
    defaultView: KindrawHybridView;
    drawing: {
      item: Pick<KindrawItem, "id" | "kind" | "title" | "updatedAt">;
      content: string;
    };
  } | null;
};

export type KindrawDraft = {
  content: string;
  updatedAt: string;
};

export const isKindrawHybridItem = (
  item: KindrawTreeItem,
): item is KindrawHybridItem => item.kind === "hybrid";
