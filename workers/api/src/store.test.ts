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

type HybridItemRow = {
  id: string;
  owner_id: string;
  doc_item_id: string;
  drawing_item_id: string;
  default_view: "document" | "both" | "canvas";
  created_at: string;
  updated_at: string;
};

type UserRow = {
  id: string;
  github_login: string;
  name: string;
  avatar_url: string | null;
};

type FolderShareRow = {
  id: string;
  folder_id: string;
  user_id: string;
  role: "viewer" | "editor";
  granted_by_user_id: string;
  created_at: string;
  updated_at: string;
};

type FakeState = {
  folders: FolderRow[];
  items: ItemRow[];
  shareLinks: ShareLinkRow[];
  hybridItems: HybridItemRow[];
  users: UserRow[];
  folderShares: FolderShareRow[];
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

    if (query === "SELECT * FROM items WHERE id = ?") {
      const [itemId] = this.values as [string];
      return (this.state.items.find((item) => item.id === itemId) ||
        null) as T | null;
    }

    if (query === "SELECT owner_id FROM folders WHERE id = ?") {
      const [folderId] = this.values as [string];
      const folder = this.state.folders.find((entry) => entry.id === folderId);
      return (folder ? { owner_id: folder.owner_id } : null) as T | null;
    }

    if (
      query ===
      "SELECT role FROM folder_shares WHERE folder_id = ? AND user_id = ?"
    ) {
      const [folderId, userId] = this.values as [string, string];
      const share = this.state.folderShares.find(
        (entry) => entry.folder_id === folderId && entry.user_id === userId,
      );
      return (share ? { role: share.role } : null) as T | null;
    }

    if (
      query ===
      "SELECT * FROM folder_shares WHERE folder_id = ? AND user_id = ?"
    ) {
      const [folderId, userId] = this.values as [string, string];
      return (this.state.folderShares.find(
        (entry) => entry.folder_id === folderId && entry.user_id === userId,
      ) || null) as T | null;
    }

    if (
      query ===
      "SELECT id, github_login, name, avatar_url FROM users WHERE github_login = ? COLLATE NOCASE LIMIT 1"
    ) {
      const [login] = this.values as [string];
      const user = this.state.users.find(
        (entry) =>
          entry.github_login.toLowerCase() === login.toLowerCase(),
      );
      return (user
        ? {
            id: user.id,
            github_login: user.github_login,
            name: user.name,
            avatar_url: user.avatar_url,
          }
        : null) as T | null;
    }

    if (
      normalizeQuery(query) ===
      normalizeQuery(
        `SELECT
           folder_shares.id AS share_id,
           folder_shares.role AS share_role,
           folder_shares.created_at AS share_created_at,
           users.id AS user_id,
           users.github_login AS github_login,
           users.name AS user_name,
           users.avatar_url AS avatar_url
         FROM folder_shares
         JOIN users ON users.id = folder_shares.user_id
         WHERE folder_shares.id = ?`,
      )
    ) {
      const [shareId] = this.values as [string];
      const share = this.state.folderShares.find(
        (entry) => entry.id === shareId,
      );
      if (!share) {
        return null;
      }
      const user = this.state.users.find((entry) => entry.id === share.user_id);
      if (!user) {
        return null;
      }
      return {
        share_id: share.id,
        share_role: share.role,
        share_created_at: share.created_at,
        user_id: user.id,
        github_login: user.github_login,
        user_name: user.name,
        avatar_url: user.avatar_url,
      } as T;
    }

    if (query === "SELECT * FROM hybrid_items WHERE id = ? AND owner_id = ?") {
      const [hybridId, ownerId] = this.values as [string, string];
      return (this.state.hybridItems.find(
        (item) => item.id === hybridId && item.owner_id === ownerId,
      ) || null) as T | null;
    }

    if (
      query ===
      "SELECT * FROM hybrid_items WHERE (doc_item_id = ? OR drawing_item_id = ?) AND owner_id = ? LIMIT 1"
    ) {
      const [docItemId, drawingItemId, ownerId] = this.values as [
        string,
        string,
        string,
      ];
      return (this.state.hybridItems.find(
        (item) =>
          item.owner_id === ownerId &&
          (item.doc_item_id === docItemId ||
            item.drawing_item_id === drawingItemId),
      ) || null) as T | null;
    }

    if (
      query ===
      "SELECT * FROM hybrid_items WHERE (doc_item_id = ? OR drawing_item_id = ?) LIMIT 1"
    ) {
      const [docItemId, drawingItemId] = this.values as [string, string];
      return (this.state.hybridItems.find(
        (item) =>
          item.doc_item_id === docItemId ||
          item.drawing_item_id === drawingItemId,
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

    if (
      query ===
      "SELECT id, kind, title, updated_at, content_blob_key FROM items WHERE id = ?"
    ) {
      const [itemId] = this.values as [string];
      const item = this.state.items.find((entry) => entry.id === itemId);

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

    if (
      query ===
      "SELECT * FROM hybrid_items WHERE owner_id = ? ORDER BY updated_at DESC, created_at DESC"
    ) {
      const [ownerId] = this.values as [string];
      const results = this.state.hybridItems
        .filter((entry) => entry.owner_id === ownerId)
        .sort((left, right) => {
          const byUpdated = right.updated_at.localeCompare(left.updated_at);
          return byUpdated || right.created_at.localeCompare(left.created_at);
        });
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

    // getTree: folders shared WITH this user (incoming shares) + owner data.
    if (
      query.startsWith("SELECT folder_shares.role AS share_role") &&
      query.includes("FROM folder_shares JOIN folders")
    ) {
      const [userId] = this.values as [string];
      const results = this.state.folderShares
        .filter((share) => share.user_id === userId)
        .map((share) => {
          const folder = this.state.folders.find(
            (entry) => entry.id === share.folder_id,
          );
          const owner = this.state.users.find(
            (entry) => entry.id === folder?.owner_id,
          );
          if (!folder || !owner) {
            return null;
          }
          return {
            share_role: share.role,
            folder_id: folder.id,
            folder_owner_id: folder.owner_id,
            folder_parent_id: folder.parent_id,
            folder_name: folder.name,
            folder_created_at: folder.created_at,
            folder_updated_at: folder.updated_at,
            owner_login: owner.github_login,
            owner_name: owner.name,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .sort((left, right) => {
          const byName = left.folder_name.localeCompare(right.folder_name);
          return byName || left.folder_created_at.localeCompare(right.folder_created_at);
        });
      return { results: results as T[] };
    }

    // getTree: items in shared folders (folder_id IN (...)).
    if (
      query.startsWith("SELECT * FROM items WHERE folder_id IN (") &&
      query.includes("ORDER BY title")
    ) {
      const folderIds = this.values as string[];
      const set = new Set(folderIds);
      const results = this.state.items
        .filter((entry) => entry.folder_id !== null && set.has(entry.folder_id))
        .sort((left, right) => {
          const byTitle = left.title.localeCompare(right.title);
          return byTitle || left.created_at.localeCompare(right.created_at);
        });
      return { results: results as T[] };
    }

    // getTree: share_links of items in shared folders.
    if (
      query.startsWith("SELECT share_links.* FROM share_links JOIN items") &&
      query.includes("WHERE items.folder_id IN (")
    ) {
      const folderIds = this.values as string[];
      const set = new Set(folderIds);
      const results = this.state.shareLinks
        .filter((entry) => {
          const item = this.state.items.find(
            (candidate) => candidate.id === entry.item_id,
          );
          return (
            entry.revoked_at === null &&
            item?.folder_id !== null &&
            item !== undefined &&
            item.folder_id !== null &&
            set.has(item.folder_id)
          );
        })
        .sort((left, right) => right.created_at.localeCompare(left.created_at));
      return { results: results as T[] };
    }

    // getTree: hybrid_items whose doc-root lives in a shared folder.
    if (
      query.startsWith("SELECT hybrid_items.* FROM hybrid_items JOIN items") &&
      query.includes("WHERE doc.folder_id IN (")
    ) {
      const folderIds = this.values as string[];
      const set = new Set(folderIds);
      const results = this.state.hybridItems
        .filter((hybrid) => {
          const doc = this.state.items.find(
            (entry) => entry.id === hybrid.doc_item_id,
          );
          return (
            doc?.folder_id !== null &&
            doc !== undefined &&
            doc.folder_id !== null &&
            set.has(doc.folder_id)
          );
        })
        .sort((left, right) => {
          const byUpdated = right.updated_at.localeCompare(left.updated_at);
          return byUpdated || right.created_at.localeCompare(left.created_at);
        });
      return { results: results as T[] };
    }

    // searchUsers
    if (
      query.startsWith(
        "SELECT id, github_login, name, avatar_url FROM users WHERE id != ?",
      )
    ) {
      const [excludeUserId, pattern, , limit] = this.values as [
        string,
        string,
        string,
        number,
      ];
      // Translate the escaped SQL LIKE pattern back into a matcher. The store
      // wraps the term in %...% and escapes \ % _ with a leading backslash.
      const inner = pattern.slice(1, -1); // strip surrounding %
      const term = inner.replace(/\\([\\%_])/g, "$1").toLowerCase();
      const results = this.state.users
        .filter((entry) => entry.id !== excludeUserId)
        .filter(
          (entry) =>
            entry.github_login.toLowerCase().includes(term) ||
            entry.name.toLowerCase().includes(term),
        )
        .sort((left, right) =>
          left.github_login.localeCompare(right.github_login),
        )
        .slice(0, limit)
        .map((entry) => ({
          id: entry.id,
          github_login: entry.github_login,
          name: entry.name,
          avatar_url: entry.avatar_url,
        }));
      return { results: results as T[] };
    }

    // listFolderShares
    if (
      query.startsWith("SELECT folder_shares.id AS share_id") &&
      query.includes("WHERE folder_shares.folder_id = ?")
    ) {
      const [folderId] = this.values as [string];
      const results = this.state.folderShares
        .filter((share) => share.folder_id === folderId)
        .sort((left, right) => left.created_at.localeCompare(right.created_at))
        .map((share) => {
          const user = this.state.users.find(
            (entry) => entry.id === share.user_id,
          );
          return {
            share_id: share.id,
            share_role: share.role,
            share_created_at: share.created_at,
            user_id: user?.id ?? share.user_id,
            github_login: user?.github_login ?? "",
            user_name: user?.name ?? "",
            avatar_url: user?.avatar_url ?? null,
          };
        });
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
      "INSERT INTO hybrid_items ( id, owner_id, doc_item_id, drawing_item_id, default_view, created_at, updated_at ) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ) {
      const [
        id,
        ownerId,
        docItemId,
        drawingItemId,
        defaultView,
        createdAt,
        updatedAt,
      ] = this.values as [
        string,
        string,
        string,
        string,
        "document" | "both" | "canvas",
        string,
        string,
      ];
      this.state.hybridItems.push({
        id,
        owner_id: ownerId,
        doc_item_id: docItemId,
        drawing_item_id: drawingItemId,
        default_view: defaultView,
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
      query ===
      "UPDATE items SET title = ?, folder_id = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
    ) {
      const [title, folderId, updatedAt, itemId, ownerId] = this.values as [
        string,
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

    if (query === "UPDATE items SET updated_at = ? WHERE id = ?") {
      const [updatedAt, itemId] = this.values as [string, string];
      const item = this.state.items.find((entry) => entry.id === itemId);
      if (item) {
        item.updated_at = updatedAt;
      }
      return { meta: { changes: item ? 1 : 0 } };
    }

    if (
      query ===
      "INSERT INTO folder_shares (id, folder_id, user_id, role, granted_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ) {
      const [
        id,
        folderId,
        userId,
        role,
        grantedBy,
        createdAt,
        updatedAt,
      ] = this.values as [
        string,
        string,
        string,
        "viewer" | "editor",
        string,
        string,
        string,
      ];
      this.state.folderShares.push({
        id,
        folder_id: folderId,
        user_id: userId,
        role,
        granted_by_user_id: grantedBy,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return { meta: { changes: 1 } };
    }

    if (
      query === "UPDATE folder_shares SET role = ?, updated_at = ? WHERE id = ?"
    ) {
      const [role, updatedAt, id] = this.values as [
        "viewer" | "editor",
        string,
        string,
      ];
      const share = this.state.folderShares.find((entry) => entry.id === id);
      if (share) {
        share.role = role;
        share.updated_at = updatedAt;
      }
      return { meta: { changes: share ? 1 : 0 } };
    }

    if (
      query ===
      "UPDATE folder_shares SET role = ?, updated_at = ? WHERE id = ? AND folder_id = ?"
    ) {
      const [role, updatedAt, id, folderId] = this.values as [
        "viewer" | "editor",
        string,
        string,
        string,
      ];
      const share = this.state.folderShares.find(
        (entry) => entry.id === id && entry.folder_id === folderId,
      );
      if (share) {
        share.role = role;
        share.updated_at = updatedAt;
      }
      return { meta: { changes: share ? 1 : 0 } };
    }

    if (
      query === "DELETE FROM folder_shares WHERE id = ? AND folder_id = ?"
    ) {
      const [id, folderId] = this.values as [string, string];
      const before = this.state.folderShares.length;
      this.state.folderShares = this.state.folderShares.filter(
        (entry) => !(entry.id === id && entry.folder_id === folderId),
      );
      return { meta: { changes: before - this.state.folderShares.length } };
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

    if (
      query ===
      "UPDATE hybrid_items SET updated_at = ? WHERE id = ? AND owner_id = ?"
    ) {
      const [updatedAt, hybridId, ownerId] = this.values as [
        string,
        string,
        string,
      ];
      const hybridItem = this.state.hybridItems.find(
        (entry) => entry.id === hybridId && entry.owner_id === ownerId,
      );
      if (hybridItem) {
        hybridItem.updated_at = updatedAt;
      }
      return {};
    }

    if (
      query ===
      "UPDATE hybrid_items SET default_view = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
    ) {
      const [defaultView, updatedAt, hybridId, ownerId] = this.values as [
        "document" | "both" | "canvas",
        string,
        string,
        string,
      ];
      const hybridItem = this.state.hybridItems.find(
        (entry) => entry.id === hybridId && entry.owner_id === ownerId,
      );
      if (hybridItem) {
        hybridItem.default_view = defaultView;
        hybridItem.updated_at = updatedAt;
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

    if (query === "DELETE FROM hybrid_items WHERE id = ? AND owner_id = ?") {
      const [hybridId, ownerId] = this.values as [string, string];
      this.state.hybridItems = this.state.hybridItems.filter(
        (entry) => !(entry.id === hybridId && entry.owner_id === ownerId),
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
    hybridItems: state?.hybridItems ?? [],
    users: state?.users ?? [],
    folderShares: state?.folderShares ?? [],
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

  it("cria um hybrid item e colapsa doc+drawing em uma unica entrada na arvore", async () => {
    const uuidSpy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000111")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000222")
      .mockReturnValueOnce("00000000-0000-0000-0000-000000000333");
    const { store, state, blobs } = createStore({
      folders: [
        {
          id: "folder-1",
          owner_id: "user-1",
          parent_id: null,
          name: "Architecture",
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
    });

    const created = await store.createHybridItem("user-1", {
      title: "Portal Cross",
      folderId: "folder-1",
    });

    expect(created).toEqual({
      hybridId: "00000000-0000-0000-0000-000000000333",
      docItemId: "00000000-0000-0000-0000-000000000111",
      drawingItemId: "00000000-0000-0000-0000-000000000222",
    });
    expect(state.hybridItems).toEqual([
      {
        id: "00000000-0000-0000-0000-000000000333",
        owner_id: "user-1",
        doc_item_id: "00000000-0000-0000-0000-000000000111",
        drawing_item_id: "00000000-0000-0000-0000-000000000222",
        default_view: "both",
        created_at: "2026-03-09T12:00:00.000Z",
        updated_at: "2026-03-09T12:00:00.000Z",
      },
    ]);
    expect(
      blobs.objects.get(
        "users/user-1/items/00000000-0000-0000-0000-000000000111/current.md",
      ),
    ).toBe("# Portal Cross\n\n");

    const tree = await store.getTree("user-1");
    expect(tree.items).toEqual([
      {
        id: "00000000-0000-0000-0000-000000000333",
        kind: "hybrid",
        title: "Portal Cross",
        folderId: "folder-1",
        ownerId: "user-1",
        updatedAt: "2026-03-09T12:00:00.000Z",
        createdAt: "2026-03-09T12:00:00.000Z",
        archivedAt: null,
        shareLinks: [],
        docItemId: "00000000-0000-0000-0000-000000000111",
        drawingItemId: "00000000-0000-0000-0000-000000000222",
        defaultView: "both",
      },
    ]);

    uuidSpy.mockRestore();
  });

  it("propaga metadados do hybrid e desfaz o vinculo sem apagar os itens", async () => {
    const { store, state } = createStore({
      items: [
        {
          id: "doc-1",
          owner_id: "user-1",
          folder_id: "folder-1",
          kind: "doc",
          title: "Portal Cross",
          content_blob_key: "users/user-1/items/doc-1/current.md",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
        {
          id: "drawing-1",
          owner_id: "user-1",
          folder_id: "folder-1",
          kind: "drawing",
          title: "Portal Cross",
          content_blob_key: "users/user-1/items/drawing-1/current.excalidraw",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
      folders: [
        {
          id: "folder-1",
          owner_id: "user-1",
          parent_id: null,
          name: "Architecture",
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
      hybridItems: [
        {
          id: "hybrid-1",
          owner_id: "user-1",
          doc_item_id: "doc-1",
          drawing_item_id: "drawing-1",
          default_view: "both",
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
    });

    await store.patchHybridItemMeta("user-1", "hybrid-1", {
      title: "Portal Cross v2",
      folderId: null,
      defaultView: "canvas",
    });

    expect(state.items[0]?.title).toBe("Portal Cross v2");
    expect(state.items[1]?.title).toBe("Portal Cross v2");
    expect(state.items[0]?.folder_id).toBeNull();
    expect(state.items[1]?.folder_id).toBeNull();
    expect(state.hybridItems[0]?.default_view).toBe("canvas");

    await store.deleteHybridItem("user-1", "hybrid-1");

    expect(state.hybridItems).toEqual([]);
    expect(state.items.map((item) => item.id)).toEqual(["doc-1", "drawing-1"]);
  });

  it("desfaz o vinculo hybrid ao deletar um item legado e preserva o companheiro", async () => {
    const { store, state, blobs } = createStore({
      items: [
        {
          id: "doc-1",
          owner_id: "user-1",
          folder_id: null,
          kind: "doc",
          title: "Portal Cross",
          content_blob_key: "users/user-1/items/doc-1/current.md",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
        {
          id: "drawing-1",
          owner_id: "user-1",
          folder_id: null,
          kind: "drawing",
          title: "Portal Cross",
          content_blob_key: "users/user-1/items/drawing-1/current.excalidraw",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
      shareLinks: [
        {
          id: "share-1",
          item_id: "doc-1",
          token: "token-1",
          created_by_user_id: "user-1",
          created_at: "2026-03-09T11:00:00.000Z",
          revoked_at: null,
        },
      ],
      hybridItems: [
        {
          id: "hybrid-1",
          owner_id: "user-1",
          doc_item_id: "doc-1",
          drawing_item_id: "drawing-1",
          default_view: "both",
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
    });
    await blobs.put("users/user-1/items/doc-1/current.md", "# Portal Cross");
    await blobs.put(
      "users/user-1/items/drawing-1/current.excalidraw",
      '{"elements":[]}',
    );

    await store.deleteItem("user-1", "drawing-1");

    expect(state.hybridItems).toEqual([]);
    expect(state.items.map((item) => item.id)).toEqual(["doc-1"]);
    expect(state.shareLinks.map((shareLink) => shareLink.item_id)).toEqual([
      "doc-1",
    ]);
    await expect(store.getItem("user-1", "doc-1")).resolves.toMatchObject({
      item: {
        id: "doc-1",
        hybrid: null,
      },
      content: "# Portal Cross",
    });
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
      hybrid: null,
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

  it("retorna o drawing companion no payload publico quando o doc e hibrido", async () => {
    const { store, blobs } = createStore({
      items: [
        {
          id: "doc-1",
          owner_id: "user-1",
          folder_id: null,
          kind: "doc",
          title: "Spec",
          content_blob_key: "users/user-1/items/doc-1/current.md",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
        {
          id: "drawing-1",
          owner_id: "user-1",
          folder_id: null,
          kind: "drawing",
          title: "Spec",
          content_blob_key: "users/user-1/items/drawing-1/current.excalidraw",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
      shareLinks: [
        {
          id: "share-1",
          item_id: "doc-1",
          token: "token-1",
          created_by_user_id: "user-1",
          created_at: "2026-03-09T11:00:00.000Z",
          revoked_at: null,
        },
      ],
      hybridItems: [
        {
          id: "hybrid-1",
          owner_id: "user-1",
          doc_item_id: "doc-1",
          drawing_item_id: "drawing-1",
          default_view: "both",
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
    });
    await blobs.put("users/user-1/items/doc-1/current.md", "# Hybrid");
    await blobs.put(
      "users/user-1/items/drawing-1/current.excalidraw",
      '{"elements":[]}',
    );

    await expect(store.getPublicItem("token-1")).resolves.toEqual({
      item: {
        id: "doc-1",
        kind: "doc",
        title: "Spec",
        updatedAt: "2026-03-09T10:00:00.000Z",
      },
      content: "# Hybrid",
      hybrid: {
        id: "hybrid-1",
        defaultView: "both",
        drawing: {
          item: {
            id: "drawing-1",
            kind: "drawing",
            title: "Spec",
            updatedAt: "2026-03-09T10:00:00.000Z",
          },
          content: '{"elements":[]}',
        },
      },
    });
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

describe("KindrawStore folder sharing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-09T12:00:00.000Z"));
  });

  const baseUsers: UserRow[] = [
    {
      id: "owner-1",
      github_login: "octocat",
      name: "Octo Cat",
      avatar_url: "https://avatar.test/octocat.png",
    },
    {
      id: "guest-1",
      github_login: "hubot",
      name: "Hu Bot",
      avatar_url: null,
    },
    {
      id: "guest-2",
      github_login: "monalisa",
      name: "Mona Lisa",
      avatar_url: null,
    },
  ];

  it("searchUsers acha por login e por name, exclui o proprio e escapa LIKE", async () => {
    const { store } = createStore({
      users: [
        ...baseUsers,
        {
          id: "guest-3",
          github_login: "weird_name",
          name: "100% Real",
          avatar_url: null,
        },
      ],
    });

    // por login
    const byLogin = await store.searchUsers("hub", "owner-1");
    expect(byLogin.map((u) => u.id)).toEqual(["guest-1"]);
    expect(byLogin[0]).toEqual({
      id: "guest-1",
      githubLogin: "hubot",
      name: "Hu Bot",
      avatarUrl: null,
    });

    // por name (case-insensitive)
    const byName = await store.searchUsers("mona", "owner-1");
    expect(byName.map((u) => u.id)).toEqual(["guest-2"]);

    // exclui o proprio usuario
    const excludesSelf = await store.searchUsers("octo", "owner-1");
    expect(excludesSelf).toEqual([]);

    // o "%" literal e tratado como texto (escape), nao como wildcard
    const literalPercent = await store.searchUsers("100%", "owner-1");
    expect(literalPercent.map((u) => u.id)).toEqual(["guest-3"]);

    // o "_" literal nao casa qualquer caractere
    const literalUnderscore = await store.searchUsers("weird_name", "owner-1");
    expect(literalUnderscore.map((u) => u.id)).toEqual(["guest-3"]);
    const wouldMatchIfWildcard = await store.searchUsers("weirdXname", "owner-1");
    expect(wouldMatchIfWildcard).toEqual([]);
  });

  it("getUserByLogin resolve login exato case-insensitive ou null", async () => {
    const { store } = createStore({ users: baseUsers });

    await expect(store.getUserByLogin("HUBOT")).resolves.toEqual({
      id: "guest-1",
      githubLogin: "hubot",
      name: "Hu Bot",
      avatarUrl: null,
    });
    await expect(store.getUserByLogin("ghost")).resolves.toBeNull();
  });

  it("grantFolderAccess faz upsert, valida ownership e bloqueia self-share", async () => {
    const uuidSpy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-0000-0000-0000000000aa");
    const { store, state } = createStore({
      users: baseUsers,
      folders: [
        {
          id: "folder-1",
          owner_id: "owner-1",
          parent_id: null,
          name: "Shared",
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
    });

    const share = await store.grantFolderAccess(
      "owner-1",
      "folder-1",
      "guest-1",
      "viewer",
    );
    expect(share).toEqual({
      id: "00000000-0000-0000-0000-0000000000aa",
      role: "viewer",
      createdAt: "2026-03-09T12:00:00.000Z",
      user: {
        id: "guest-1",
        githubLogin: "hubot",
        name: "Hu Bot",
        avatarUrl: null,
      },
    });
    expect(state.folderShares).toHaveLength(1);
    expect(state.folderShares[0]?.granted_by_user_id).toBe("owner-1");

    // upsert: re-conceder a mesma pessoa atualiza o role, sem nova linha
    const upserted = await store.grantFolderAccess(
      "owner-1",
      "folder-1",
      "guest-1",
      "editor",
    );
    expect(upserted.id).toBe("00000000-0000-0000-0000-0000000000aa");
    expect(upserted.role).toBe("editor");
    expect(state.folderShares).toHaveLength(1);

    // self-share bloqueado
    await expect(
      store.grantFolderAccess("owner-1", "folder-1", "owner-1", "viewer"),
    ).rejects.toMatchObject({ status: 400 });

    // pasta de outro dono => 404 (ownership)
    await expect(
      store.grantFolderAccess("guest-1", "folder-1", "guest-2", "viewer"),
    ).rejects.toMatchObject({ status: 404 });

    uuidSpy.mockRestore();
  });

  it("updateFolderAccessRole e revokeFolderAccess validam ownership e existencia", async () => {
    const { store, state } = createStore({
      users: baseUsers,
      folders: [
        {
          id: "folder-1",
          owner_id: "owner-1",
          parent_id: null,
          name: "Shared",
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
      folderShares: [
        {
          id: "share-1",
          folder_id: "folder-1",
          user_id: "guest-1",
          role: "viewer",
          granted_by_user_id: "owner-1",
          created_at: "2026-03-09T11:00:00.000Z",
          updated_at: "2026-03-09T11:00:00.000Z",
        },
      ],
    });

    const updated = await store.updateFolderAccessRole(
      "owner-1",
      "folder-1",
      "share-1",
      "editor",
    );
    expect(updated.role).toBe("editor");
    expect(state.folderShares[0]?.role).toBe("editor");

    // share inexistente => 404
    await expect(
      store.updateFolderAccessRole("owner-1", "folder-1", "nope", "viewer"),
    ).rejects.toMatchObject({ status: 404 });

    // nao-dono nao pode revogar (404 na pasta)
    await expect(
      store.revokeFolderAccess("guest-2", "folder-1", "share-1"),
    ).rejects.toMatchObject({ status: 404 });

    await store.revokeFolderAccess("owner-1", "folder-1", "share-1");
    expect(state.folderShares).toEqual([]);
  });

  it("listFolderShares lista pessoas com acesso (JOIN users)", async () => {
    const { store } = createStore({
      users: baseUsers,
      folders: [
        {
          id: "folder-1",
          owner_id: "owner-1",
          parent_id: null,
          name: "Shared",
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
      folderShares: [
        {
          id: "share-1",
          folder_id: "folder-1",
          user_id: "guest-1",
          role: "viewer",
          granted_by_user_id: "owner-1",
          created_at: "2026-03-09T11:00:00.000Z",
          updated_at: "2026-03-09T11:00:00.000Z",
        },
        {
          id: "share-2",
          folder_id: "folder-1",
          user_id: "guest-2",
          role: "editor",
          granted_by_user_id: "owner-1",
          created_at: "2026-03-09T11:30:00.000Z",
          updated_at: "2026-03-09T11:30:00.000Z",
        },
      ],
    });

    const shares = await store.listFolderShares("owner-1", "folder-1");
    expect(shares).toEqual([
      {
        id: "share-1",
        role: "viewer",
        createdAt: "2026-03-09T11:00:00.000Z",
        user: {
          id: "guest-1",
          githubLogin: "hubot",
          name: "Hu Bot",
          avatarUrl: null,
        },
      },
      {
        id: "share-2",
        role: "editor",
        createdAt: "2026-03-09T11:30:00.000Z",
        user: {
          id: "guest-2",
          githubLogin: "monalisa",
          name: "Mona Lisa",
          avatarUrl: null,
        },
      },
    ]);

    // nao-dono => 404 na pasta
    await expect(
      store.listFolderShares("guest-1", "folder-1"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("getTree do convidado inclui a pasta compartilhada (shared) e seus itens (sharedRole)", async () => {
    const { store, blobs } = createStore({
      users: baseUsers,
      folders: [
        {
          id: "folder-own",
          owner_id: "guest-1",
          parent_id: null,
          name: "My stuff",
          created_at: "2026-03-09T09:00:00.000Z",
          updated_at: "2026-03-09T09:00:00.000Z",
        },
        {
          id: "folder-shared",
          owner_id: "owner-1",
          parent_id: null,
          name: "Team",
          created_at: "2026-03-09T08:00:00.000Z",
          updated_at: "2026-03-09T08:30:00.000Z",
        },
      ],
      items: [
        {
          id: "own-item",
          owner_id: "guest-1",
          folder_id: "folder-own",
          kind: "doc",
          title: "Personal",
          content_blob_key: "users/guest-1/items/own-item/current.md",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T09:00:00.000Z",
          updated_at: "2026-03-09T09:00:00.000Z",
        },
        {
          id: "shared-item",
          owner_id: "owner-1",
          folder_id: "folder-shared",
          kind: "drawing",
          title: "Roadmap",
          content_blob_key: "users/owner-1/items/shared-item/current.excalidraw",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T08:00:00.000Z",
          updated_at: "2026-03-09T08:00:00.000Z",
        },
      ],
      folderShares: [
        {
          id: "share-1",
          folder_id: "folder-shared",
          user_id: "guest-1",
          role: "viewer",
          granted_by_user_id: "owner-1",
          created_at: "2026-03-09T11:00:00.000Z",
          updated_at: "2026-03-09T11:00:00.000Z",
        },
      ],
    });
    await blobs.put("users/guest-1/items/own-item/current.md", "# Personal");

    const tree = await store.getTree("guest-1");

    // a pasta propria nao tem `shared`; a compartilhada tem
    const ownFolder = tree.folders.find((f) => f.id === "folder-own");
    const sharedFolder = tree.folders.find((f) => f.id === "folder-shared");
    expect(ownFolder?.shared).toBeUndefined();
    expect(sharedFolder?.shared).toEqual({
      role: "viewer",
      ownerId: "owner-1",
      ownerLogin: "octocat",
      ownerName: "Octo Cat",
    });
    // pasta compartilhada vira raiz na arvore do convidado
    expect(sharedFolder?.parentId).toBeNull();

    // item proprio sem sharedRole; item da pasta compartilhada com sharedRole
    const ownItem = tree.items.find((i) => i.id === "own-item") as {
      sharedRole?: string;
    };
    const sharedItem = tree.items.find((i) => i.id === "shared-item") as {
      sharedRole?: string;
    };
    expect(ownItem?.sharedRole).toBeUndefined();
    expect(sharedItem?.sharedRole).toBe("viewer");

    // o dono ve a propria pasta SEM marcacao shared
    const ownerTree = await store.getTree("owner-1");
    const ownerFolder = ownerTree.folders.find((f) => f.id === "folder-shared");
    expect(ownerFolder?.shared).toBeUndefined();
    const ownerItem = ownerTree.items.find((i) => i.id === "shared-item") as {
      sharedRole?: string;
    };
    expect(ownerItem?.sharedRole).toBeUndefined();
  });

  it("getTree inclui hybrid cujo doc-root vive numa pasta compartilhada", async () => {
    const { store, blobs } = createStore({
      users: baseUsers,
      folders: [
        {
          id: "folder-shared",
          owner_id: "owner-1",
          parent_id: null,
          name: "Team",
          created_at: "2026-03-09T08:00:00.000Z",
          updated_at: "2026-03-09T08:00:00.000Z",
        },
      ],
      items: [
        {
          id: "doc-1",
          owner_id: "owner-1",
          folder_id: "folder-shared",
          kind: "doc",
          title: "Spec",
          content_blob_key: "users/owner-1/items/doc-1/current.md",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T08:00:00.000Z",
          updated_at: "2026-03-09T08:00:00.000Z",
        },
        {
          id: "drawing-1",
          owner_id: "owner-1",
          folder_id: "folder-shared",
          kind: "drawing",
          title: "Spec",
          content_blob_key: "users/owner-1/items/drawing-1/current.excalidraw",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T08:00:00.000Z",
          updated_at: "2026-03-09T08:00:00.000Z",
        },
      ],
      hybridItems: [
        {
          id: "hybrid-1",
          owner_id: "owner-1",
          doc_item_id: "doc-1",
          drawing_item_id: "drawing-1",
          default_view: "both",
          created_at: "2026-03-09T08:00:00.000Z",
          updated_at: "2026-03-09T08:00:00.000Z",
        },
      ],
      folderShares: [
        {
          id: "share-1",
          folder_id: "folder-shared",
          user_id: "guest-1",
          role: "editor",
          granted_by_user_id: "owner-1",
          created_at: "2026-03-09T11:00:00.000Z",
          updated_at: "2026-03-09T11:00:00.000Z",
        },
      ],
    });
    await blobs.put("users/owner-1/items/doc-1/current.md", "# Spec");

    const tree = await store.getTree("guest-1");
    // o par colapsa em uma unica entrada hybrid, marcada como editor
    const hybridEntries = tree.items.filter((i) => i.kind === "hybrid");
    expect(hybridEntries).toHaveLength(1);
    expect(hybridEntries[0]?.id).toBe("hybrid-1");
    expect((hybridEntries[0] as { sharedRole?: string }).sharedRole).toBe(
      "editor",
    );
    // doc/drawing individuais nao aparecem soltos
    expect(tree.items.some((i) => i.id === "doc-1")).toBe(false);
    expect(tree.items.some((i) => i.id === "drawing-1")).toBe(false);
  });

  it("permissao de escrita: editor pode criar/editar; viewer e estranho nao", async () => {
    const uuidSpy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("00000000-0000-0000-0000-0000000000ff");
    const { store, state, blobs } = createStore({
      users: baseUsers,
      folders: [
        {
          id: "folder-shared",
          owner_id: "owner-1",
          parent_id: null,
          name: "Team",
          created_at: "2026-03-09T08:00:00.000Z",
          updated_at: "2026-03-09T08:00:00.000Z",
        },
      ],
      items: [
        {
          id: "shared-item",
          owner_id: "owner-1",
          folder_id: "folder-shared",
          kind: "drawing",
          title: "Roadmap",
          content_blob_key: "users/owner-1/items/shared-item/current.excalidraw",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T08:00:00.000Z",
          updated_at: "2026-03-09T08:00:00.000Z",
        },
      ],
      folderShares: [
        {
          id: "share-editor",
          folder_id: "folder-shared",
          user_id: "guest-1",
          role: "editor",
          granted_by_user_id: "owner-1",
          created_at: "2026-03-09T11:00:00.000Z",
          updated_at: "2026-03-09T11:00:00.000Z",
        },
        {
          id: "share-viewer",
          folder_id: "folder-shared",
          user_id: "guest-2",
          role: "viewer",
          granted_by_user_id: "owner-1",
          created_at: "2026-03-09T11:00:00.000Z",
          updated_at: "2026-03-09T11:00:00.000Z",
        },
      ],
    });
    await blobs.put(
      "users/owner-1/items/shared-item/current.excalidraw",
      '{"elements":[]}',
    );

    // EDITOR pode criar item dentro da pasta compartilhada; o item pertence a ele
    const createdId = await store.createItem("guest-1", {
      kind: "doc",
      title: "Notes",
      folderId: "folder-shared",
      content: "# Notes",
    });
    const created = state.items.find((i) => i.id === createdId);
    expect(created?.owner_id).toBe("guest-1");
    expect(created?.folder_id).toBe("folder-shared");

    // EDITOR pode editar conteudo de item do dono dentro da pasta
    await store.putItemContent("guest-1", "shared-item", '{"elements":[1]}');
    expect(
      blobs.objects.get("users/owner-1/items/shared-item/current.excalidraw"),
    ).toBe('{"elements":[1]}');

    // EDITOR pode editar metadados (titulo) de item do dono — owner_id preservado
    await store.patchItemMeta("guest-1", "shared-item", { title: "Roadmap v2" });
    const editedByEditor = state.items.find((i) => i.id === "shared-item");
    expect(editedByEditor?.title).toBe("Roadmap v2");
    expect(editedByEditor?.owner_id).toBe("owner-1");

    // VIEWER nao pode criar dentro da pasta
    await expect(
      store.createItem("guest-2", {
        kind: "doc",
        title: "Sneaky",
        folderId: "folder-shared",
        content: "x",
      }),
    ).rejects.toMatchObject({ status: 404 });

    // VIEWER nao pode escrever conteudo
    await expect(
      store.putItemContent("guest-2", "shared-item", "nope"),
    ).rejects.toMatchObject({ status: 404 });

    // VIEWER nao pode editar metadados
    await expect(
      store.patchItemMeta("guest-2", "shared-item", { title: "hacked" }),
    ).rejects.toMatchObject({ status: 404 });

    // VIEWER PODE ler
    await expect(store.getItem("guest-2", "shared-item")).resolves.toMatchObject(
      { item: { id: "shared-item" } },
    );

    // ESTRANHO (sem share) nao le nem escreve => 404
    const stranger = "guest-3";
    await expect(
      store.getItem(stranger, "shared-item"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      store.putItemContent(stranger, "shared-item", "x"),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      store.createItem(stranger, {
        kind: "doc",
        title: "x",
        folderId: "folder-shared",
        content: "x",
      }),
    ).rejects.toMatchObject({ status: 404 });

    uuidSpy.mockRestore();
  });
});
