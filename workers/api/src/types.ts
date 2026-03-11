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

export type KindrawCollaborationRoom = {
  roomId: string;
  roomKey: string;
  enabledAt: string;
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
};

export type KindrawTreeResponse = {
  folders: KindrawFolder[];
  items: KindrawItem[];
};

export type KindrawItemResponse = {
  item: KindrawItem;
  content: string;
  collaborationRoom: KindrawCollaborationRoom | null;
};

export type KindrawCollaborationBootstrapResponse = {
  item: Pick<KindrawItem, "id" | "kind" | "title" | "updatedAt" | "createdAt">;
  content: string;
  collaborationRoom: KindrawCollaborationRoom;
};

export type KindrawPublicItemResponse = {
  item: Pick<KindrawItem, "id" | "kind" | "title" | "updatedAt">;
  content: string;
};

export type SessionRecord = {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
  lastSeenAt: string;
};

export type FolderRecord = Omit<KindrawFolder, "parentId"> & {
  ownerId: string;
  parentId: string | null;
};

export type ItemRecord = Omit<KindrawItem, "shareLinks" | "folderId"> & {
  folderId: string | null;
  contentBlobKey: string;
  collaborationRoomKey: string | null;
};

export type ShareLinkRecord = KindrawShareLink & {
  itemId: string;
  createdByUserId: string;
};

export type CreateFolderInput = {
  name: string;
  parentId?: string | null;
};

export type CreateItemInput = {
  kind: KindrawItemKind;
  title: string;
  folderId?: string | null;
  content: string;
};

export type PatchFolderInput = {
  name?: string;
  parentId?: string | null;
};

export type PatchItemMetaInput = {
  title?: string;
  folderId?: string | null;
  archived?: boolean;
};

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

export interface R2ObjectBody {
  text(): Promise<string>;
}

export interface R2PutOptions {
  httpMetadata?: {
    contentType?: string;
  };
}

export interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView,
    options?: R2PutOptions,
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface DurableObjectId {
  toString(): string;
}

export interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

export interface DurableObjectStorage {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
}

export interface DurableObjectState {
  storage: DurableObjectStorage;
}

export type Env = {
  KINDRAW_DB: D1Database;
  KINDRAW_BLOBS: R2Bucket;
  KINDRAW_COLLAB: DurableObjectNamespace;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  KINDRAW_APP_ORIGIN?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_BASE_URL?: string;
  OPENROUTER_TEXT_MODEL?: string;
  OPENROUTER_VISION_MODEL?: string;
  OPENROUTER_HTTP_REFERER?: string;
  OPENROUTER_APP_TITLE?: string;
};

export type AuthContext = {
  session: SessionRecord;
  user: KindrawUser;
};
