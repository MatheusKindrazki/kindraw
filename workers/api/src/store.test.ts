import { beforeEach, describe, expect, it, vi } from "vitest";

import { KindrawStore } from "./store";

import type { HttpError } from "./store";

import type {
  D1Database,
  D1PreparedStatement,
  R2Bucket,
  R2ObjectBody,
  R2PutOptions,
} from "./types";

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
  kind: "drawing" | "doc";
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

type FakeState = {
  folders: FolderRow[];
  items: ItemRow[];
  shareLinks: ShareLinkRow[];
};

const normalizeQuery = (query: string) => query.replace(/\s+/g, " ").trim();

class FakeStatement implements D1PreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly query: string,
    private readonly state: FakeState,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T = Record<string, unknown>>() {
    const query = normalizeQuery(this.query);

    if (query === "SELECT * FROM folders WHERE id = ? AND owner_id = ?") {
      const [folderId, ownerId] = this.values as [string, string];
      return (this.state.folders.find(
        (folder) => folder.id === folderId && folder.owner_id === ownerId,
      ) || null) as T | null;
    }

    if (
      query ===
      "SELECT id FROM folders WHERE owner_id = ? AND parent_id = ? LIMIT 1"
    ) {
      const [ownerId, parentId] = this.values as [string, string];
      const folder = this.state.folders.find(
        (entry) => entry.owner_id === ownerId && entry.parent_id === parentId,
      );
      return (folder ? { id: folder.id } : null) as T | null;
    }

    if (
      query ===
      "SELECT id FROM items WHERE owner_id = ? AND folder_id = ? LIMIT 1"
    ) {
      const [ownerId, folderId] = this.values as [string, string];
      const item = this.state.items.find(
        (entry) => entry.owner_id === ownerId && entry.folder_id === folderId,
      );
      return (item ? { id: item.id } : null) as T | null;
    }

    if (query === "SELECT * FROM items WHERE id = ? AND owner_id = ?") {
      const [itemId, ownerId] = this.values as [string, string];
      return (this.state.items.find(
        (item) => item.id === itemId && item.owner_id === ownerId,
      ) || null) as T | null;
    }

    if (
      query ===
      "SELECT * FROM items WHERE id = ? AND collaboration_enabled_at IS NOT NULL AND collaboration_room_key = ?"
    ) {
      const [itemId, roomKey] = this.values as [string, string];
      return (this.state.items.find(
        (item) =>
          item.id === itemId &&
          item.collaboration_enabled_at !== null &&
          item.collaboration_room_key === roomKey,
      ) || null) as T | null;
    }

    if (
      query ===
      "SELECT share_links.id FROM share_links JOIN items ON items.id = share_links.item_id WHERE share_links.id = ? AND items.owner_id = ? AND share_links.revoked_at IS NULL"
    ) {
      const [shareLinkId, ownerId] = this.values as [string, string];
      const shareLink = this.state.shareLinks.find((entry) => {
        const item = this.state.items.find(
          (candidate) => candidate.id === entry.item_id,
        );
        return (
          entry.id === shareLinkId &&
          entry.revoked_at === null &&
          item?.owner_id === ownerId
        );
      });
      return (shareLink ? { id: shareLink.id } : null) as T | null;
    }

    if (
      query ===
      "SELECT share_links.item_id FROM share_links JOIN items ON items.id = share_links.item_id WHERE share_links.id = ? AND items.owner_id = ? AND share_links.revoked_at IS NULL"
    ) {
      const [shareLinkId, ownerId] = this.values as [string, string];
      const shareLink = this.state.shareLinks.find((entry) => {
        const item = this.state.items.find(
          (candidate) => candidate.id === entry.item_id,
        );
        return (
          entry.id === shareLinkId &&
          entry.revoked_at === null &&
          item?.owner_id === ownerId
        );
      });
      return (shareLink ? { item_id: shareLink.item_id } : null) as T | null;
    }

    if (
      query ===
      "SELECT items.id, items.kind, items.title, items.updated_at, items.content_blob_key FROM share_links JOIN items ON items.id = share_links.item_id WHERE share_links.token = ? AND share_links.revoked_at IS NULL"
    ) {
      const [token] = this.values as [string];
      const shareLink = this.state.shareLinks.find(
        (entry) => entry.token === token && entry.revoked_at === null,
      );

      if (!shareLink) {
        return null;
      }

      const item = this.state.items.find(
        (entry) => entry.id === shareLink.item_id,
      );
      if (!item) {
        return null;
      }

      return {
        id: item.id,
        kind: item.kind,
        title: item.title,
        updated_at: item.updated_at,
        content_blob_key: item.content_blob_key,
      } as T;
    }

    throw new Error(`Unsupported first() query in test double: ${query}`);
  }

  async all<T = Record<string, unknown>>() {
    const query = normalizeQuery(this.query);

    if (
      query ===
      "SELECT * FROM share_links WHERE item_id = ? AND revoked_at IS NULL ORDER BY created_at DESC"
    ) {
      const [itemId] = this.values as [string];
      const results = this.state.shareLinks
        .filter(
          (entry) => entry.item_id === itemId && entry.revoked_at === null,
        )
        .sort((left, right) => right.created_at.localeCompare(left.created_at));
      return { results: results as T[] };
    }

    if (
      query ===
      "SELECT * FROM folders WHERE owner_id = ? ORDER BY name COLLATE NOCASE ASC, created_at ASC"
    ) {
      const [ownerId] = this.values as [string];
      const results = this.state.folders
        .filter((entry) => entry.owner_id === ownerId)
        .sort((left, right) => {
          const byName = left.name.localeCompare(right.name);
          return byName || left.created_at.localeCompare(right.created_at);
        });
      return { results: results as T[] };
    }

    if (
      query ===
      "SELECT * FROM items WHERE owner_id = ? ORDER BY title COLLATE NOCASE ASC, created_at ASC"
    ) {
      const [ownerId] = this.values as [string];
      const results = this.state.items
        .filter((entry) => entry.owner_id === ownerId)
        .sort((left, right) => {
          const byTitle = left.title.localeCompare(right.title);
          return byTitle || left.created_at.localeCompare(right.created_at);
        });
      return { results: results as T[] };
    }

    if (
      query ===
      "SELECT share_links.* FROM share_links JOIN items ON items.id = share_links.item_id WHERE items.owner_id = ? AND share_links.revoked_at IS NULL ORDER BY share_links.created_at DESC"
    ) {
      const [ownerId] = this.values as [string];
      const results = this.state.shareLinks
        .filter((entry) => {
          const item = this.state.items.find(
            (candidate) => candidate.id === entry.item_id,
          );
          return entry.revoked_at === null && item?.owner_id === ownerId;
        })
        .sort((left, right) => right.created_at.localeCompare(left.created_at));
      return { results: results as T[] };
    }

    if (query === "SELECT id, parent_id FROM folders WHERE owner_id = ?") {
      const [ownerId] = this.values as [string];
      const results = this.state.folders
        .filter((entry) => entry.owner_id === ownerId)
        .map((entry) => ({
          id: entry.id,
          parent_id: entry.parent_id,
        }));
      return { results: results as T[] };
    }

    throw new Error(`Unsupported all() query in test double: ${query}`);
  }

  async run() {
    const query = normalizeQuery(this.query);

    if (
      query ===
      "INSERT INTO folders (id, owner_id, parent_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ) {
      const [id, ownerId, parentId, name, createdAt, updatedAt] = this
        .values as [string, string, string | null, string, string, string];
      this.state.folders.push({
        id,
        owner_id: ownerId,
        parent_id: parentId,
        name,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return {};
    }

    if (
      query ===
      "UPDATE folders SET name = ?, parent_id = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
    ) {
      const [name, parentId, updatedAt, folderId, ownerId] = this.values as [
        string,
        string | null,
        string,
        string,
        string,
      ];
      const folder = this.state.folders.find(
        (entry) => entry.id === folderId && entry.owner_id === ownerId,
      );
      if (folder) {
        folder.name = name;
        folder.parent_id = parentId;
        folder.updated_at = updatedAt;
      }
      return {};
    }

    if (query === "DELETE FROM folders WHERE id = ? AND owner_id = ?") {
      const [folderId, ownerId] = this.values as [string, string];
      this.state.folders = this.state.folders.filter(
        (entry) => !(entry.id === folderId && entry.owner_id === ownerId),
      );
      return {};
    }

    if (
      query ===
      "INSERT INTO items ( id, owner_id, folder_id, kind, title, content_blob_key, archived_at, collaboration_room_key, collaboration_enabled_at, created_at, updated_at ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)"
    ) {
      const [
        id,
        ownerId,
        folderId,
        kind,
        title,
        blobKey,
        createdAt,
        updatedAt,
      ] = this.values as [
        string,
        string,
        string | null,
        "drawing" | "doc",
        string,
        string,
        string,
        string,
      ];
      this.state.items.push({
        id,
        owner_id: ownerId,
        folder_id: folderId,
        kind,
        title,
        content_blob_key: blobKey,
        archived_at: null,
        collaboration_room_key: null,
        collaboration_enabled_at: null,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return {};
    }

    if (
      query ===
      "UPDATE items SET title = ?, folder_id = ?, archived_at = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
    ) {
      const [title, folderId, archivedAt, updatedAt, itemId, ownerId] = this
        .values as [
        string,
        string | null,
        string | null,
        string,
        string,
        string,
      ];
      const item = this.state.items.find(
        (entry) => entry.id === itemId && entry.owner_id === ownerId,
      );
      if (item) {
        item.title = title;
        item.folder_id = folderId;
        item.archived_at = archivedAt;
        item.updated_at = updatedAt;
      }
      return {};
    }

    if (
      query === "UPDATE items SET updated_at = ? WHERE id = ? AND owner_id = ?"
    ) {
      const [updatedAt, itemId, ownerId] = this.values as [
        string,
        string,
        string,
      ];
      const item = this.state.items.find(
        (entry) => entry.id === itemId && entry.owner_id === ownerId,
      );
      if (item) {
        item.updated_at = updatedAt;
      }
      return {};
    }

    if (
      query ===
      "UPDATE items SET collaboration_room_key = ?, collaboration_enabled_at = ? WHERE id = ? AND owner_id = ?"
    ) {
      const [roomKey, enabledAt, itemId, ownerId] = this.values as [
        string,
        string,
        string,
        string,
      ];
      const item = this.state.items.find(
        (entry) => entry.id === itemId && entry.owner_id === ownerId,
      );
      if (item) {
        item.collaboration_room_key = roomKey;
        item.collaboration_enabled_at = enabledAt;
      }
      return {};
    }

    if (
      query ===
      "UPDATE items SET collaboration_enabled_at = NULL WHERE id = ? AND owner_id = ?"
    ) {
      const [itemId, ownerId] = this.values as [string, string];
      const item = this.state.items.find(
        (entry) => entry.id === itemId && entry.owner_id === ownerId,
      );
      if (item) {
        item.collaboration_enabled_at = null;
      }
      return {};
    }

    if (query === "DELETE FROM share_links WHERE item_id = ?") {
      const [itemId] = this.values as [string];
      this.state.shareLinks = this.state.shareLinks.filter(
        (entry) => entry.item_id !== itemId,
      );
      return {};
    }

    if (query === "DELETE FROM items WHERE id = ? AND owner_id = ?") {
      const [itemId, ownerId] = this.values as [string, string];
      this.state.items = this.state.items.filter(
        (entry) => !(entry.id === itemId && entry.owner_id === ownerId),
      );
      return {};
    }

    if (
      query ===
      "INSERT INTO share_links (id, item_id, token, created_by_user_id, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)"
    ) {
      const [id, itemId, token, userId, createdAt] = this.values as [
        string,
        string,
        string,
        string,
        string,
      ];
      this.state.shareLinks.push({
        id,
        item_id: itemId,
        token,
        created_by_user_id: userId,
        created_at: createdAt,
        revoked_at: null,
      });
      return {};
    }

    if (query === "UPDATE share_links SET revoked_at = ? WHERE id = ?") {
      const [revokedAt, shareLinkId] = this.values as [string, string];
      const shareLink = this.state.shareLinks.find(
        (entry) => entry.id === shareLinkId,
      );
      if (shareLink) {
        shareLink.revoked_at = revokedAt;
      }
      return {};
    }

    if (
      query ===
      "UPDATE share_links SET revoked_at = ? WHERE item_id = ? AND id != ? AND revoked_at IS NULL"
    ) {
      const [revokedAt, itemId, keepId] = this.values as [
        string,
        string,
        string,
      ];
      this.state.shareLinks = this.state.shareLinks.map((entry) =>
        entry.item_id === itemId &&
        entry.id !== keepId &&
        entry.revoked_at === null
          ? { ...entry, revoked_at: revokedAt }
          : entry,
      );
      return {};
    }

    if (
      query ===
      "UPDATE share_links SET revoked_at = ? WHERE item_id = ? AND revoked_at IS NULL"
    ) {
      const [revokedAt, itemId] = this.values as [string, string];
      this.state.shareLinks = this.state.shareLinks.map((entry) =>
        entry.item_id === itemId && entry.revoked_at === null
          ? { ...entry, revoked_at: revokedAt }
          : entry,
      );
      return {};
    }

    throw new Error(`Unsupported run() query in test double: ${query}`);
  }
}

class FakeD1Database implements D1Database {
  constructor(private readonly state: FakeState) {}

  prepare(query: string) {
    return new FakeStatement(query, this.state);
  }

  async batch() {
    return [];
  }
}

class FakeR2Object implements R2ObjectBody {
  constructor(private readonly value: string) {}

  async text() {
    return this.value;
  }
}

class FakeR2Bucket implements R2Bucket {
  readonly objects = new Map<string, string>();
  readonly metadata = new Map<string, R2PutOptions | undefined>();

  async get(key: string) {
    const value = this.objects.get(key);
    return value === undefined ? null : new FakeR2Object(value);
  }

  async put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView,
    options?: R2PutOptions,
  ) {
    const nextValue =
      typeof value === "string"
        ? value
        : new TextDecoder().decode(
            value instanceof ArrayBuffer ? new Uint8Array(value) : value,
          );
    this.objects.set(key, nextValue);
    this.metadata.set(key, options);
  }

  async delete(key: string) {
    this.objects.delete(key);
    this.metadata.delete(key);
  }
}

const createStore = (state?: Partial<FakeState>) => {
  const fakeState: FakeState = {
    folders: state?.folders ?? [],
    items: state?.items ?? [],
    shareLinks: state?.shareLinks ?? [],
  };
  const blobs = new FakeR2Bucket();
  return {
    state: fakeState,
    blobs,
    store: new KindrawStore(new FakeD1Database(fakeState), blobs),
  };
};

describe("KindrawStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-09T12:00:00.000Z"));
  });

  it("persiste item no R2 e retorna o conteudo no getItem", async () => {
    const uuidSpy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000001");
    const { store, blobs } = createStore();

    const itemId = await store.createItem("user-1", {
      kind: "drawing",
      title: "Board",
      folderId: null,
      content: '{"type":"excalidraw"}',
    });

    expect(itemId).toBe("00000000-0000-0000-0000-000000000001");
    expect(
      blobs.objects.get(
        "users/user-1/items/00000000-0000-0000-0000-000000000001/current.excalidraw",
      ),
    ).toBe('{"type":"excalidraw"}');

    const item = await store.getItem(
      "user-1",
      "00000000-0000-0000-0000-000000000001",
    );
    expect(item.content).toBe('{"type":"excalidraw"}');
    expect(item.item.kind).toBe("drawing");
    expect(item.item.title).toBe("Board");
    expect(item.item.shareLinks).toEqual([]);

    await expect(
      store.getItem("user-2", "00000000-0000-0000-0000-000000000001"),
    ).rejects.toMatchObject({
      status: 404,
    } as Partial<HttpError>);

    uuidSpy.mockRestore();
  });

  it("aceita criar item sem folderId e persiste NULL no D1", async () => {
    const uuidSpy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000010");
    const { store, state } = createStore();

    await store.createItem("user-1", {
      kind: "drawing",
      title: "Loose board",
      content: '{"type":"excalidraw"}',
    });

    expect(state.items[0]?.folder_id).toBeNull();

    uuidSpy.mockRestore();
  });

  it("aceita criar pasta sem parentId e persiste NULL no D1", async () => {
    const uuidSpy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000011");
    const { store, state } = createStore();

    await store.createFolder("user-1", {
      name: "Root tag",
    });

    expect(state.folders[0]?.parent_id).toBeNull();

    uuidSpy.mockRestore();
  });

  it("impede deletar pasta que ainda possui itens", async () => {
    const { store } = createStore({
      folders: [
        {
          id: "folder-1",
          owner_id: "user-1",
          parent_id: null,
          name: "Projects",
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
      items: [
        {
          id: "item-1",
          owner_id: "user-1",
          folder_id: "folder-1",
          kind: "doc",
          title: "Notes",
          content_blob_key: "users/user-1/items/item-1/current.md",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
    });

    await expect(
      store.deleteFolder("user-1", "folder-1"),
    ).rejects.toMatchObject({
      status: 409,
      message: "Folder must be empty before deletion.",
    } as Partial<HttpError>);
  });

  it("arquiva e restaura um canvas sem apagar o blob", async () => {
    const { store, state, blobs } = createStore({
      items: [
        {
          id: "item-1",
          owner_id: "user-1",
          folder_id: null,
          kind: "drawing",
          title: "Board",
          content_blob_key: "users/user-1/items/item-1/current.excalidraw",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
    });
    await blobs.put(
      "users/user-1/items/item-1/current.excalidraw",
      '{"type":"excalidraw"}',
    );

    await store.patchItemMeta("user-1", "item-1", {
      archived: true,
    });

    expect(state.items[0]?.archived_at).toBe("2026-03-09T12:00:00.000Z");
    expect(
      blobs.objects.get("users/user-1/items/item-1/current.excalidraw"),
    ).toBe('{"type":"excalidraw"}');

    const archivedItem = await store.getItem("user-1", "item-1");
    expect(archivedItem.item.archivedAt).toBe("2026-03-09T12:00:00.000Z");

    await store.patchItemMeta("user-1", "item-1", {
      archived: false,
    });

    expect(state.items[0]?.archived_at).toBeNull();
  });

  it("cria, revoga e invalida share-link publico", async () => {
    const uuidSpy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000101")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000202");
    const { store, blobs } = createStore({
      items: [
        {
          id: "item-1",
          owner_id: "user-1",
          folder_id: null,
          kind: "doc",
          title: "Spec",
          content_blob_key: "users/user-1/items/item-1/current.md",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
    });
    await blobs.put("users/user-1/items/item-1/current.md", "# Kindraw");

    const shareLink = await store.createShareLink("user-1", "item-1");
    expect(shareLink).toEqual({
      id: "00000000-0000-0000-0000-000000000101",
      token: "00000000000000000000000000000202",
      createdAt: "2026-03-09T12:00:00.000Z",
      revokedAt: null,
    });

    const publicItem = await store.getPublicItem(
      "00000000000000000000000000000202",
    );
    expect(publicItem).toEqual({
      item: {
        id: "item-1",
        kind: "doc",
        title: "Spec",
        updatedAt: "2026-03-09T10:00:00.000Z",
      },
      content: "# Kindraw",
    });

    await store.revokeShareLink(
      "user-1",
      "00000000-0000-0000-0000-000000000101",
    );

    await expect(
      store.getPublicItem("00000000000000000000000000000202"),
    ).rejects.toMatchObject({
      status: 404,
      message: "Public item not found.",
    } as Partial<HttpError>);

    uuidSpy.mockRestore();
  });

  it("ativa colaboracao realtime fixa no drawing e expoe a sala no getItem", async () => {
    const generateKeySpy = vi
      .spyOn(crypto.subtle, "generateKey")
      .mockResolvedValue({} as CryptoKey);
    const exportKeySpy = vi
      .spyOn(crypto.subtle, "exportKey")
      .mockResolvedValue({
        k: "abcdefghijklmnopqrstuv",
      } as JsonWebKey);
    const { store, state, blobs } = createStore({
      items: [
        {
          id: "item-1",
          owner_id: "user-1",
          folder_id: null,
          kind: "drawing",
          title: "Board",
          content_blob_key: "users/user-1/items/item-1/current.excalidraw",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
    });
    await blobs.put(
      "users/user-1/items/item-1/current.excalidraw",
      '{"type":"excalidraw"}',
    );

    const room = await store.enableItemCollaboration("user-1", "item-1");
    expect(room).toEqual({
      roomId: "item-1",
      roomKey: "abcdefghijklmnopqrstuv",
      enabledAt: "2026-03-09T12:00:00.000Z",
    });

    const item = await store.getItem("user-1", "item-1");
    expect(item.collaborationRoom).toEqual(room);
    expect(state.items[0]?.collaboration_enabled_at).toBe(
      "2026-03-09T12:00:00.000Z",
    );

    exportKeySpy.mockRestore();
    generateKeySpy.mockRestore();
  });

  it("expoe bootstrap publico do room com a cena do drawing", async () => {
    const { store, blobs } = createStore({
      items: [
        {
          id: "item-1",
          owner_id: "user-1",
          folder_id: null,
          kind: "drawing",
          title: "Board",
          content_blob_key: "users/user-1/items/item-1/current.excalidraw",
          archived_at: null,
          collaboration_room_key: "abcdefghijklmnopqrstuv",
          collaboration_enabled_at: "2026-03-09T12:00:00.000Z",
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
    });
    await blobs.put(
      "users/user-1/items/item-1/current.excalidraw",
      '{"elements":[{"id":"el-1"}]}',
    );

    const bootstrap = await store.getCollaborationRoomBootstrap(
      "item-1",
      "abcdefghijklmnopqrstuv",
    );

    expect(bootstrap).toEqual({
      item: {
        id: "item-1",
        kind: "drawing",
        title: "Board",
        updatedAt: "2026-03-09T10:00:00.000Z",
        createdAt: "2026-03-09T10:00:00.000Z",
      },
      content: '{"elements":[{"id":"el-1"}]}',
      collaborationRoom: {
        roomId: "item-1",
        roomKey: "abcdefghijklmnopqrstuv",
        enabledAt: "2026-03-09T12:00:00.000Z",
      },
    });
  });

  it("desativa colaboracao sem perder a room key do drawing", async () => {
    const { store, state } = createStore({
      items: [
        {
          id: "item-1",
          owner_id: "user-1",
          folder_id: null,
          kind: "drawing",
          title: "Board",
          content_blob_key: "users/user-1/items/item-1/current.excalidraw",
          archived_at: null,
          collaboration_room_key: "abcdefghijklmnopqrstuv",
          collaboration_enabled_at: "2026-03-09T11:00:00.000Z",
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
    });

    await store.disableItemCollaboration("user-1", "item-1");

    expect(state.items[0]?.collaboration_enabled_at).toBeNull();
    expect(state.items[0]?.collaboration_room_key).toBe(
      "abcdefghijklmnopqrstuv",
    );
  });

  it("reutiliza o link ativo e limpa duplicados antigos", async () => {
    const { store, state } = createStore({
      items: [
        {
          id: "item-1",
          owner_id: "user-1",
          folder_id: null,
          kind: "drawing",
          title: "Mapa",
          content_blob_key: "users/user-1/items/item-1/current.excalidraw",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
      shareLinks: [
        {
          id: "link-new",
          item_id: "item-1",
          token: "token-new",
          created_by_user_id: "user-1",
          created_at: "2026-03-09T11:00:00.000Z",
          revoked_at: null,
        },
        {
          id: "link-old",
          item_id: "item-1",
          token: "token-old",
          created_by_user_id: "user-1",
          created_at: "2026-03-09T10:30:00.000Z",
          revoked_at: null,
        },
      ],
    });

    const shareLink = await store.createShareLink("user-1", "item-1");
    expect(shareLink).toEqual({
      id: "link-new",
      token: "token-new",
      createdAt: "2026-03-09T11:00:00.000Z",
      revokedAt: null,
    });

    const tree = await store.getTree("user-1");
    expect(tree.items[0]?.shareLinks).toEqual([shareLink]);

    const revokedDuplicate = state.shareLinks.find(
      (entry) => entry.id === "link-old",
    );
    expect(revokedDuplicate?.revoked_at).toBeTruthy();

    await store.revokeShareLink("user-1", "link-new");

    const activeLinks = state.shareLinks.filter(
      (entry) => entry.item_id === "item-1" && entry.revoked_at === null,
    );
    expect(activeLinks).toEqual([]);
  });
});
