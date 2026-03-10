export type KindrawItemKind = "drawing" | "doc";

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

export type KindrawItem = {
  id: string;
  kind: KindrawItemKind;
  title: string;
  folderId: string | null;
  ownerId: string;
  updatedAt: string;
  createdAt: string;
  shareLinks: KindrawShareLink[];
};

export type KindrawTreeResponse = {
  folders: KindrawFolder[];
  items: KindrawItem[];
};

export type KindrawItemResponse = {
  item: KindrawItem;
  content: string;
};

export type KindrawPublicItemResponse = {
  item: Pick<KindrawItem, "id" | "kind" | "title" | "updatedAt">;
  content: string;
};

export type KindrawDraft = {
  content: string;
  updatedAt: string;
};
