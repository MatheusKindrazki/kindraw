import type {
  AuthContext,
  CreateFolderInput,
  CreateHybridItemInput,
  CreateItemInput,
  D1Database,
  FolderRecord,
  HybridItemRecord,
  KindrawCollaborationBootstrapResponse,
  KindrawCollaborationRoom,
  KindrawHybridItem,
  KindrawHybridItemResponse,
  KindrawHybridLink,
  KindrawHybridView,
  ItemRecord,
  KindrawItem,
  KindrawItemResponse,
  KindrawPublicItemResponse,
  KindrawSession,
  KindrawShareLink,
  KindrawTreeResponse,
  PatchFolderInput,
  PatchHybridItemMetaInput,
  PatchItemMetaInput,
  R2Bucket,
  ShareLinkRecord,
} from "./types";

type UserRow = {
  id: string;
  github_id: string;
  github_login: string;
  name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

type SessionRow = {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
  last_seen_at: string;
};

type FolderRow = {
  id: string;
  owner_id: string;
  parent_id: string | null;
  name: string;
  created_at: string;
  updated_at: string;
};

type ItemRow = {
  id: string;
  owner_id: string;
  folder_id: string | null;
  kind: KindrawItem["kind"];
  title: string;
  content_blob_key: string;
  archived_at: string | null;
  collaboration_room_key: string | null;
  collaboration_enabled_at: string | null;
  created_at: string;
  updated_at: string;
};

type ShareLinkRow = {
  id: string;
  item_id: string;
  token: string;
  created_by_user_id: string;
  created_at: string;
  revoked_at: string | null;
};

type HybridItemRow = {
  id: string;
  owner_id: string;
  doc_item_id: string;
  drawing_item_id: string;
  default_view: KindrawHybridView;
  created_at: string;
  updated_at: string;
};

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

const toFolder = (row: FolderRow): FolderRecord => ({
  id: row.id,
  ownerId: row.owner_id,
  parentId: row.parent_id,
  name: row.name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toShareLink = (row: ShareLinkRow): ShareLinkRecord => ({
  id: row.id,
  itemId: row.item_id,
  token: row.token,
  createdByUserId: row.created_by_user_id,
  createdAt: row.created_at,
  revokedAt: row.revoked_at,
});

const toKindrawShareLink = (row: ShareLinkRow): KindrawShareLink => ({
  id: row.id,
  token: row.token,
  createdAt: row.created_at,
  revokedAt: row.revoked_at,
});

const toHybridLink = (
  row: HybridItemRow,
  role: KindrawItem["kind"],
): KindrawHybridLink => ({
  hybridId: row.id,
  docItemId: row.doc_item_id,
  drawingItemId: row.drawing_item_id,
  role,
  defaultView: row.default_view,
});

const toItem = (
  row: ItemRow,
  shareLinks: KindrawShareLink[],
  hybrid: KindrawHybridLink | null = null,
): KindrawItem => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  folderId: row.folder_id,
  ownerId: row.owner_id,
  updatedAt: row.updated_at,
  createdAt: row.created_at,
  archivedAt: row.archived_at,
  shareLinks,
  collaborationRoomId: row.collaboration_enabled_at ? row.id : null,
  collaborationEnabledAt: row.collaboration_enabled_at,
  hybrid,
});

const toItemRecord = (
  row: ItemRow,
  hybrid: KindrawHybridLink | null = null,
): ItemRecord => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  folderId: row.folder_id,
  ownerId: row.owner_id,
  updatedAt: row.updated_at,
  createdAt: row.created_at,
  archivedAt: row.archived_at,
  collaborationRoomId: row.collaboration_enabled_at ? row.id : null,
  collaborationEnabledAt: row.collaboration_enabled_at,
  hybrid,
  contentBlobKey: row.content_blob_key,
  collaborationRoomKey: row.collaboration_room_key,
});

const toHybridItemRecord = (row: HybridItemRow): HybridItemRecord => ({
  id: row.id,
  ownerId: row.owner_id,
  docItemId: row.doc_item_id,
  drawingItemId: row.drawing_item_id,
  defaultView: row.default_view,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toHybridItem = (
  row: HybridItemRow,
  docRow: ItemRow,
  shareLinks: KindrawShareLink[],
): KindrawHybridItem => ({
  id: row.id,
  kind: "hybrid",
  title: docRow.title,
  folderId: docRow.folder_id,
  ownerId: row.owner_id,
  updatedAt: row.updated_at,
  createdAt: row.created_at,
  archivedAt: null,
  shareLinks,
  docItemId: row.doc_item_id,
  drawingItemId: row.drawing_item_id,
  defaultView: row.default_view,
});

const isoNow = () => new Date().toISOString();

const createCollaborationRoomKey = async () => {
  const key = await crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 128,
    },
    true,
    ["encrypt", "decrypt"],
  );
  const exported = (await crypto.subtle.exportKey("jwk", key)) as {
    k?: string;
  };
  if (!exported.k) {
    throw new HttpError(500, "Failed to generate collaboration room key.");
  }
  return exported.k;
};

const blobContentType = (kind: KindrawItem["kind"]) =>
  kind === "drawing"
    ? "application/vnd.excalidraw+json"
    : "text/markdown; charset=utf-8";

const createBlobKey = (
  ownerId: string,
  itemId: string,
  kind: KindrawItem["kind"],
) =>
  `users/${ownerId}/items/${itemId}/current.${
    kind === "drawing" ? "excalidraw" : "md"
  }`;

const createInitialItemContent = (kind: KindrawItem["kind"], title: string) =>
  kind === "drawing"
    ? JSON.stringify({
        type: "excalidraw",
        version: 2,
        source: "kindraw",
        elements: [],
        appState: {},
        files: {},
      })
    : `# ${title}\n\n`;

const groupShareLinks = (shareLinks: ShareLinkRecord[]) => {
  const map = new Map<string, KindrawShareLink[]>();
  for (const shareLink of shareLinks) {
    if (map.has(shareLink.itemId)) {
      continue;
    }

    map.set(shareLink.itemId, [
      {
        id: shareLink.id,
        token: shareLink.token,
        createdAt: shareLink.createdAt,
        revokedAt: shareLink.revokedAt,
      },
    ]);
  }
  return map;
};

export class KindrawStore {
  constructor(
    private readonly db: D1Database,
    private readonly blobs: R2Bucket,
  ) {}

  async upsertGithubUser(input: {
    githubId: string;
    githubLogin: string;
    name: string;
    avatarUrl: string | null;
  }) {
    const now = isoNow();
    const existing = await this.db
      .prepare("SELECT * FROM users WHERE github_id = ?")
      .bind(input.githubId)
      .first<UserRow>();

    if (existing) {
      await this.db
        .prepare(
          `UPDATE users
           SET github_login = ?, name = ?, avatar_url = ?, updated_at = ?
           WHERE github_id = ?`,
        )
        .bind(
          input.githubLogin,
          input.name,
          input.avatarUrl,
          now,
          input.githubId,
        )
        .run();

      return {
        ...existing,
        github_login: input.githubLogin,
        name: input.name,
        avatar_url: input.avatarUrl,
        updated_at: now,
      };
    }

    const id = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO users (id, github_id, github_login, name, avatar_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.githubId,
        input.githubLogin,
        input.name,
        input.avatarUrl,
        now,
        now,
      )
      .run();

    return {
      id,
      github_id: input.githubId,
      github_login: input.githubLogin,
      name: input.name,
      avatar_url: input.avatarUrl,
      created_at: now,
      updated_at: now,
    };
  }

  async createSession(userId: string) {
    const now = isoNow();
    const expiresAt = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 30,
    ).toISOString();
    const sessionId = crypto.randomUUID();

    await this.db
      .prepare(
        `INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(sessionId, userId, expiresAt, now, now)
      .run();

    return {
      id: sessionId,
      userId,
      expiresAt,
      createdAt: now,
      lastSeenAt: now,
    };
  }

  async deleteSession(sessionId: string) {
    await this.db
      .prepare("DELETE FROM sessions WHERE id = ?")
      .bind(sessionId)
      .run();
  }

  async resolveSession(sessionId: string): Promise<AuthContext | null> {
    if (!sessionId) {
      return null;
    }

    const row = await this.db
      .prepare(
        `SELECT
           sessions.id,
           sessions.user_id,
           sessions.expires_at,
           sessions.created_at,
           sessions.last_seen_at,
           users.github_login,
           users.name,
           users.avatar_url
         FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.id = ?`,
      )
      .bind(sessionId)
      .first<
        SessionRow & {
          github_login: string;
          name: string;
          avatar_url: string | null;
        }
      >();

    if (!row) {
      return null;
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await this.deleteSession(row.id);
      return null;
    }

    const now = isoNow();
    await this.db
      .prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?")
      .bind(now, row.id)
      .run();

    return {
      session: {
        id: row.id,
        userId: row.user_id,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        lastSeenAt: now,
      },
      user: {
        id: row.user_id,
        githubLogin: row.github_login,
        name: row.name,
        avatarUrl: row.avatar_url,
      },
    };
  }

  async getSessionPayload(sessionId: string): Promise<KindrawSession | null> {
    const auth = await this.resolveSession(sessionId);
    if (!auth) {
      return null;
    }
    return { user: auth.user };
  }

  async getTree(ownerId: string): Promise<KindrawTreeResponse> {
    const [
      { results: folderRows },
      { results: itemRows },
      { results: shareRows },
      { results: hybridRows },
    ] = await Promise.all([
      this.db
        .prepare(
          `SELECT * FROM folders
             WHERE owner_id = ?
             ORDER BY name COLLATE NOCASE ASC, created_at ASC`,
        )
        .bind(ownerId)
        .all<FolderRow>(),
      this.db
        .prepare(
          `SELECT * FROM items
             WHERE owner_id = ?
             ORDER BY title COLLATE NOCASE ASC, created_at ASC`,
        )
        .bind(ownerId)
        .all<ItemRow>(),
      this.db
        .prepare(
          `SELECT share_links.*
             FROM share_links
             JOIN items ON items.id = share_links.item_id
             WHERE items.owner_id = ? AND share_links.revoked_at IS NULL
             ORDER BY share_links.created_at DESC`,
        )
        .bind(ownerId)
        .all<ShareLinkRow>(),
      this.db
        .prepare(
          `SELECT * FROM hybrid_items
             WHERE owner_id = ?
             ORDER BY updated_at DESC, created_at DESC`,
        )
        .bind(ownerId)
        .all<HybridItemRow>(),
    ]);

    const shareMap = groupShareLinks(shareRows.map(toShareLink));
    const hybridByDocId = new Map(
      hybridRows.map((row) => [row.doc_item_id, row] as const),
    );
    const hybridByDrawingId = new Map(
      hybridRows.map((row) => [row.drawing_item_id, row] as const),
    );
    const itemById = new Map(itemRows.map((row) => [row.id, row] as const));
    const collapsedItemIds = new Set<string>();
    const treeItems: KindrawTreeResponse["items"] = [];

    for (const row of itemRows) {
      if (collapsedItemIds.has(row.id)) {
        continue;
      }

      const hybridRow =
        row.kind === "doc"
          ? hybridByDocId.get(row.id)
          : hybridByDrawingId.get(row.id) || null;

      if (hybridRow) {
        const docRow = itemById.get(hybridRow.doc_item_id);
        const drawingRow = itemById.get(hybridRow.drawing_item_id);

        if (docRow && drawingRow) {
          treeItems.push(
            toHybridItem(
              hybridRow,
              docRow,
              shareMap.get(hybridRow.doc_item_id) || [],
            ),
          );
          collapsedItemIds.add(docRow.id);
          collapsedItemIds.add(drawingRow.id);
          continue;
        }
      }

      treeItems.push(toItem(row, shareMap.get(row.id) || []));
    }

    return {
      folders: folderRows.map((row) => {
        const folder = toFolder(row);
        return {
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId,
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
        };
      }),
      items: treeItems,
    };
  }

  async createFolder(ownerId: string, input: CreateFolderInput) {
    const name = input.name.trim();
    if (!name) {
      throw new HttpError(400, "Folder name is required.");
    }

    if (input.parentId) {
      await this.requireFolder(ownerId, input.parentId);
    }

    const now = isoNow();
    const folderId = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO folders (id, owner_id, parent_id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(folderId, ownerId, input.parentId ?? null, name, now, now)
      .run();

    return folderId;
  }

  async patchFolder(
    ownerId: string,
    folderId: string,
    input: PatchFolderInput,
  ) {
    const folder = await this.requireFolder(ownerId, folderId);

    const nextName =
      typeof input.name === "string" ? input.name.trim() : folder.name;
    if (!nextName) {
      throw new HttpError(400, "Folder name is required.");
    }

    const nextParentId =
      "parentId" in input ? input.parentId ?? null : folder.parentId;

    if (nextParentId === folderId) {
      throw new HttpError(400, "A folder cannot be parent of itself.");
    }

    if (nextParentId) {
      await this.requireFolder(ownerId, nextParentId);
      await this.ensureFolderNotMovedIntoDescendant(
        ownerId,
        folderId,
        nextParentId,
      );
    }

    await this.db
      .prepare(
        `UPDATE folders
         SET name = ?, parent_id = ?, updated_at = ?
         WHERE id = ? AND owner_id = ?`,
      )
      .bind(nextName, nextParentId, isoNow(), folderId, ownerId)
      .run();
  }

  async deleteFolder(ownerId: string, folderId: string) {
    await this.requireFolder(ownerId, folderId);

    const childFolder = await this.db
      .prepare(
        "SELECT id FROM folders WHERE owner_id = ? AND parent_id = ? LIMIT 1",
      )
      .bind(ownerId, folderId)
      .first<{ id: string }>();

    if (childFolder) {
      throw new HttpError(409, "Folder must be empty before deletion.");
    }

    const childItem = await this.db
      .prepare(
        "SELECT id FROM items WHERE owner_id = ? AND folder_id = ? LIMIT 1",
      )
      .bind(ownerId, folderId)
      .first<{ id: string }>();

    if (childItem) {
      throw new HttpError(409, "Folder must be empty before deletion.");
    }

    await this.db
      .prepare("DELETE FROM folders WHERE id = ? AND owner_id = ?")
      .bind(folderId, ownerId)
      .run();
  }

  async createItem(ownerId: string, input: CreateItemInput) {
    const title = input.title.trim();
    if (!title) {
      throw new HttpError(400, "Item title is required.");
    }

    if (input.folderId) {
      await this.requireFolder(ownerId, input.folderId);
    }

    const itemId = crypto.randomUUID();
    const now = isoNow();
    const blobKey = createBlobKey(ownerId, itemId, input.kind);

    await this.blobs.put(blobKey, input.content, {
      httpMetadata: {
        contentType: blobContentType(input.kind),
      },
    });

    await this.db
      .prepare(
        `INSERT INTO items (
           id,
           owner_id,
           folder_id,
           kind,
           title,
           content_blob_key,
           archived_at,
           collaboration_room_key,
           collaboration_enabled_at,
           created_at,
           updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
      )
      .bind(
        itemId,
        ownerId,
        input.folderId ?? null,
        input.kind,
        title,
        blobKey,
        now,
        now,
      )
      .run();

    return itemId;
  }

  async createHybridItem(ownerId: string, input: CreateHybridItemInput) {
    const title = input.title.trim();
    if (!title) {
      throw new HttpError(400, "Hybrid item title is required.");
    }

    if (input.folderId) {
      await this.requireFolder(ownerId, input.folderId);
    }

    const docItemId = await this.createItem(ownerId, {
      kind: "doc",
      title,
      folderId: input.folderId ?? null,
      content: createInitialItemContent("doc", title),
    });
    const drawingItemId = await this.createItem(ownerId, {
      kind: "drawing",
      title,
      folderId: input.folderId ?? null,
      content: createInitialItemContent("drawing", title),
    });

    const hybridId = crypto.randomUUID();
    const now = isoNow();

    await this.db
      .prepare(
        `INSERT INTO hybrid_items (
           id,
           owner_id,
           doc_item_id,
           drawing_item_id,
           default_view,
           created_at,
           updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(hybridId, ownerId, docItemId, drawingItemId, "both", now, now)
      .run();

    return {
      hybridId,
      docItemId,
      drawingItemId,
    };
  }

  async getItem(ownerId: string, itemId: string): Promise<KindrawItemResponse> {
    const item = await this.requireItem(ownerId, itemId);
    const content = await this.getContent(item.contentBlobKey);
    const shareLinks = await this.listShareLinksForItem(itemId);
    const hybridRow = await this.findHybridRowByItemId(ownerId, itemId);
    const hybrid = hybridRow ? toHybridLink(hybridRow, item.kind) : null;

    return {
      item: toItem(
        {
          id: item.id,
          owner_id: item.ownerId,
          folder_id: item.folderId,
          kind: item.kind,
          title: item.title,
          content_blob_key: item.contentBlobKey,
          archived_at: item.archivedAt,
          collaboration_room_key: item.collaborationRoomKey,
          collaboration_enabled_at: item.collaborationEnabledAt,
          created_at: item.createdAt,
          updated_at: item.updatedAt,
        },
        shareLinks,
        hybrid,
      ),
      content,
      collaborationRoom:
        item.collaborationEnabledAt && item.collaborationRoomKey
          ? {
              roomId: item.id,
              roomKey: item.collaborationRoomKey,
              enabledAt: item.collaborationEnabledAt,
            }
          : null,
    };
  }

  async getCollaborationRoomBootstrap(
    roomId: string,
    roomKey: string,
  ): Promise<KindrawCollaborationBootstrapResponse> {
    if (!roomKey.trim()) {
      throw new HttpError(400, "Collaboration room key is required.");
    }

    const item = await this.db
      .prepare(
        `SELECT * FROM items
         WHERE id = ? AND collaboration_enabled_at IS NOT NULL AND collaboration_room_key = ?`,
      )
      .bind(roomId, roomKey)
      .first<ItemRow>();

    if (!item || item.kind !== "drawing") {
      throw new HttpError(404, "Collaboration room not found.");
    }

    const content = await this.getContent(item.content_blob_key);

    return {
      item: {
        id: item.id,
        kind: item.kind,
        title: item.title,
        updatedAt: item.updated_at,
        createdAt: item.created_at,
      },
      content,
      collaborationRoom: {
        roomId: item.id,
        roomKey,
        enabledAt: item.collaboration_enabled_at!,
      },
    };
  }

  async getHybridItem(
    ownerId: string,
    hybridId: string,
  ): Promise<KindrawHybridItemResponse> {
    const hybrid = await this.requireHybridItem(ownerId, hybridId);
    const [document, drawing] = await Promise.all([
      this.getItem(ownerId, hybrid.docItemId),
      this.getItem(ownerId, hybrid.drawingItemId),
    ]);
    const docRow = await this.db
      .prepare("SELECT * FROM items WHERE id = ? AND owner_id = ?")
      .bind(hybrid.docItemId, ownerId)
      .first<ItemRow>();

    if (!docRow) {
      throw new HttpError(404, "Hybrid document root not found.");
    }

    return {
      hybrid: toHybridItem(
        {
          id: hybrid.id,
          owner_id: hybrid.ownerId,
          doc_item_id: hybrid.docItemId,
          drawing_item_id: hybrid.drawingItemId,
          default_view: hybrid.defaultView,
          created_at: hybrid.createdAt,
          updated_at: hybrid.updatedAt,
        },
        docRow,
        document.item.shareLinks,
      ),
      document,
      drawing,
    };
  }

  async patchItemMeta(
    ownerId: string,
    itemId: string,
    input: PatchItemMetaInput,
  ) {
    const item = await this.requireItem(ownerId, itemId);
    const title =
      typeof input.title === "string" ? input.title.trim() : item.title;
    if (!title) {
      throw new HttpError(400, "Item title is required.");
    }

    const folderId =
      "folderId" in input ? input.folderId ?? null : item.folderId;
    if (folderId) {
      await this.requireFolder(ownerId, folderId);
    }

    const archivedAt =
      "archived" in input
        ? input.archived
          ? item.archivedAt || isoNow()
          : null
        : item.archivedAt;

    const hybridRow = await this.findHybridRowByItemId(ownerId, itemId);
    const now = isoNow();

    await this.db
      .prepare(
        `UPDATE items
         SET title = ?, folder_id = ?, archived_at = ?, updated_at = ?
         WHERE id = ? AND owner_id = ?`,
      )
      .bind(title, folderId, archivedAt, now, itemId, ownerId)
      .run();

    if (!hybridRow) {
      return;
    }

    const companionItemId =
      hybridRow.doc_item_id === itemId
        ? hybridRow.drawing_item_id
        : hybridRow.doc_item_id;

    await Promise.all([
      this.db
        .prepare(
          `UPDATE items
           SET title = ?, folder_id = ?, updated_at = ?
           WHERE id = ? AND owner_id = ?`,
        )
        .bind(title, folderId, now, companionItemId, ownerId)
        .run(),
      this.db
        .prepare(
          `UPDATE hybrid_items
           SET updated_at = ?
           WHERE id = ? AND owner_id = ?`,
        )
        .bind(now, hybridRow.id, ownerId)
        .run(),
    ]);
  }

  async patchHybridItemMeta(
    ownerId: string,
    hybridId: string,
    input: PatchHybridItemMetaInput,
  ) {
    const hybrid = await this.requireHybridItem(ownerId, hybridId);
    const doc = await this.requireItem(ownerId, hybrid.docItemId);

    const title =
      typeof input.title === "string" ? input.title.trim() : doc.title;
    if (!title) {
      throw new HttpError(400, "Hybrid item title is required.");
    }

    const folderId =
      "folderId" in input ? input.folderId ?? null : doc.folderId;
    if (folderId) {
      await this.requireFolder(ownerId, folderId);
    }

    const defaultView = input.defaultView ?? hybrid.defaultView;
    const now = isoNow();

    await Promise.all([
      this.db
        .prepare(
          `UPDATE items
           SET title = ?, folder_id = ?, updated_at = ?
           WHERE id = ? AND owner_id = ?`,
        )
        .bind(title, folderId, now, hybrid.docItemId, ownerId)
        .run(),
      this.db
        .prepare(
          `UPDATE items
           SET title = ?, folder_id = ?, updated_at = ?
           WHERE id = ? AND owner_id = ?`,
        )
        .bind(title, folderId, now, hybrid.drawingItemId, ownerId)
        .run(),
      this.db
        .prepare(
          `UPDATE hybrid_items
           SET default_view = ?, updated_at = ?
           WHERE id = ? AND owner_id = ?`,
        )
        .bind(defaultView, now, hybrid.id, ownerId)
        .run(),
    ]);
  }

  async putItemContent(ownerId: string, itemId: string, content: string) {
    const item = await this.requireItem(ownerId, itemId);
    await this.blobs.put(item.contentBlobKey, content, {
      httpMetadata: {
        contentType: blobContentType(item.kind),
      },
    });

    await this.db
      .prepare("UPDATE items SET updated_at = ? WHERE id = ? AND owner_id = ?")
      .bind(isoNow(), itemId, ownerId)
      .run();
  }

  async deleteItem(ownerId: string, itemId: string) {
    const item = await this.requireItem(ownerId, itemId);
    const hybridRow = await this.findHybridRowByItemId(ownerId, itemId);
    await Promise.all([
      this.blobs.delete(item.contentBlobKey),
      hybridRow
        ? this.db
            .prepare("DELETE FROM hybrid_items WHERE id = ? AND owner_id = ?")
            .bind(hybridRow.id, ownerId)
            .run()
        : Promise.resolve(),
      this.db
        .prepare("DELETE FROM share_links WHERE item_id = ?")
        .bind(itemId)
        .run(),
      this.db
        .prepare("DELETE FROM items WHERE id = ? AND owner_id = ?")
        .bind(itemId, ownerId)
        .run(),
    ]);
  }

  async deleteHybridItem(ownerId: string, hybridId: string) {
    await this.requireHybridItem(ownerId, hybridId);
    await this.db
      .prepare("DELETE FROM hybrid_items WHERE id = ? AND owner_id = ?")
      .bind(hybridId, ownerId)
      .run();
  }

  async createHybridShareLink(ownerId: string, hybridId: string) {
    const hybrid = await this.requireHybridItem(ownerId, hybridId);
    return this.createShareLink(ownerId, hybrid.docItemId);
  }

  async enableItemCollaboration(
    ownerId: string,
    itemId: string,
  ): Promise<KindrawCollaborationRoom> {
    const item = await this.requireItem(ownerId, itemId);
    if (item.kind !== "drawing") {
      throw new HttpError(
        400,
        "Realtime collaboration is only available for drawings.",
      );
    }

    const roomKey =
      item.collaborationRoomKey || (await createCollaborationRoomKey());
    const enabledAt = item.collaborationEnabledAt || isoNow();

    await this.db
      .prepare(
        `UPDATE items
           SET collaboration_room_key = ?, collaboration_enabled_at = ?
         WHERE id = ? AND owner_id = ?`,
      )
      .bind(roomKey, enabledAt, itemId, ownerId)
      .run();

    return {
      roomId: item.id,
      roomKey,
      enabledAt,
    };
  }

  async disableItemCollaboration(ownerId: string, itemId: string) {
    const item = await this.requireItem(ownerId, itemId);
    if (item.kind !== "drawing") {
      throw new HttpError(
        400,
        "Realtime collaboration is only available for drawings.",
      );
    }

    await this.db
      .prepare(
        `UPDATE items
           SET collaboration_enabled_at = NULL
         WHERE id = ? AND owner_id = ?`,
      )
      .bind(itemId, ownerId)
      .run();
  }

  async createShareLink(ownerId: string, itemId: string) {
    await this.requireItem(ownerId, itemId);
    const activeLinks = await this.listActiveShareLinksForItem(itemId);

    if (activeLinks.length) {
      const [currentLink] = activeLinks;

      await this.db
        .prepare(
          `UPDATE share_links
             SET revoked_at = ?
           WHERE item_id = ? AND id != ? AND revoked_at IS NULL`,
        )
        .bind(isoNow(), itemId, currentLink.id)
        .run();

      return toKindrawShareLink(currentLink);
    }

    const shareLinkId = crypto.randomUUID();
    const token = crypto.randomUUID().replace(/-/g, "");
    const createdAt = isoNow();

    await this.db
      .prepare(
        `INSERT INTO share_links (id, item_id, token, created_by_user_id, created_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      )
      .bind(shareLinkId, itemId, token, ownerId, createdAt)
      .run();

    return {
      id: shareLinkId,
      token,
      createdAt,
      revokedAt: null,
    };
  }

  async revokeShareLink(ownerId: string, shareLinkId: string) {
    const link = await this.db
      .prepare(
        `SELECT share_links.item_id
         FROM share_links
         JOIN items ON items.id = share_links.item_id
         WHERE share_links.id = ? AND items.owner_id = ? AND share_links.revoked_at IS NULL`,
      )
      .bind(shareLinkId, ownerId)
      .first<{ item_id: string }>();

    if (!link) {
      throw new HttpError(404, "Share link not found.");
    }

    await this.db
      .prepare(
        `UPDATE share_links
           SET revoked_at = ?
         WHERE item_id = ? AND revoked_at IS NULL`,
      )
      .bind(isoNow(), link.item_id)
      .run();
  }

  async getPublicItem(token: string): Promise<KindrawPublicItemResponse> {
    const row = await this.db
      .prepare(
        `SELECT items.id, items.kind, items.title, items.updated_at, items.content_blob_key
         FROM share_links
         JOIN items ON items.id = share_links.item_id
         WHERE share_links.token = ? AND share_links.revoked_at IS NULL`,
      )
      .bind(token)
      .first<{
        id: string;
        kind: KindrawItem["kind"];
        title: string;
        updated_at: string;
        content_blob_key: string;
      }>();

    if (!row) {
      throw new HttpError(404, "Public item not found.");
    }

    const content = await this.getContent(row.content_blob_key);
    const hybridRow =
      row.kind === "doc"
        ? await this.findHybridRowByItemId(undefined, row.id)
        : null;

    let hybrid: KindrawPublicItemResponse["hybrid"] = null;

    if (hybridRow) {
      const drawing = await this.db
        .prepare(
          `SELECT id, kind, title, updated_at, content_blob_key
           FROM items
           WHERE id = ?`,
        )
        .bind(hybridRow.drawing_item_id)
        .first<{
          id: string;
          kind: KindrawItem["kind"];
          title: string;
          updated_at: string;
          content_blob_key: string;
        }>();

      if (drawing) {
        hybrid = {
          id: hybridRow.id,
          defaultView: hybridRow.default_view,
          drawing: {
            item: {
              id: drawing.id,
              kind: drawing.kind,
              title: drawing.title,
              updatedAt: drawing.updated_at,
            },
            content: await this.getContent(drawing.content_blob_key),
          },
        };
      }
    }

    return {
      item: {
        id: row.id,
        kind: row.kind,
        title: row.title,
        updatedAt: row.updated_at,
      },
      content,
      hybrid,
    };
  }

  private async listActiveShareLinksForItem(itemId: string) {
    const { results } = await this.db
      .prepare(
        `SELECT *
         FROM share_links
         WHERE item_id = ? AND revoked_at IS NULL
         ORDER BY created_at DESC`,
      )
      .bind(itemId)
      .all<ShareLinkRow>();

    return results;
  }

  private async listShareLinksForItem(itemId: string) {
    const results = await this.listActiveShareLinksForItem(itemId);

    return results.slice(0, 1).map((row) => toKindrawShareLink(row));
  }

  private async getContent(blobKey: string) {
    const object = await this.blobs.get(blobKey);
    if (!object) {
      throw new HttpError(404, "Stored item content not found.");
    }
    return object.text();
  }

  private async requireFolder(ownerId: string, folderId: string) {
    const row = await this.db
      .prepare("SELECT * FROM folders WHERE id = ? AND owner_id = ?")
      .bind(folderId, ownerId)
      .first<FolderRow>();

    if (!row) {
      throw new HttpError(404, "Folder not found.");
    }

    return toFolder(row);
  }

  private async requireItem(ownerId: string, itemId: string) {
    const row = await this.db
      .prepare("SELECT * FROM items WHERE id = ? AND owner_id = ?")
      .bind(itemId, ownerId)
      .first<ItemRow>();

    if (!row) {
      throw new HttpError(404, "Item not found.");
    }

    const hybridRow = await this.findHybridRowByItemId(ownerId, itemId);
    const hybrid =
      hybridRow && hybridRow.doc_item_id === itemId
        ? toHybridLink(hybridRow, "doc")
        : hybridRow
        ? toHybridLink(hybridRow, "drawing")
        : null;

    return toItemRecord(row, hybrid);
  }

  private async requireHybridItem(ownerId: string, hybridId: string) {
    const row = await this.db
      .prepare("SELECT * FROM hybrid_items WHERE id = ? AND owner_id = ?")
      .bind(hybridId, ownerId)
      .first<HybridItemRow>();

    if (!row) {
      throw new HttpError(404, "Hybrid item not found.");
    }

    return toHybridItemRecord(row);
  }

  private async findHybridRowByItemId(
    ownerId: string | undefined,
    itemId: string,
  ) {
    const baseQuery =
      "SELECT * FROM hybrid_items WHERE (doc_item_id = ? OR drawing_item_id = ?)";

    if (!ownerId) {
      return this.db
        .prepare(`${baseQuery} LIMIT 1`)
        .bind(itemId, itemId)
        .first<HybridItemRow>();
    }

    return this.db
      .prepare(`${baseQuery} AND owner_id = ? LIMIT 1`)
      .bind(itemId, itemId, ownerId)
      .first<HybridItemRow>();
  }

  private async ensureFolderNotMovedIntoDescendant(
    ownerId: string,
    folderId: string,
    targetParentId: string,
  ) {
    const { results } = await this.db
      .prepare("SELECT id, parent_id FROM folders WHERE owner_id = ?")
      .bind(ownerId)
      .all<Pick<FolderRow, "id" | "parent_id">>();

    const byId = new Map(
      results.map((row) => [row.id, row.parent_id ?? null] as const),
    );

    let currentId: string | null = targetParentId;
    while (currentId) {
      if (currentId === folderId) {
        throw new HttpError(
          400,
          "A folder cannot be moved into one of its descendants.",
        );
      }
      currentId = byId.get(currentId) ?? null;
    }
  }
}

export const createStore = (db: D1Database, blobs: R2Bucket) =>
  new KindrawStore(db, blobs);
