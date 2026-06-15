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
  access?: "read" | "live-edit" | null;
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
  github_login: string | null;
  name: string;
  avatar_url: string | null;
  email?: string | null;
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

type HybridShareRow = {
  id: string;
  hybrid_id: string;
  user_id: string;
  role: "viewer" | "editor";
  granted_by_user_id: string;
  created_at: string;
  updated_at: string;
};

type ShareInviteRow = {
  id: string;
  token: string;
  resource_type: "folder" | "hybrid";
  resource_id: string;
  email: string | null;
  role: "viewer" | "editor";
  invited_by_user_id: string;
  accepted_by_user_id: string | null;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
};

type FakeState = {
  folders: FolderRow[];
  items: ItemRow[];
  shareLinks: ShareLinkRow[];
  hybridItems: HybridItemRow[];
  users: UserRow[];
  folderShares: FolderShareRow[];
  hybridShares: HybridShareRow[];
  shareInvites: ShareInviteRow[];
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
      query.startsWith(
        "SELECT id, github_login, name, avatar_url FROM users WHERE github_login = ? COLLATE NOCASE",
      )
    ) {
      // getUserByLogin: matches @github_login, full email, or email local-part.
      const [login, email, emailLocalPattern] = this.values as [
        string,
        string,
        string,
      ];
      const localPrefix = emailLocalPattern
        .replace(/\\([\\%_])/g, "$1")
        .replace(/@%$/, "@")
        .toLowerCase();
      const user = this.state.users.find((entry) => {
        const byLogin =
          (entry.github_login ?? "").toLowerCase() === login.toLowerCase();
        const byEmail =
          !!entry.email && entry.email.toLowerCase() === email.toLowerCase();
        const byLocal =
          !!entry.email && entry.email.toLowerCase().startsWith(localPrefix);
        return byLogin || byEmail || byLocal;
      });
      return (
        user
          ? {
              id: user.id,
              github_login: user.github_login,
              name: user.name,
              avatar_url: user.avatar_url,
            }
          : null
      ) as T | null;
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

    if (query === "SELECT owner_id FROM hybrid_items WHERE id = ?") {
      const [hybridId] = this.values as [string];
      const hybrid = this.state.hybridItems.find(
        (entry) => entry.id === hybridId,
      );
      return (hybrid ? { owner_id: hybrid.owner_id } : null) as T | null;
    }

    if (
      query ===
      "SELECT role FROM hybrid_shares WHERE hybrid_id = ? AND user_id = ?"
    ) {
      const [hybridId, userId] = this.values as [string, string];
      const share = this.state.hybridShares.find(
        (entry) => entry.hybrid_id === hybridId && entry.user_id === userId,
      );
      return (share ? { role: share.role } : null) as T | null;
    }

    if (
      query ===
      "SELECT * FROM hybrid_shares WHERE hybrid_id = ? AND user_id = ?"
    ) {
      const [hybridId, userId] = this.values as [string, string];
      return (this.state.hybridShares.find(
        (entry) => entry.hybrid_id === hybridId && entry.user_id === userId,
      ) || null) as T | null;
    }

    if (
      normalizeQuery(query) ===
      normalizeQuery(
        `SELECT
           hybrid_shares.id AS share_id,
           hybrid_shares.role AS share_role,
           hybrid_shares.created_at AS share_created_at,
           users.id AS user_id,
           users.github_login AS github_login,
           users.name AS user_name,
           users.avatar_url AS avatar_url
         FROM hybrid_shares
         JOIN users ON users.id = hybrid_shares.user_id
         WHERE hybrid_shares.id = ?`,
      )
    ) {
      const [shareId] = this.values as [string];
      const share = this.state.hybridShares.find(
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
      "SELECT share_links.item_id AS item_id, share_links.access AS access FROM share_links WHERE share_links.token = ? AND share_links.revoked_at IS NULL"
    ) {
      const [token] = this.values as [string];
      const shareLink = this.state.shareLinks.find(
        (entry) => entry.token === token && entry.revoked_at === null,
      );
      return (
        shareLink
          ? { item_id: shareLink.item_id, access: shareLink.access ?? "read" }
          : null
      ) as T | null;
    }

    if (
      query ===
      "SELECT items.id, items.kind, items.title, items.updated_at, items.content_blob_key, share_links.access AS access FROM share_links JOIN items ON items.id = share_links.item_id WHERE share_links.token = ? AND share_links.revoked_at IS NULL"
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
        access: shareLink.access ?? "read",
      } as T;
    }

    if (
      query ===
      "SELECT id, kind, title, updated_at, content_blob_key, collaboration_room_key, collaboration_enabled_at FROM items WHERE id = ?"
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
        collaboration_room_key: item.collaboration_room_key,
        collaboration_enabled_at: item.collaboration_enabled_at,
      } as T;
    }

    // getInviteByToken
    if (query === "SELECT * FROM share_invites WHERE token = ?") {
      const [token] = this.values as [string];
      return (this.state.shareInvites.find((entry) => entry.token === token) ||
        null) as T | null;
    }

    // loadInviteResource (folder): nome da pasta + dono.
    if (
      normalizeQuery(query) ===
      normalizeQuery(
        `SELECT folders.name AS name,
                  folders.owner_id AS owner_id,
                  owner.name AS owner_name
             FROM folders
             JOIN users AS owner ON owner.id = folders.owner_id
             WHERE folders.id = ?`,
      )
    ) {
      const [folderId] = this.values as [string];
      const folder = this.state.folders.find((entry) => entry.id === folderId);
      if (!folder) {
        return null;
      }
      const owner = this.state.users.find(
        (entry) => entry.id === folder.owner_id,
      );
      if (!owner) {
        return null;
      }
      return {
        name: folder.name,
        owner_id: folder.owner_id,
        owner_name: owner.name,
      } as T;
    }

    // loadInviteResource (hybrid): título do doc-root + dono.
    if (
      normalizeQuery(query) ===
      normalizeQuery(
        `SELECT doc.title AS name,
                hybrid_items.owner_id AS owner_id,
                owner.name AS owner_name
           FROM hybrid_items
           JOIN items AS doc ON doc.id = hybrid_items.doc_item_id
           JOIN users AS owner ON owner.id = hybrid_items.owner_id
           WHERE hybrid_items.id = ?`,
      )
    ) {
      const [hybridId] = this.values as [string];
      const hybrid = this.state.hybridItems.find(
        (entry) => entry.id === hybridId,
      );
      if (!hybrid) {
        return null;
      }
      const doc = this.state.items.find(
        (entry) => entry.id === hybrid.doc_item_id,
      );
      const owner = this.state.users.find(
        (entry) => entry.id === hybrid.owner_id,
      );
      if (!doc || !owner) {
        return null;
      }
      return {
        name: doc.title,
        owner_id: hybrid.owner_id,
        owner_name: owner.name,
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
          return (
            byName ||
            left.folder_created_at.localeCompare(right.folder_created_at)
          );
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
      // Binds: excludeUserId, pattern(login), pattern(name), pattern(email),
      // limit. All three patterns are identical, so we read the first one.
      const [excludeUserId, pattern, , , limit] = this.values as [
        string,
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
            (entry.github_login ?? "").toLowerCase().includes(term) ||
            entry.name.toLowerCase().includes(term) ||
            (entry.email ?? "").toLowerCase().includes(term),
        )
        .sort((left, right) =>
          (left.github_login ?? "").localeCompare(right.github_login ?? ""),
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

    // listHybridShares
    if (
      query.startsWith("SELECT hybrid_shares.id AS share_id") &&
      query.includes("WHERE hybrid_shares.hybrid_id = ?")
    ) {
      const [hybridId] = this.values as [string];
      const results = this.state.hybridShares
        .filter((share) => share.hybrid_id === hybridId)
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

    // getTree: hybrids shared DIRECTLY with this user (hybrid_shares) + the
    // hybrid_items row, regardless of folder.
    if (
      query.startsWith("SELECT hybrid_shares.role AS share_role") &&
      query.includes("FROM hybrid_shares JOIN hybrid_items")
    ) {
      const [userId] = this.values as [string];
      const results = this.state.hybridShares
        .filter((share) => share.user_id === userId)
        .map((share) => {
          const hybrid = this.state.hybridItems.find(
            (entry) => entry.id === share.hybrid_id,
          );
          if (!hybrid) {
            return null;
          }
          return {
            share_role: share.role,
            hybrid_id: hybrid.id,
            hybrid_owner_id: hybrid.owner_id,
            doc_item_id: hybrid.doc_item_id,
            drawing_item_id: hybrid.drawing_item_id,
            default_view: hybrid.default_view,
            hybrid_created_at: hybrid.created_at,
            hybrid_updated_at: hybrid.updated_at,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)
        .sort((left, right) => {
          const byUpdated = right.hybrid_updated_at.localeCompare(
            left.hybrid_updated_at,
          );
          return (
            byUpdated ||
            right.hybrid_created_at.localeCompare(left.hybrid_created_at)
          );
        });
      return { results: results as T[] };
    }

    // getTree: doc-rows of directly-shared hybrids (id IN (...)).
    if (query.startsWith("SELECT * FROM items WHERE id IN (")) {
      const ids = this.values as string[];
      const set = new Set(ids);
      const results = this.state.items.filter((entry) => set.has(entry.id));
      return { results: results as T[] };
    }

    // getTree: share_links of directly-shared hybrid docs (item_id IN (...)).
    if (
      query.startsWith("SELECT share_links.* FROM share_links") &&
      query.includes("WHERE share_links.item_id IN (")
    ) {
      const itemIds = this.values as string[];
      const set = new Set(itemIds);
      const results = this.state.shareLinks
        .filter((entry) => entry.revoked_at === null && set.has(entry.item_id))
        .sort((left, right) => right.created_at.localeCompare(left.created_at));
      return { results: results as T[] };
    }

    // listPendingInvites: convites pendentes (não aceitos, não expirados).
    if (
      normalizeQuery(query) ===
      normalizeQuery(
        `SELECT * FROM share_invites
           WHERE resource_type = ?
             AND resource_id = ?
             AND invited_by_user_id = ?
             AND accepted_at IS NULL
             AND expires_at > ?
           ORDER BY created_at DESC`,
      )
    ) {
      const [resourceType, resourceId, ownerId, now] = this.values as [
        "folder" | "hybrid",
        string,
        string,
        string,
      ];
      const results = this.state.shareInvites
        .filter(
          (entry) =>
            entry.resource_type === resourceType &&
            entry.resource_id === resourceId &&
            entry.invited_by_user_id === ownerId &&
            entry.accepted_at === null &&
            entry.expires_at > now,
        )
        .sort((left, right) =>
          right.created_at.localeCompare(left.created_at),
        );
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
      const [id, folderId, userId, role, grantedBy, createdAt, updatedAt] = this
        .values as [
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

    if (query === "DELETE FROM folder_shares WHERE id = ? AND folder_id = ?") {
      const [id, folderId] = this.values as [string, string];
      const before = this.state.folderShares.length;
      this.state.folderShares = this.state.folderShares.filter(
        (entry) => !(entry.id === id && entry.folder_id === folderId),
      );
      return { meta: { changes: before - this.state.folderShares.length } };
    }

    if (
      query ===
      "INSERT INTO hybrid_shares (id, hybrid_id, user_id, role, granted_by_user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ) {
      const [id, hybridId, userId, role, grantedBy, createdAt, updatedAt] = this
        .values as [
        string,
        string,
        string,
        "viewer" | "editor",
        string,
        string,
        string,
      ];
      this.state.hybridShares.push({
        id,
        hybrid_id: hybridId,
        user_id: userId,
        role,
        granted_by_user_id: grantedBy,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return { meta: { changes: 1 } };
    }

    if (
      query === "UPDATE hybrid_shares SET role = ?, updated_at = ? WHERE id = ?"
    ) {
      const [role, updatedAt, id] = this.values as [
        "viewer" | "editor",
        string,
        string,
      ];
      const share = this.state.hybridShares.find((entry) => entry.id === id);
      if (share) {
        share.role = role;
        share.updated_at = updatedAt;
      }
      return { meta: { changes: share ? 1 : 0 } };
    }

    if (
      query ===
      "UPDATE hybrid_shares SET role = ?, updated_at = ? WHERE id = ? AND hybrid_id = ?"
    ) {
      const [role, updatedAt, id, hybridId] = this.values as [
        "viewer" | "editor",
        string,
        string,
        string,
      ];
      const share = this.state.hybridShares.find(
        (entry) => entry.id === id && entry.hybrid_id === hybridId,
      );
      if (share) {
        share.role = role;
        share.updated_at = updatedAt;
      }
      return { meta: { changes: share ? 1 : 0 } };
    }

    if (query === "DELETE FROM hybrid_shares WHERE id = ? AND hybrid_id = ?") {
      const [id, hybridId] = this.values as [string, string];
      const before = this.state.hybridShares.length;
      this.state.hybridShares = this.state.hybridShares.filter(
        (entry) => !(entry.id === id && entry.hybrid_id === hybridId),
      );
      return { meta: { changes: before - this.state.hybridShares.length } };
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
      "INSERT INTO share_links (id, item_id, token, created_by_user_id, created_at, revoked_at, access) VALUES (?, ?, ?, ?, ?, NULL, ?)"
    ) {
      const [id, itemId, token, userId, createdAt, access] = this.values as [
        string,
        string,
        string,
        string,
        string,
        "read" | "live-edit",
      ];
      this.state.shareLinks.push({
        id,
        item_id: itemId,
        token,
        created_by_user_id: userId,
        created_at: createdAt,
        revoked_at: null,
        access,
      });
      return {};
    }

    if (query === "UPDATE share_links SET access = ? WHERE id = ?") {
      const [access, shareLinkId] = this.values as [
        "read" | "live-edit",
        string,
      ];
      const shareLink = this.state.shareLinks.find(
        (entry) => entry.id === shareLinkId,
      );
      if (shareLink) {
        shareLink.access = access;
      }
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

    // createShareInvite
    if (
      normalizeQuery(query) ===
      normalizeQuery(
        `INSERT INTO share_invites
           (id, token, resource_type, resource_id, email, role,
            invited_by_user_id, accepted_by_user_id, accepted_at,
            expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      )
    ) {
      const [
        id,
        token,
        resourceType,
        resourceId,
        email,
        role,
        invitedBy,
        expiresAt,
        createdAt,
      ] = this.values as [
        string,
        string,
        "folder" | "hybrid",
        string,
        string | null,
        "viewer" | "editor",
        string,
        string,
        string,
      ];
      this.state.shareInvites.push({
        id,
        token,
        resource_type: resourceType,
        resource_id: resourceId,
        email,
        role,
        invited_by_user_id: invitedBy,
        accepted_by_user_id: null,
        accepted_at: null,
        expires_at: expiresAt,
        created_at: createdAt,
      });
      return { meta: { changes: 1 } };
    }

    // revokeShareInvite
    if (
      query ===
      "DELETE FROM share_invites WHERE id = ? AND invited_by_user_id = ?"
    ) {
      const [id, ownerId] = this.values as [string, string];
      const before = this.state.shareInvites.length;
      this.state.shareInvites = this.state.shareInvites.filter(
        (entry) => !(entry.id === id && entry.invited_by_user_id === ownerId),
      );
      return {
        meta: { changes: before - this.state.shareInvites.length },
      };
    }

    // acceptShareInvite: marca accepted_* (uso único — só se ainda não aceito).
    if (
      normalizeQuery(query) ===
      normalizeQuery(
        `UPDATE share_invites
           SET accepted_by_user_id = ?, accepted_at = ?
         WHERE id = ? AND accepted_at IS NULL`,
      )
    ) {
      const [acceptedBy, acceptedAt, id] = this.values as [
        string,
        string,
        string,
      ];
      const invite = this.state.shareInvites.find(
        (entry) => entry.id === id && entry.accepted_at === null,
      );
      if (invite) {
        invite.accepted_by_user_id = acceptedBy;
        invite.accepted_at = acceptedAt;
      }
      return { meta: { changes: invite ? 1 : 0 } };
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
    hybridShares: state?.hybridShares ?? [],
    shareInvites: state?.shareInvites ?? [],
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

  it("converte um drawing existente em hybrid criando um doc ao lado", async () => {
    const uuidSpy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-0000-0000-0000000000d1") // doc novo
      .mockReturnValueOnce("00000000-0000-0000-0000-0000000000h1"); // hybrid
    const { store, state, blobs } = createStore({
      items: [
        {
          id: "draw-1",
          owner_id: "user-1",
          folder_id: null,
          kind: "drawing",
          title: "Fluxo do checkout",
          content_blob_key: "users/user-1/items/draw-1/current.excalidraw",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
    });

    const created = await store.convertDrawingToHybrid("user-1", "draw-1");

    expect(created).toEqual({
      hybridId: "00000000-0000-0000-0000-0000000000h1",
      docItemId: "00000000-0000-0000-0000-0000000000d1",
      drawingItemId: "draw-1",
    });
    // liga o doc novo ao DRAWING EXISTENTE (drawing preservado).
    expect(state.hybridItems).toEqual([
      {
        id: "00000000-0000-0000-0000-0000000000h1",
        owner_id: "user-1",
        doc_item_id: "00000000-0000-0000-0000-0000000000d1",
        drawing_item_id: "draw-1",
        default_view: "both",
        created_at: "2026-03-09T12:00:00.000Z",
        updated_at: "2026-03-09T12:00:00.000Z",
      },
    ]);
    // doc novo herda a pasta e o título do drawing.
    expect(
      blobs.objects.get(
        "users/user-1/items/00000000-0000-0000-0000-0000000000d1/current.md",
      ),
    ).toBe("# Fluxo do checkout\n\n");

    uuidSpy.mockRestore();
  });

  it("rejeita converter um item que não é drawing", async () => {
    const { store } = createStore({
      items: [
        {
          id: "doc-x",
          owner_id: "user-1",
          folder_id: null,
          kind: "doc",
          title: "Só um doc",
          content_blob_key: "users/user-1/items/doc-x/current.md",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
    });

    await expect(
      store.convertDrawingToHybrid("user-1", "doc-x"),
    ).rejects.toThrow(/Only drawings/);
  });

  it("rejeita converter um drawing que já faz parte de um hybrid", async () => {
    const { store } = createStore({
      items: [
        {
          id: "draw-2",
          owner_id: "user-1",
          folder_id: null,
          kind: "drawing",
          title: "Já híbrido",
          content_blob_key: "users/user-1/items/draw-2/current.excalidraw",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
      hybridItems: [
        {
          id: "hyb-existing",
          owner_id: "user-1",
          doc_item_id: "doc-existing",
          drawing_item_id: "draw-2",
          default_view: "both",
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
    });

    await expect(
      store.convertDrawingToHybrid("user-1", "draw-2"),
    ).rejects.toThrow(/already part of a hybrid/);
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
      access: "read",
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
      access: "read",
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
          collaborationRoom: null,
        },
      },
      access: "read",
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
      access: "read",
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

  it("cria link de edição ao vivo e resolve o token para o híbrido + access", async () => {
    const { store } = createStore({
      items: [
        {
          id: "doc-1",
          owner_id: "user-1",
          folder_id: null,
          kind: "doc",
          title: "Nota viva",
          content_blob_key: "users/user-1/items/doc-1/current.md",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
      hybridItems: [
        {
          id: "hyb-1",
          owner_id: "user-1",
          doc_item_id: "doc-1",
          drawing_item_id: "draw-1",
          default_view: "both",
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
      shareLinks: [
        {
          id: "link-live",
          item_id: "doc-1",
          token: "tok-live",
          created_by_user_id: "user-1",
          created_at: "2026-03-09T10:00:00.000Z",
          revoked_at: null,
          access: "live-edit",
        },
      ],
    });

    const resolved = await store.resolveHybridShareLink("tok-live");
    expect(resolved).toEqual({ hybridId: "hyb-1", access: "live-edit" });

    // token inexistente → null
    expect(await store.resolveHybridShareLink("nope")).toBeNull();
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
      email: null,
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
    const wouldMatchIfWildcard = await store.searchUsers(
      "weirdXname",
      "owner-1",
    );
    expect(wouldMatchIfWildcard).toEqual([]);
  });

  it("getUserByLogin resolve login exato case-insensitive ou null", async () => {
    const { store } = createStore({ users: baseUsers });

    await expect(store.getUserByLogin("HUBOT")).resolves.toEqual({
      id: "guest-1",
      githubLogin: "hubot",
      name: "Hu Bot",
      avatarUrl: null,
      email: null,
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
        email: null,
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
          email: null,
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
          email: null,
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
          content_blob_key:
            "users/owner-1/items/shared-item/current.excalidraw",
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
          content_blob_key:
            "users/owner-1/items/shared-item/current.excalidraw",
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
    await store.patchItemMeta("guest-1", "shared-item", {
      title: "Roadmap v2",
    });
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
    await expect(
      store.getItem("guest-2", "shared-item"),
    ).resolves.toMatchObject({ item: { id: "shared-item" } });

    // ESTRANHO (sem share) nao le nem escreve => 404
    const stranger = "guest-3";
    await expect(store.getItem(stranger, "shared-item")).rejects.toMatchObject({
      status: 404,
    });
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

describe("KindrawStore hybrid sharing", () => {
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

  const baseHybridState = () => ({
    users: baseUsers,
    items: [
      {
        id: "doc-1",
        owner_id: "owner-1",
        folder_id: null,
        kind: "doc" as const,
        title: "Portal Cross",
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
        folder_id: null,
        kind: "drawing" as const,
        title: "Portal Cross",
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
        default_view: "both" as const,
        created_at: "2026-03-09T08:00:00.000Z",
        updated_at: "2026-03-09T08:00:00.000Z",
      },
    ],
  });

  it("grantHybridAccess faz upsert, valida ownership e bloqueia self-share", async () => {
    const uuidSpy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("00000000-0000-0000-0000-0000000000aa");
    const { store, state } = createStore(baseHybridState());

    const share = await store.grantHybridAccess(
      "owner-1",
      "hybrid-1",
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
        email: null,
      },
    });
    expect(state.hybridShares).toHaveLength(1);
    expect(state.hybridShares[0]?.granted_by_user_id).toBe("owner-1");

    // upsert: re-conceder a mesma pessoa atualiza o role, sem nova linha
    const upserted = await store.grantHybridAccess(
      "owner-1",
      "hybrid-1",
      "guest-1",
      "editor",
    );
    expect(upserted.id).toBe("00000000-0000-0000-0000-0000000000aa");
    expect(upserted.role).toBe("editor");
    expect(state.hybridShares).toHaveLength(1);

    // self-share bloqueado
    await expect(
      store.grantHybridAccess("owner-1", "hybrid-1", "owner-1", "viewer"),
    ).rejects.toMatchObject({ status: 400 });

    // hibrido de outro dono => 404 (ownership)
    await expect(
      store.grantHybridAccess("guest-1", "hybrid-1", "guest-2", "viewer"),
    ).rejects.toMatchObject({ status: 404 });

    uuidSpy.mockRestore();
  });

  it("updateHybridAccessRole e revokeHybridAccess validam ownership e existencia", async () => {
    const { store, state } = createStore({
      ...baseHybridState(),
      hybridShares: [
        {
          id: "share-1",
          hybrid_id: "hybrid-1",
          user_id: "guest-1",
          role: "viewer",
          granted_by_user_id: "owner-1",
          created_at: "2026-03-09T11:00:00.000Z",
          updated_at: "2026-03-09T11:00:00.000Z",
        },
      ],
    });

    const updated = await store.updateHybridAccessRole(
      "owner-1",
      "hybrid-1",
      "share-1",
      "editor",
    );
    expect(updated.role).toBe("editor");
    expect(state.hybridShares[0]?.role).toBe("editor");

    // share inexistente => 404
    await expect(
      store.updateHybridAccessRole("owner-1", "hybrid-1", "nope", "viewer"),
    ).rejects.toMatchObject({ status: 404 });

    // nao-dono nao pode revogar (404 no hibrido)
    await expect(
      store.revokeHybridAccess("guest-2", "hybrid-1", "share-1"),
    ).rejects.toMatchObject({ status: 404 });

    await store.revokeHybridAccess("owner-1", "hybrid-1", "share-1");
    expect(state.hybridShares).toEqual([]);
  });

  it("listHybridShares lista pessoas com acesso (JOIN users)", async () => {
    const { store } = createStore({
      ...baseHybridState(),
      hybridShares: [
        {
          id: "share-1",
          hybrid_id: "hybrid-1",
          user_id: "guest-1",
          role: "viewer",
          granted_by_user_id: "owner-1",
          created_at: "2026-03-09T11:00:00.000Z",
          updated_at: "2026-03-09T11:00:00.000Z",
        },
        {
          id: "share-2",
          hybrid_id: "hybrid-1",
          user_id: "guest-2",
          role: "editor",
          granted_by_user_id: "owner-1",
          created_at: "2026-03-09T11:30:00.000Z",
          updated_at: "2026-03-09T11:30:00.000Z",
        },
      ],
    });

    const shares = await store.listHybridShares("owner-1", "hybrid-1");
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
          email: null,
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
          email: null,
        },
      },
    ]);

    // nao-dono => 404 no hibrido
    await expect(
      store.listHybridShares("guest-1", "hybrid-1"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("getTree do convidado inclui o hybrid compartilhado diretamente (sharedRole, folderId null)", async () => {
    const { store, blobs } = createStore({
      ...baseHybridState(),
      hybridShares: [
        {
          id: "share-1",
          hybrid_id: "hybrid-1",
          user_id: "guest-1",
          role: "editor",
          granted_by_user_id: "owner-1",
          created_at: "2026-03-09T11:00:00.000Z",
          updated_at: "2026-03-09T11:00:00.000Z",
        },
      ],
    });
    await blobs.put("users/owner-1/items/doc-1/current.md", "# Portal Cross");

    const tree = await store.getTree("guest-1");

    // o par colapsa em uma unica entrada hybrid, marcada como editor e na raiz
    const hybridEntries = tree.items.filter((i) => i.kind === "hybrid");
    expect(hybridEntries).toHaveLength(1);
    expect(hybridEntries[0]?.id).toBe("hybrid-1");
    expect((hybridEntries[0] as { sharedRole?: string }).sharedRole).toBe(
      "editor",
    );
    expect(hybridEntries[0]?.folderId).toBeNull();
    // doc/drawing individuais nao aparecem soltos
    expect(tree.items.some((i) => i.id === "doc-1")).toBe(false);
    expect(tree.items.some((i) => i.id === "drawing-1")).toBe(false);

    // o dono ve o proprio hybrid SEM sharedRole
    const ownerTree = await store.getTree("owner-1");
    const ownerHybrid = ownerTree.items.find((i) => i.id === "hybrid-1") as {
      sharedRole?: string;
    };
    expect(ownerHybrid?.sharedRole).toBeUndefined();
  });
});

// --- Account linking (upsertOAuthUser) --------------------------------------
// The big FakeStatement above matches whole SQL strings and doesn't model the
// users table's full column set. This suite uses a small, dedicated in-memory
// D1 double that understands exactly the queries upsertOAuthUser issues, so we
// can assert the merge-by-email behaviour (the security-critical path).

type FullUserRow = {
  id: string;
  github_id: string | null;
  google_sub: string | null;
  email: string | null;
  github_login: string | null;
  name: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

class AuthFakeStatement implements D1PreparedStatement {
  private values: unknown[] = [];

  constructor(
    private readonly query: string,
    private readonly users: FullUserRow[],
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T = Record<string, unknown>>() {
    const q = normalizeQuery(this.query);
    if (q === "SELECT * FROM users WHERE github_id = ?") {
      const [id] = this.values as [string];
      return (this.users.find((u) => u.github_id === id) ?? null) as T | null;
    }
    if (q === "SELECT * FROM users WHERE google_sub = ?") {
      const [id] = this.values as [string];
      return (this.users.find((u) => u.google_sub === id) ?? null) as T | null;
    }
    if (q === "SELECT * FROM users WHERE email = ?") {
      const [email] = this.values as [string];
      return (this.users.find((u) => u.email === email) ?? null) as T | null;
    }
    if (q === "SELECT id FROM users WHERE email = ? AND id != ?") {
      const [email, excludeId] = this.values as [string, string];
      const owner = this.users.find(
        (u) => u.email === email && u.id !== excludeId,
      );
      return (owner ? { id: owner.id } : null) as T | null;
    }
    throw new Error(`Unsupported auth first() query: ${q}`);
  }

  async all<T = Record<string, unknown>>() {
    return { results: [] as T[] };
  }

  async run() {
    const q = normalizeQuery(this.query);
    if (q.startsWith("UPDATE users SET github_id = ?")) {
      const [
        githubId,
        googleSub,
        email,
        githubLogin,
        name,
        avatarUrl,
        updatedAt,
        id,
      ] = this.values as [
        string | null,
        string | null,
        string | null,
        string | null,
        string,
        string | null,
        string,
        string,
      ];
      const row = this.users.find((u) => u.id === id);
      if (row) {
        Object.assign(row, {
          github_id: githubId,
          google_sub: googleSub,
          email,
          github_login: githubLogin,
          name,
          avatar_url: avatarUrl,
          updated_at: updatedAt,
        });
      }
      return {};
    }
    if (q.startsWith("INSERT INTO users")) {
      const [
        id,
        githubId,
        googleSub,
        email,
        githubLogin,
        name,
        avatarUrl,
        createdAt,
        updatedAt,
      ] = this.values as [
        string,
        string | null,
        string | null,
        string | null,
        string | null,
        string,
        string | null,
        string,
        string,
      ];
      this.users.push({
        id,
        github_id: githubId,
        google_sub: googleSub,
        email,
        github_login: githubLogin,
        name,
        avatar_url: avatarUrl,
        created_at: createdAt,
        updated_at: updatedAt,
      });
      return {};
    }
    throw new Error(`Unsupported auth run() query: ${q}`);
  }
}

class AuthFakeD1 implements D1Database {
  constructor(readonly users: FullUserRow[]) {}
  prepare(query: string) {
    return new AuthFakeStatement(query, this.users);
  }
  async batch() {
    return [];
  }
}

const createAuthStore = (users: FullUserRow[] = []) => {
  const blobs = new FakeR2Bucket();
  return {
    users,
    store: new KindrawStore(new AuthFakeD1(users), blobs),
  };
};

describe("KindrawStore.upsertOAuthUser (account linking)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
  });

  it("cria uma conta nova quando o Google sub ainda nao existe", async () => {
    const { users, store } = createAuthStore([]);
    const user = await store.upsertOAuthUser({
      provider: "google",
      providerId: "google-123",
      email: "alice@test.dev",
      name: "Alice",
      avatarUrl: "https://avatar.test/a.png",
    });

    expect(users).toHaveLength(1);
    expect(user.google_sub).toBe("google-123");
    expect(user.github_id).toBeNull();
    expect(user.email).toBe("alice@test.dev");
  });

  it("vincula o Google a uma conta GitHub existente quando o email confere", async () => {
    const { users, store } = createAuthStore([
      {
        id: "u-existing",
        github_id: "gh-42",
        google_sub: null,
        email: "bob@test.dev",
        github_login: "bob",
        name: "Bob",
        avatar_url: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const user = await store.upsertOAuthUser({
      provider: "google",
      providerId: "google-999",
      email: "bob@test.dev",
      name: "Bob G",
      avatarUrl: "https://avatar.test/b.png",
    });

    // NAO criou conta nova — vinculou na existente.
    expect(users).toHaveLength(1);
    expect(user.id).toBe("u-existing");
    expect(user.github_id).toBe("gh-42");
    expect(user.google_sub).toBe("google-999");
    expect(user.github_login).toBe("bob");
    expect(user.email).toBe("bob@test.dev");
  });

  it("NAO vincula quando nao ha email (provider sem email verificado cria conta separada)", async () => {
    const { users, store } = createAuthStore([
      {
        id: "u-existing",
        github_id: "gh-42",
        google_sub: null,
        email: "carol@test.dev",
        github_login: "carol",
        name: "Carol",
        avatar_url: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ]);

    // Sem email (ex.: Google sem email_verified) => nao casa por email.
    const user = await store.upsertOAuthUser({
      provider: "google",
      providerId: "google-777",
      email: null,
      name: "Impostor",
      avatarUrl: null,
    });

    expect(users).toHaveLength(2);
    expect(user.id).not.toBe("u-existing");
    expect(user.google_sub).toBe("google-777");
  });

  it("login GitHub repetido atualiza a conta sem duplicar", async () => {
    const { users, store } = createAuthStore([]);

    const first = await store.upsertOAuthUser({
      provider: "github",
      providerId: "gh-7",
      email: "dave@test.dev",
      name: "Dave",
      avatarUrl: null,
      githubLogin: "dave",
    });
    const second = await store.upsertOAuthUser({
      provider: "github",
      providerId: "gh-7",
      email: "dave@test.dev",
      name: "Dave Renamed",
      avatarUrl: "https://avatar.test/d.png",
      githubLogin: "dave",
    });

    expect(users).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(second.name).toBe("Dave Renamed");
    expect(second.avatar_url).toBe("https://avatar.test/d.png");
  });

  it("preserva o email existente quando um login posterior nao traz email", async () => {
    const { store } = createAuthStore([]);
    await store.upsertOAuthUser({
      provider: "github",
      providerId: "gh-8",
      email: "erin@test.dev",
      name: "Erin",
      avatarUrl: null,
      githubLogin: "erin",
    });
    // Login seguinte (mesmo github_id) sem email — nao deve apagar o email.
    const updated = await store.upsertOAuthUser({
      provider: "github",
      providerId: "gh-8",
      email: null,
      name: "Erin",
      avatarUrl: null,
      githubLogin: "erin",
    });
    expect(updated.email).toBe("erin@test.dev");
  });
});

describe("KindrawStore share invites (convite por link)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-09T12:00:00.000Z"));
  });

  const baseUsers: UserRow[] = [
    {
      id: "owner-1",
      github_login: "octocat",
      name: "Octo Cat",
      avatar_url: null,
      email: "octo@test.dev",
    },
    {
      id: "guest-1",
      github_login: "hubot",
      name: "Hu Bot",
      avatar_url: null,
      email: "hubot@test.dev",
    },
    {
      id: "stranger-1",
      github_login: "mallory",
      name: "Mallory",
      avatar_url: null,
      email: null,
    },
  ];

  const folder: FolderRow = {
    id: "folder-1",
    owner_id: "owner-1",
    parent_id: null,
    name: "Plano Q3",
    created_at: "2026-03-09T10:00:00.000Z",
    updated_at: "2026-03-09T10:00:00.000Z",
  };

  // Forces a deterministic invite token (crypto.getRandomValues) + id
  // (crypto.randomUUID) so the link/token are assertable.
  const stubInviteRandomness = (
    uuid: `${string}-${string}-${string}-${string}-${string}`,
  ) => {
    const getRandomValuesSpy = vi
      .spyOn(crypto, "getRandomValues")
      .mockImplementation((array: ArrayBufferView | null) => {
        const view = array as Uint8Array;
        for (let i = 0; i < view.length; i += 1) {
          view[i] = 0;
        }
        return array as never;
      });
    const uuidSpy = vi.spyOn(crypto, "randomUUID").mockReturnValueOnce(uuid);
    return () => {
      getRandomValuesSpy.mockRestore();
      uuidSpy.mockRestore();
    };
  };

  it("createShareInvite gera token, valida ownership e expira em 7 dias", async () => {
    const restore = stubInviteRandomness(
      "00000000-0000-0000-0000-0000000000b1",
    );
    const { store, state } = createStore({
      users: baseUsers,
      folders: [folder],
    });

    const invite = await store.createShareInvite({
      resourceType: "folder",
      resourceId: "folder-1",
      email: "  GUEST@Test.dev  ",
      role: "editor",
      invitedByUserId: "owner-1",
    });

    // token = base64url de 32 bytes zerados = 43 chars "A".
    expect(invite.token).toBe("A".repeat(43));
    expect(invite.id).toBe("00000000-0000-0000-0000-0000000000b1");
    expect(invite.email).toBe("guest@test.dev"); // normalizado lower + trim
    expect(invite.role).toBe("editor");
    expect(invite.acceptedByUserId).toBeNull();
    expect(invite.createdAt).toBe("2026-03-09T12:00:00.000Z");
    // created_at + 7 dias
    expect(invite.expiresAt).toBe("2026-03-16T12:00:00.000Z");
    expect(state.shareInvites).toHaveLength(1);

    // não-dono não cria (ownership => 404)
    await expect(
      store.createShareInvite({
        resourceType: "folder",
        resourceId: "folder-1",
        email: null,
        role: "viewer",
        invitedByUserId: "guest-1",
      }),
    ).rejects.toMatchObject({ status: 404 });

    restore();
  });

  it("listFolderInvites lista só pendentes (não aceitos, não expirados)", async () => {
    const { store } = createStore({
      users: baseUsers,
      folders: [folder],
      shareInvites: [
        {
          id: "inv-pending",
          token: "tok-pending",
          resource_type: "folder",
          resource_id: "folder-1",
          email: "a@test.dev",
          role: "viewer",
          invited_by_user_id: "owner-1",
          accepted_by_user_id: null,
          accepted_at: null,
          expires_at: "2026-03-16T12:00:00.000Z",
          created_at: "2026-03-09T11:00:00.000Z",
        },
        {
          id: "inv-accepted",
          token: "tok-accepted",
          resource_type: "folder",
          resource_id: "folder-1",
          email: "b@test.dev",
          role: "editor",
          invited_by_user_id: "owner-1",
          accepted_by_user_id: "guest-1",
          accepted_at: "2026-03-09T11:30:00.000Z",
          expires_at: "2026-03-16T12:00:00.000Z",
          created_at: "2026-03-09T10:30:00.000Z",
        },
        {
          id: "inv-expired",
          token: "tok-expired",
          resource_type: "folder",
          resource_id: "folder-1",
          email: "c@test.dev",
          role: "viewer",
          invited_by_user_id: "owner-1",
          accepted_by_user_id: null,
          accepted_at: null,
          expires_at: "2026-03-01T12:00:00.000Z",
          created_at: "2026-02-22T12:00:00.000Z",
        },
      ],
    });

    const invites = await store.listFolderInvites("owner-1", "folder-1");
    expect(invites).toHaveLength(1);
    expect(invites[0]).toEqual({
      id: "inv-pending",
      email: "a@test.dev",
      role: "viewer",
      createdAt: "2026-03-09T11:00:00.000Z",
      expiresAt: "2026-03-16T12:00:00.000Z",
      link: "/invite/tok-pending",
      status: "pending",
    });

    // não-dono não lista (ownership => 404)
    await expect(
      store.listFolderInvites("guest-1", "folder-1"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("resolveShareInvite devolve metadados do recurso e do dono", async () => {
    const { store } = createStore({
      users: baseUsers,
      folders: [folder],
      shareInvites: [
        {
          id: "inv-1",
          token: "tok-1",
          resource_type: "folder",
          resource_id: "folder-1",
          email: "guest@test.dev",
          role: "editor",
          invited_by_user_id: "owner-1",
          accepted_by_user_id: null,
          accepted_at: null,
          expires_at: "2026-03-16T12:00:00.000Z",
          created_at: "2026-03-09T11:00:00.000Z",
        },
      ],
    });

    const meta = await store.resolveShareInvite("tok-1");
    expect(meta).toEqual({
      resourceType: "folder",
      resourceId: "folder-1",
      resourceName: "Plano Q3",
      role: "editor",
      expiresAt: "2026-03-16T12:00:00.000Z",
      invitedByName: "Octo Cat",
      accepted: false,
    });

    // token inexistente => 404
    await expect(store.resolveShareInvite("nope")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("acceptShareInvite vira share real e marca accepted_at", async () => {
    const restore = stubInviteRandomness(
      "00000000-0000-0000-0000-0000000000c1",
    );
    const { store, state } = createStore({
      users: baseUsers,
      folders: [folder],
      shareInvites: [
        {
          id: "inv-1",
          token: "tok-1",
          resource_type: "folder",
          resource_id: "folder-1",
          email: "guest@test.dev",
          role: "editor",
          invited_by_user_id: "owner-1",
          accepted_by_user_id: null,
          accepted_at: null,
          expires_at: "2026-03-16T12:00:00.000Z",
          created_at: "2026-03-09T11:00:00.000Z",
        },
      ],
    });

    const result = await store.acceptShareInvite("tok-1", "guest-1");
    expect(result).toEqual({ resourceType: "folder", resourceId: "folder-1" });

    // virou uma share real, com o role e o granted_by do convite
    expect(state.folderShares).toHaveLength(1);
    expect(state.folderShares[0]).toMatchObject({
      folder_id: "folder-1",
      user_id: "guest-1",
      role: "editor",
      granted_by_user_id: "owner-1",
    });

    // invite marcado como aceito
    expect(state.shareInvites[0]?.accepted_by_user_id).toBe("guest-1");
    expect(state.shareInvites[0]?.accepted_at).toBe("2026-03-09T12:00:00.000Z");

    restore();
  });

  it("acceptShareInvite rejeita token expirado", async () => {
    const { store, state } = createStore({
      users: baseUsers,
      folders: [folder],
      shareInvites: [
        {
          id: "inv-exp",
          token: "tok-exp",
          resource_type: "folder",
          resource_id: "folder-1",
          email: null,
          role: "viewer",
          invited_by_user_id: "owner-1",
          accepted_by_user_id: null,
          accepted_at: null,
          expires_at: "2026-03-01T12:00:00.000Z",
          created_at: "2026-02-22T12:00:00.000Z",
        },
      ],
    });

    await expect(
      store.acceptShareInvite("tok-exp", "guest-1"),
    ).rejects.toMatchObject({ status: 410 });
    expect(state.folderShares).toHaveLength(0);
  });

  it("acceptShareInvite rejeita aceitar duas vezes (uso único)", async () => {
    const { store, state } = createStore({
      users: baseUsers,
      folders: [folder],
      shareInvites: [
        {
          id: "inv-1",
          token: "tok-1",
          resource_type: "folder",
          resource_id: "folder-1",
          email: null,
          role: "viewer",
          invited_by_user_id: "owner-1",
          accepted_by_user_id: null,
          accepted_at: null,
          expires_at: "2026-03-16T12:00:00.000Z",
          created_at: "2026-03-09T11:00:00.000Z",
        },
      ],
    });

    await store.acceptShareInvite("tok-1", "guest-1");
    await expect(
      store.acceptShareInvite("tok-1", "stranger-1"),
    ).rejects.toMatchObject({ status: 409 });
    // só a primeira virou share
    expect(state.folderShares).toHaveLength(1);
    expect(state.folderShares[0]?.user_id).toBe("guest-1");
  });

  it("acceptShareInvite pelo próprio dono é no-op amigável (não cria share)", async () => {
    const { store, state } = createStore({
      users: baseUsers,
      folders: [folder],
      shareInvites: [
        {
          id: "inv-1",
          token: "tok-1",
          resource_type: "folder",
          resource_id: "folder-1",
          email: null,
          role: "editor",
          invited_by_user_id: "owner-1",
          accepted_by_user_id: null,
          accepted_at: null,
          expires_at: "2026-03-16T12:00:00.000Z",
          created_at: "2026-03-09T11:00:00.000Z",
        },
      ],
    });

    const result = await store.acceptShareInvite("tok-1", "owner-1");
    expect(result).toEqual({ resourceType: "folder", resourceId: "folder-1" });
    // dono já tem acesso => nenhuma share criada
    expect(state.folderShares).toHaveLength(0);
    // mas o convite é consumido (marcado aceito)
    expect(state.shareInvites[0]?.accepted_by_user_id).toBe("owner-1");
  });

  it("revokeShareInvite apaga validando ownership; não-dono => 404", async () => {
    const { store, state } = createStore({
      users: baseUsers,
      folders: [folder],
      shareInvites: [
        {
          id: "inv-1",
          token: "tok-1",
          resource_type: "folder",
          resource_id: "folder-1",
          email: null,
          role: "viewer",
          invited_by_user_id: "owner-1",
          accepted_by_user_id: null,
          accepted_at: null,
          expires_at: "2026-03-16T12:00:00.000Z",
          created_at: "2026-03-09T11:00:00.000Z",
        },
      ],
    });

    // não-dono não revoga
    await expect(
      store.revokeShareInvite("guest-1", "inv-1"),
    ).rejects.toMatchObject({ status: 404 });
    expect(state.shareInvites).toHaveLength(1);

    // dono revoga
    await store.revokeShareInvite("owner-1", "inv-1");
    expect(state.shareInvites).toHaveLength(0);
  });

  it("convite de híbrido: cria, resolve com título do doc-root e aceita", async () => {
    const restore = stubInviteRandomness(
      "00000000-0000-0000-0000-0000000000d1",
    );
    const { store, state } = createStore({
      users: baseUsers,
      items: [
        {
          id: "doc-1",
          owner_id: "owner-1",
          folder_id: null,
          kind: "doc",
          title: "Documento Híbrido",
          content_blob_key: "users/owner-1/items/doc-1/current.md",
          archived_at: null,
          collaboration_room_key: null,
          collaboration_enabled_at: null,
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
      hybridItems: [
        {
          id: "hybrid-1",
          owner_id: "owner-1",
          doc_item_id: "doc-1",
          drawing_item_id: "draw-1",
          default_view: "both",
          created_at: "2026-03-09T10:00:00.000Z",
          updated_at: "2026-03-09T10:00:00.000Z",
        },
      ],
    });

    const invite = await store.createShareInvite({
      resourceType: "hybrid",
      resourceId: "hybrid-1",
      email: null,
      role: "viewer",
      invitedByUserId: "owner-1",
    });
    expect(invite.resourceType).toBe("hybrid");

    const meta = await store.resolveShareInvite(invite.token);
    expect(meta).toMatchObject({
      resourceType: "hybrid",
      resourceId: "hybrid-1",
      resourceName: "Documento Híbrido",
      invitedByName: "Octo Cat",
      role: "viewer",
    });

    const result = await store.acceptShareInvite(invite.token, "guest-1");
    expect(result).toEqual({ resourceType: "hybrid", resourceId: "hybrid-1" });
    expect(state.hybridShares).toHaveLength(1);
    expect(state.hybridShares[0]).toMatchObject({
      hybrid_id: "hybrid-1",
      user_id: "guest-1",
      role: "viewer",
      granted_by_user_id: "owner-1",
    });

    restore();
  });
});
