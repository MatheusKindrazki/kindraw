export type KindrawItemKind = "drawing" | "doc";
export type KindrawHybridView = "document" | "both" | "canvas";

export type KindrawUser = {
  id: string;
  // GitHub login handle. Null for accounts that only ever logged in with Google
  // (kept for back-compat: callers use it as a stable display/identity hint).
  githubLogin: string | null;
  name: string;
  avatarUrl: string | null;
  // Verified primary email, when the provider exposed one. This is the key we
  // use to link a GitHub and a Google login into a single account.
  email: string | null;
};

export type KindrawSession = {
  user: KindrawUser;
};

export type KindrawShareRole = "viewer" | "editor";

// Metadados anexados a uma pasta do tree quando ela foi COMPARTILHADA com o
// usuário atual (i.e. não é dele). Pastas próprias nunca têm este campo.
export type KindrawFolderSharedMeta = {
  role: KindrawShareRole;
  ownerId: string;
  ownerLogin: string;
  ownerName: string;
};

// Uma pessoa (que não o dono) com acesso a uma pasta. Retornado por
// listFolderShares / grantFolderAccess.
export type KindrawFolderShare = {
  id: string;
  role: KindrawShareRole;
  user: KindrawUser;
  createdAt: string;
};

// Uma pessoa (que não o dono) com acesso a um híbrido. Mesmo shape do folder
// share — retornado por listHybridShares / grantHybridAccess.
export type KindrawHybridShare = KindrawFolderShare;

// Tipo de recurso de um convite por link. Unifica pasta e híbrido num só
// mecanismo de token.
export type KindrawShareInviteResourceType = "folder" | "hybrid";

// Um convite por link AINDA pendente (não aceito, não expirado), exibido na
// lista "Pessoas com acesso" com selo "Pendente". `link` é relativo
// (/invite/<token>) — o frontend monta a URL absoluta.
export type KindrawPendingInvite = {
  id: string;
  email: string | null;
  role: KindrawShareRole;
  createdAt: string;
  expiresAt: string;
  link: string;
  status: "pending";
};

// Metadados de um convite resolvido por token (página /invite/<token>). NÃO
// vaza conteúdo — só o suficiente para mostrar "Fulano convidou você para X".
export type KindrawInviteMetadata = {
  resourceType: KindrawShareInviteResourceType;
  resourceId: string;
  resourceName: string;
  role: KindrawShareRole;
  expiresAt: string;
  invitedByName: string;
  // Já foi aceito por alguém? (uso único). Continua resolvível para a UI poder
  // mostrar "convite já utilizado".
  accepted: boolean;
};

// Resultado do aceite de um convite — informa onde redirecionar o usuário.
export type KindrawAcceptInviteResult = {
  resourceType: KindrawShareInviteResourceType;
  resourceId: string;
};

export type KindrawFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  // Presente apenas quando a pasta foi compartilhada com o usuário atual.
  shared?: KindrawFolderSharedMeta;
};

// Modo de acesso de um link público: leitura, ou edição-ao-vivo (colaboração).
export type KindrawShareLinkAccess = "read" | "live-edit";

export type KindrawShareLink = {
  id: string;
  token: string;
  createdAt: string;
  revokedAt: string | null;
  // Default "read" para links antigos (coluna com DEFAULT 'read').
  access?: KindrawShareLinkAccess;
};

export type KindrawCollaborationRoom = {
  roomId: string;
  roomKey: string;
  enabledAt: string;
};

export type KindrawHybridLink = {
  hybridId: string;
  docItemId: string;
  drawingItemId: string;
  role: KindrawItemKind;
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
  hybrid: KindrawHybridLink | null;
  // Presente apenas quando o item vive numa pasta compartilhada com o usuário
  // atual (não é dele). 'viewer' => read-only; 'editor' => pode editar.
  // Ausente => item próprio, acesso total.
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
  docItemId: string;
  drawingItemId: string;
  defaultView: KindrawHybridView;
  // Vide KindrawItem.sharedRole — mesma semântica para hybrids compartilhados.
  sharedRole?: KindrawShareRole;
};

export type KindrawTreeEntry = KindrawItem | KindrawHybridItem;

export type KindrawTreeResponse = {
  folders: KindrawFolder[];
  items: KindrawTreeEntry[];
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
  hybrid: null | {
    id: string;
    defaultView: KindrawHybridView;
    drawing: {
      item: Pick<KindrawItem, "id" | "kind" | "title" | "updatedAt">;
      content: string;
      // Presente só em link live-edit: chave do canal de canvas ao vivo.
      collaborationRoom?: KindrawCollaborationRoom | null;
    };
  };
  // Modo do link: "read" (leitura) ou "live-edit" (entra na colaboração ao vivo).
  access: KindrawShareLinkAccess;
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

export type HybridItemRecord = {
  id: string;
  ownerId: string;
  docItemId: string;
  drawingItemId: string;
  defaultView: KindrawHybridView;
  createdAt: string;
  updatedAt: string;
};

export type ShareLinkRecord = KindrawShareLink & {
  itemId: string;
  createdByUserId: string;
};

// Linha bruta da tabela share_invites (convite por link).
export type ShareInviteRecord = {
  id: string;
  token: string;
  resourceType: KindrawShareInviteResourceType;
  resourceId: string;
  email: string | null;
  role: KindrawShareRole;
  invitedByUserId: string;
  acceptedByUserId: string | null;
  acceptedAt: string | null;
  expiresAt: string;
  createdAt: string;
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

export type CreateHybridItemInput = {
  title: string;
  folderId?: string | null;
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

export type PatchHybridItemMetaInput = {
  title?: string;
  folderId?: string | null;
  defaultView?: KindrawHybridView;
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

export interface WorkerCache {
  match(request: Request | string): Promise<Response | undefined>;
  put(request: Request | string, response: Response): Promise<void>;
}

export interface WorkerCacheStorage {
  readonly default: WorkerCache;
}

export type Env = {
  KINDRAW_DB: D1Database;
  KINDRAW_BLOBS: R2Bucket;
  KINDRAW_COLLAB: DurableObjectNamespace;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  // Google OAuth (Web application credentials). Set via `wrangler secret put`,
  // mirroring the GitHub secrets. Optional so a deploy without Google
  // configured still type-checks and falls back to GitHub-only login.
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  KINDRAW_APP_ORIGIN?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_BASE_URL?: string;
  OPENROUTER_TEXT_MODEL?: string;
  OPENROUTER_VISION_MODEL?: string;
  OPENROUTER_HTTP_REFERER?: string;
  OPENROUTER_APP_TITLE?: string;
};

export type ApiTokenRecord = {
  id: string; // SHA-256(secret) hex — never the raw secret
  userId: string;
  name: string;
  prefix: string;
  scope: string;
  createdAt: string;
  expiresAt: string | null;
  lastSeenAt: string | null;
  revokedAt: string | null;
};

// Safe-to-return shape for listing tokens (no hash/secret).
export type ApiTokenPublic = {
  prefix: string;
  name: string;
  scope: string;
  createdAt: string;
  expiresAt: string | null;
  lastSeenAt: string | null;
};

// Returned exactly once, on creation.
export type ApiTokenSecret = {
  secret: string;
  token: ApiTokenPublic;
};

export type CreateApiTokenInput = {
  name: string;
  expiresInDays?: number | null;
};

// Auth carries either a browser session (cookie) or an API token (Bearer).
// `user` is always present so route handlers (which only read auth.user) work
// unchanged regardless of which credential was used.
export type AuthContext = {
  user: KindrawUser;
  session?: SessionRecord;
  apiToken?: ApiTokenRecord;
};
