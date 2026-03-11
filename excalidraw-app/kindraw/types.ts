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

export type KindrawFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KindrawShareLink = {
  id: string;
  token: string;
  createdAt: string;
  revokedAt: string | null;
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
