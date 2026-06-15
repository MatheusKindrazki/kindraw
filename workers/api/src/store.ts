import type {
  ApiTokenPublic,
  ApiTokenSecret,
  AuthContext,
  CreateApiTokenInput,
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
  KindrawShareLinkAccess,
  KindrawShareRole,
  KindrawFolderShare,
  KindrawHybridShare,
  KindrawAcceptInviteResult,
  KindrawInviteMetadata,
  KindrawPendingInvite,
  KindrawShareInviteResourceType,
  KindrawUser,
  KindrawTreeResponse,
  PatchFolderInput,
  PatchHybridItemMetaInput,
  PatchItemMetaInput,
  R2Bucket,
  ShareInviteRecord,
  ShareLinkRecord,
} from "./types";

type UserRow = {
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

type SessionRow = {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
  last_seen_at: string;
};

type ApiTokenRow = {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  scope: string;
  created_at: string;
  expires_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
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
  // coluna adicionada em 0009 (DEFAULT 'read'); null em rows legados em memória.
  access?: KindrawShareLinkAccess | null;
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

type FolderShareRow = {
  id: string;
  folder_id: string;
  user_id: string;
  role: KindrawShareRole;
  granted_by_user_id: string;
  created_at: string;
  updated_at: string;
};

type HybridShareRow = {
  id: string;
  hybrid_id: string;
  user_id: string;
  role: KindrawShareRole;
  granted_by_user_id: string;
  created_at: string;
  updated_at: string;
};

type ShareInviteRow = {
  id: string;
  token: string;
  resource_type: KindrawShareInviteResourceType;
  resource_id: string;
  email: string | null;
  role: KindrawShareRole;
  invited_by_user_id: string;
  accepted_by_user_id: string | null;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
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
  access: row.access === "live-edit" ? "live-edit" : "read",
});

const toKindrawShareLink = (row: ShareLinkRow): KindrawShareLink => ({
  id: row.id,
  token: row.token,
  createdAt: row.created_at,
  revokedAt: row.revoked_at,
  access: row.access === "live-edit" ? "live-edit" : "read",
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

const toShareInvite = (row: ShareInviteRow): ShareInviteRecord => ({
  id: row.id,
  token: row.token,
  resourceType: row.resource_type,
  resourceId: row.resource_id,
  email: row.email,
  role: row.role,
  invitedByUserId: row.invited_by_user_id,
  acceptedByUserId: row.accepted_by_user_id,
  acceptedAt: row.accepted_at,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
});

const toPendingInvite = (row: ShareInviteRow): KindrawPendingInvite => ({
  id: row.id,
  email: row.email,
  role: row.role,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  link: `/invite/${row.token}`,
  status: "pending",
});

// Janela de validade de um convite: 7 dias a partir da criação.
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const isoNow = () => new Date().toISOString();

const toKindrawUser = (row: {
  id: string;
  github_login: string | null;
  name: string;
  avatar_url: string | null;
}): KindrawUser => ({
  id: row.id,
  githubLogin: row.github_login,
  name: row.name,
  avatarUrl: row.avatar_url,
  // Email is only surfaced for the authenticated self (the session payload).
  // Directory/share/token contexts don't expose it, so it's null here.
  email: null,
});

// Escapa os wildcards do LIKE (%, _) e o próprio caractere de escape, para que
// uma busca por "100%" não vire um match-tudo. Pareado com `ESCAPE '\\'` na SQL.
const escapeLike = (value: string) =>
  value.replace(/[\\%_]/g, (char) => `\\${char}`);

const base64UrlEncode = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const sha256Hex = async (input: string): Promise<string> => {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

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
        access: shareLink.access ?? "read",
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

  // Upsert a user identified by an OAuth provider, linking accounts by verified
  // email. Resolution order:
  //   1. Match the provider id (github_id / google_sub) -> same account.
  //   2. Else, if we have a *verified* email, match it -> link this provider to
  //      the existing account (the GitHub user and Google user are the same
  //      person).
  //   3. Else create a new account.
  // SECURITY: only pass `email` when the provider asserts it is verified.
  // Linking on an unverified email would let an attacker take over an account
  // by signing up to the other provider with someone else's address.
  async upsertOAuthUser(input: {
    provider: "github" | "google";
    providerId: string;
    email: string | null;
    name: string;
    avatarUrl: string | null;
    // Only meaningful for GitHub; preserved/updated on the account.
    githubLogin?: string | null;
  }): Promise<UserRow> {
    const now = isoNow();
    const providerColumn =
      input.provider === "github" ? "github_id" : "google_sub";

    // 1. Existing account for this exact provider identity.
    let existing = await this.db
      .prepare(`SELECT * FROM users WHERE ${providerColumn} = ?`)
      .bind(input.providerId)
      .first<UserRow>();

    // 2. No provider match: try to link by verified email.
    if (!existing && input.email) {
      existing = await this.db
        .prepare("SELECT * FROM users WHERE email = ?")
        .bind(input.email)
        .first<UserRow>();
    }

    if (existing) {
      // Merge: set this provider's id (links the account on first cross-login),
      // backfill email if missing, keep github_login when GitHub, refresh
      // profile. We never clear an existing email with a null.
      const githubId =
        input.provider === "github" ? input.providerId : existing.github_id;
      const googleSub =
        input.provider === "google" ? input.providerId : existing.google_sub;
      const githubLogin =
        input.provider === "github"
          ? input.githubLogin ?? existing.github_login
          : existing.github_login;
      // Backfill email only when this account has none yet AND no *other*
      // account already owns it. Without this guard, a GitHub re-login that
      // newly exposes a verified email already held by a separate account
      // would violate users_email_idx and 500 the login. We keep the existing
      // email otherwise (never clear it with a null).
      let email = existing.email;
      if (!email && input.email) {
        const emailOwner = await this.db
          .prepare("SELECT id FROM users WHERE email = ? AND id != ?")
          .bind(input.email, existing.id)
          .first<{ id: string }>();
        if (!emailOwner) {
          email = input.email;
        }
      }

      await this.db
        .prepare(
          `UPDATE users
           SET github_id = ?, google_sub = ?, email = ?, github_login = ?,
               name = ?, avatar_url = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(
          githubId,
          googleSub,
          email,
          githubLogin,
          input.name,
          input.avatarUrl,
          now,
          existing.id,
        )
        .run();

      return {
        ...existing,
        github_id: githubId,
        google_sub: googleSub,
        email,
        github_login: githubLogin,
        name: input.name,
        avatar_url: input.avatarUrl,
        updated_at: now,
      };
    }

    // 3. Brand-new account.
    const id = crypto.randomUUID();
    const githubId = input.provider === "github" ? input.providerId : null;
    const googleSub = input.provider === "google" ? input.providerId : null;
    const githubLogin =
      input.provider === "github" ? input.githubLogin ?? null : null;

    await this.db
      .prepare(
        `INSERT INTO users (id, github_id, google_sub, email, github_login, name, avatar_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        githubId,
        googleSub,
        input.email,
        githubLogin,
        input.name,
        input.avatarUrl,
        now,
        now,
      )
      .run();

    return {
      id,
      github_id: githubId,
      google_sub: googleSub,
      email: input.email,
      github_login: githubLogin,
      name: input.name,
      avatar_url: input.avatarUrl,
      created_at: now,
      updated_at: now,
    };
  }

  // Back-compat wrapper. Existing callers (and the CLI flow) keep working; new
  // code can call upsertOAuthUser directly.
  async upsertGithubUser(input: {
    githubId: string;
    githubLogin: string;
    name: string;
    avatarUrl: string | null;
    email?: string | null;
  }) {
    return this.upsertOAuthUser({
      provider: "github",
      providerId: input.githubId,
      email: input.email ?? null,
      name: input.name,
      avatarUrl: input.avatarUrl,
      githubLogin: input.githubLogin,
    });
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
           users.email,
           users.name,
           users.avatar_url
         FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.id = ?`,
      )
      .bind(sessionId)
      .first<
        SessionRow & {
          github_login: string | null;
          email: string | null;
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
        email: row.email,
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

  // --- API tokens (Personal Access Tokens) ----------------------------------
  // The raw secret is shown to the user exactly once; we persist only its
  // SHA-256 hash as the row id. Mirrors the session model above.

  async createApiToken(
    userId: string,
    input: CreateApiTokenInput,
  ): Promise<ApiTokenSecret> {
    const name = input.name.trim() || "API token";
    // 32 random bytes, base64url — ~256 bits of entropy (not randomUUID).
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const random = base64UrlEncode(bytes);
    const secret = `kdr_${random}`;
    const id = await sha256Hex(secret);
    const prefix = `kdr_${random.slice(0, 8)}`;
    const now = isoNow();
    const expiresAt =
      input.expiresInDays && input.expiresInDays > 0
        ? new Date(
            Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000,
          ).toISOString()
        : null;

    await this.db
      .prepare(
        `INSERT INTO api_tokens
           (id, user_id, name, prefix, scope, created_at, expires_at, last_seen_at, revoked_at)
         VALUES (?, ?, ?, ?, 'full', ?, ?, NULL, NULL)`,
      )
      .bind(id, userId, name, prefix, now, expiresAt)
      .run();

    return {
      secret,
      token: {
        prefix,
        name,
        scope: "full",
        createdAt: now,
        expiresAt,
        lastSeenAt: null,
      },
    };
  }

  async resolveApiToken(secret: string): Promise<AuthContext | null> {
    if (!secret || !secret.startsWith("kdr_")) {
      return null;
    }
    const id = await sha256Hex(secret);
    const row = await this.db
      .prepare(
        `SELECT
           api_tokens.id,
           api_tokens.user_id,
           api_tokens.name,
           api_tokens.prefix,
           api_tokens.scope,
           api_tokens.created_at,
           api_tokens.expires_at,
           api_tokens.last_seen_at,
           api_tokens.revoked_at,
           users.github_login,
           users.name AS user_name,
           users.avatar_url
         FROM api_tokens
         JOIN users ON users.id = api_tokens.user_id
         WHERE api_tokens.id = ?`,
      )
      .bind(id)
      .first<
        ApiTokenRow & {
          github_login: string | null;
          user_name: string;
          avatar_url: string | null;
        }
      >();

    if (!row) {
      return null;
    }
    if (row.revoked_at) {
      return null;
    }
    if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
      return null;
    }

    const now = isoNow();
    // Throttle last_seen writes to at most ~1/min to avoid a D1 write per call.
    if (
      !row.last_seen_at ||
      Date.now() - new Date(row.last_seen_at).getTime() > 60_000
    ) {
      await this.db
        .prepare("UPDATE api_tokens SET last_seen_at = ? WHERE id = ?")
        .bind(now, row.id)
        .run();
    }

    return {
      user: {
        id: row.user_id,
        githubLogin: row.github_login,
        name: row.user_name,
        avatarUrl: row.avatar_url,
        email: null,
      },
      apiToken: {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        prefix: row.prefix,
        scope: row.scope,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        lastSeenAt: now,
        revokedAt: null,
      },
    };
  }

  async listApiTokens(userId: string): Promise<ApiTokenPublic[]> {
    const { results } = await this.db
      .prepare(
        `SELECT prefix, name, scope, created_at, expires_at, last_seen_at
         FROM api_tokens
         WHERE user_id = ? AND revoked_at IS NULL
         ORDER BY created_at DESC`,
      )
      .bind(userId)
      .all<{
        prefix: string;
        name: string;
        scope: string;
        created_at: string;
        expires_at: string | null;
        last_seen_at: string | null;
      }>();

    return results.map((row) => ({
      prefix: row.prefix,
      name: row.name,
      scope: row.scope,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lastSeenAt: row.last_seen_at,
    }));
  }

  // One-time CLI authorization codes (OAuth loopback). The raw code is shown to
  // the loopback callback once; only its hash is stored, single-use, 60s TTL.
  async createCliAuthCode(
    userId: string,
    tokenName: string,
  ): Promise<{ code: string }> {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const code = base64UrlEncode(bytes);
    const id = await sha256Hex(code);
    const now = isoNow();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    await this.db
      .prepare(
        `INSERT INTO cli_auth_codes (id, user_id, token_name, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, userId, tokenName || "kindraw CLI", now, expiresAt)
      .run();
    return { code };
  }

  // Atomically consume a CLI auth code: returns the bound user + mints a PAT,
  // then deletes the code so it can never be reused.
  async exchangeCliAuthCode(code: string): Promise<ApiTokenSecret | null> {
    if (!code) {
      return null;
    }
    const id = await sha256Hex(code);
    const row = await this.db
      .prepare(
        `SELECT user_id, token_name, expires_at FROM cli_auth_codes WHERE id = ?`,
      )
      .bind(id)
      .first<{ user_id: string; token_name: string; expires_at: string }>();

    // Always delete (consume) regardless of validity to prevent replay.
    await this.db
      .prepare("DELETE FROM cli_auth_codes WHERE id = ?")
      .bind(id)
      .run();

    if (!row) {
      return null;
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return null;
    }
    return this.createApiToken(row.user_id, { name: row.token_name });
  }

  async revokeApiToken(userId: string, prefix: string): Promise<boolean> {
    const now = isoNow();
    const result = await this.db
      .prepare(
        `UPDATE api_tokens SET revoked_at = ?
         WHERE user_id = ? AND prefix = ? AND revoked_at IS NULL`,
      )
      .bind(now, userId, prefix)
      .run();
    // D1 run() returns meta.changes
    return (result as { meta?: { changes?: number } }).meta?.changes
      ? true
      : false;
  }

  async getTree(ownerId: string): Promise<KindrawTreeResponse> {
    const [
      { results: folderRows },
      { results: itemRows },
      { results: shareRows },
      { results: hybridRows },
      { results: incomingShareRows },
      { results: incomingHybridShareRows },
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
      // Pastas compartilhadas COM este usuário (ele é o destinatário do share),
      // junto com os dados do dono original da pasta.
      this.db
        .prepare(
          `SELECT
             folder_shares.role AS share_role,
             folders.id AS folder_id,
             folders.owner_id AS folder_owner_id,
             folders.parent_id AS folder_parent_id,
             folders.name AS folder_name,
             folders.created_at AS folder_created_at,
             folders.updated_at AS folder_updated_at,
             owner.github_login AS owner_login,
             owner.name AS owner_name
           FROM folder_shares
           JOIN folders ON folders.id = folder_shares.folder_id
           JOIN users AS owner ON owner.id = folders.owner_id
           WHERE folder_shares.user_id = ?
           ORDER BY folders.name COLLATE NOCASE ASC, folders.created_at ASC`,
        )
        .bind(ownerId)
        .all<{
          share_role: KindrawShareRole;
          folder_id: string;
          folder_owner_id: string;
          folder_parent_id: string | null;
          folder_name: string;
          folder_created_at: string;
          folder_updated_at: string;
          owner_login: string;
          owner_name: string;
        }>(),
      // Híbridos compartilhados DIRETAMENTE com este usuário (hybrid_shares),
      // independente de pasta. Traz a linha do hybrid_items + o doc-root (para
      // título/folder/share-links) e o papel concedido.
      this.db
        .prepare(
          `SELECT
             hybrid_shares.role AS share_role,
             hybrid_items.id AS hybrid_id,
             hybrid_items.owner_id AS hybrid_owner_id,
             hybrid_items.doc_item_id AS doc_item_id,
             hybrid_items.drawing_item_id AS drawing_item_id,
             hybrid_items.default_view AS default_view,
             hybrid_items.created_at AS hybrid_created_at,
             hybrid_items.updated_at AS hybrid_updated_at
           FROM hybrid_shares
           JOIN hybrid_items ON hybrid_items.id = hybrid_shares.hybrid_id
           WHERE hybrid_shares.user_id = ?
           ORDER BY hybrid_items.updated_at DESC, hybrid_items.created_at DESC`,
        )
        .bind(ownerId)
        .all<{
          share_role: KindrawShareRole;
          hybrid_id: string;
          hybrid_owner_id: string;
          doc_item_id: string;
          drawing_item_id: string;
          default_view: KindrawHybridView;
          hybrid_created_at: string;
          hybrid_updated_at: string;
        }>(),
    ]);

    // Map de pasta-compartilhada-comigo -> papel + dono. As pastas próprias
    // (folder.owner_id === ownerId) nunca entram aqui — o grant bloqueia
    // self-share, mas dedupamos por garantia abaixo.
    const sharedFolders = new Map<
      string,
      {
        role: KindrawShareRole;
        ownerId: string;
        ownerLogin: string;
        ownerName: string;
      }
    >();
    for (const row of incomingShareRows) {
      if (row.folder_owner_id === ownerId) {
        continue; // dedupe defensivo: dono não recebe share da própria pasta
      }
      sharedFolders.set(row.folder_id, {
        role: row.share_role,
        ownerId: row.folder_owner_id,
        ownerLogin: row.owner_login,
        ownerName: row.owner_name,
      });
    }

    // Itens que vivem DIRETAMENTE numa pasta compartilhada comigo (de qualquer
    // dono). Não descemos em subpastas: compartilhar uma pasta dá acesso só aos
    // itens com folder_id == aquela pasta (limitação documentada).
    let sharedItemRows: ItemRow[] = [];
    let sharedShareRows: ShareLinkRow[] = [];
    let sharedHybridRows: HybridItemRow[] = [];
    const sharedFolderIds = [...sharedFolders.keys()];
    if (sharedFolderIds.length) {
      const placeholders = sharedFolderIds.map(() => "?").join(", ");
      const [itemsResult, sharesResult, hybridResult] = await Promise.all([
        this.db
          .prepare(
            `SELECT * FROM items
               WHERE folder_id IN (${placeholders})
               ORDER BY title COLLATE NOCASE ASC, created_at ASC`,
          )
          .bind(...sharedFolderIds)
          .all<ItemRow>(),
        this.db
          .prepare(
            `SELECT share_links.*
               FROM share_links
               JOIN items ON items.id = share_links.item_id
               WHERE items.folder_id IN (${placeholders})
                 AND share_links.revoked_at IS NULL
               ORDER BY share_links.created_at DESC`,
          )
          .bind(...sharedFolderIds)
          .all<ShareLinkRow>(),
        // Hybrids cujo doc-root vive numa pasta compartilhada. O folder_id do
        // par mora nos itens (doc/drawing), então cruzamos via doc_item_id.
        this.db
          .prepare(
            `SELECT hybrid_items.*
               FROM hybrid_items
               JOIN items AS doc ON doc.id = hybrid_items.doc_item_id
               WHERE doc.folder_id IN (${placeholders})
               ORDER BY hybrid_items.updated_at DESC, hybrid_items.created_at DESC`,
          )
          .bind(...sharedFolderIds)
          .all<HybridItemRow>(),
      ]);
      sharedItemRows = itemsResult.results;
      sharedShareRows = sharesResult.results;
      sharedHybridRows = hybridResult.results;
    }

    // Conjunto combinado, deduplicando por id (um item próprio nunca também é
    // "compartilhado comigo", mas mantemos a regra explícita).
    const ownItemIds = new Set(itemRows.map((row) => row.id));
    const combinedItemRows = [
      ...itemRows,
      ...sharedItemRows.filter((row) => !ownItemIds.has(row.id)),
    ];
    const ownHybridIds = new Set(hybridRows.map((row) => row.id));
    const combinedHybridRows = [
      ...hybridRows,
      ...sharedHybridRows.filter((row) => !ownHybridIds.has(row.id)),
    ];

    const shareMap = groupShareLinks(
      [...shareRows, ...sharedShareRows].map(toShareLink),
    );
    const hybridByDocId = new Map(
      combinedHybridRows.map((row) => [row.doc_item_id, row] as const),
    );
    const hybridByDrawingId = new Map(
      combinedHybridRows.map((row) => [row.drawing_item_id, row] as const),
    );
    const itemById = new Map(
      combinedItemRows.map((row) => [row.id, row] as const),
    );
    const collapsedItemIds = new Set<string>();
    const treeItems: KindrawTreeResponse["items"] = [];

    // Papel de compartilhamento de um item = papel da pasta compartilhada onde
    // ele vive. Itens fora de pasta compartilhada (própria) => undefined.
    const sharedRoleForItem = (row: ItemRow): KindrawShareRole | undefined =>
      row.folder_id ? sharedFolders.get(row.folder_id)?.role : undefined;

    for (const row of combinedItemRows) {
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
          const hybridItem = toHybridItem(
            hybridRow,
            docRow,
            shareMap.get(hybridRow.doc_item_id) || [],
          );
          const sharedRole = sharedRoleForItem(docRow);
          if (sharedRole) {
            hybridItem.sharedRole = sharedRole;
          }
          treeItems.push(hybridItem);
          collapsedItemIds.add(docRow.id);
          collapsedItemIds.add(drawingRow.id);
          continue;
        }
      }

      const item = toItem(row, shareMap.get(row.id) || []);
      const sharedRole = sharedRoleForItem(row);
      if (sharedRole) {
        item.sharedRole = sharedRole;
      }
      treeItems.push(item);
    }

    // Híbridos compartilhados DIRETAMENTE comigo (via hybrid_shares), que não
    // vieram pela rota de pasta compartilhada acima. Buscamos os doc-rows (para
    // título/share-links) e adicionamos como entradas de árvore com sharedRole.
    const alreadyInTree = new Set(
      treeItems
        .filter((entry): entry is KindrawHybridItem => entry.kind === "hybrid")
        .map((entry) => entry.id),
    );
    const directHybridRows = incomingHybridShareRows.filter(
      (row) =>
        row.hybrid_owner_id !== ownerId && !alreadyInTree.has(row.hybrid_id),
    );
    if (directHybridRows.length) {
      const docIds = directHybridRows.map((row) => row.doc_item_id);
      const placeholders = docIds.map(() => "?").join(", ");
      const [{ results: directDocRows }, { results: directShareRows }] =
        await Promise.all([
          this.db
            .prepare(`SELECT * FROM items WHERE id IN (${placeholders})`)
            .bind(...docIds)
            .all<ItemRow>(),
          this.db
            .prepare(
              `SELECT share_links.*
                 FROM share_links
                 WHERE share_links.item_id IN (${placeholders})
                   AND share_links.revoked_at IS NULL
                 ORDER BY share_links.created_at DESC`,
            )
            .bind(...docIds)
            .all<ShareLinkRow>(),
        ]);

      const directDocById = new Map(
        directDocRows.map((row) => [row.id, row] as const),
      );
      const directShareMap = groupShareLinks(directShareRows.map(toShareLink));

      for (const row of directHybridRows) {
        const docRow = directDocById.get(row.doc_item_id);
        if (!docRow) {
          continue;
        }
        const hybridItem = toHybridItem(
          {
            id: row.hybrid_id,
            owner_id: row.hybrid_owner_id,
            doc_item_id: row.doc_item_id,
            drawing_item_id: row.drawing_item_id,
            default_view: row.default_view,
            created_at: row.hybrid_created_at,
            updated_at: row.hybrid_updated_at,
          },
          docRow,
          directShareMap.get(row.doc_item_id) || [],
        );
        hybridItem.sharedRole = row.share_role;
        // Híbrido compartilhado não pertence a nenhuma pasta minha → raiz.
        hybridItem.folderId = null;
        treeItems.push(hybridItem);
      }
    }

    const folders: KindrawTreeResponse["folders"] = folderRows.map((row) => {
      const folder = toFolder(row);
      return {
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
      };
    });

    // Pastas compartilhadas comigo aparecem na árvore como raízes (parentId
    // null, já que a hierarquia original do dono não é minha), marcadas com
    // metadados `shared`.
    for (const [folderId, meta] of sharedFolders) {
      const row = incomingShareRows.find(
        (entry) => entry.folder_id === folderId,
      );
      if (!row) {
        continue;
      }
      folders.push({
        id: row.folder_id,
        name: row.folder_name,
        parentId: null,
        createdAt: row.folder_created_at,
        updatedAt: row.folder_updated_at,
        shared: {
          role: meta.role,
          ownerId: meta.ownerId,
          ownerLogin: meta.ownerLogin,
          ownerName: meta.ownerName,
        },
      });
    }

    return {
      folders,
      items: treeItems,
    };
  }

  // --- Folder sharing (convite por @login do GitHub) ------------------------

  // Busca usuários por github_login ou name (LIKE case-insensitive), excluindo
  // o próprio usuário. Só expõe os 4 campos públicos (KindrawUser).
  async searchUsers(
    query: string,
    excludeUserId: string,
    limit = 8,
  ): Promise<KindrawUser[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }
    const safeLimit = Math.max(1, Math.min(limit, 50));
    const pattern = `%${escapeLike(trimmed)}%`;
    // Also match on email so Google-only accounts (github_login NULL) are
    // findable by the email-derived handle the UI shows for them.
    const { results } = await this.db
      .prepare(
        `SELECT id, github_login, name, avatar_url
           FROM users
           WHERE id != ?
             AND (github_login LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')
           ORDER BY github_login COLLATE NOCASE ASC
           LIMIT ?`,
      )
      .bind(excludeUserId, pattern, pattern, pattern, safeLimit)
      .all<{
        id: string;
        github_login: string | null;
        name: string;
        avatar_url: string | null;
      }>();

    return results.map(toKindrawUser);
  }

  // Resolve um handle para o usuário, ou null. Aceita um @github_login exato
  // (case-insensitive) OU um email completo OU a parte local do email (o
  // "handle" que a UI mostra para contas só-Google, ex.: "alice" de
  // "alice@x.com").
  async getUserByLogin(login: string): Promise<KindrawUser | null> {
    const trimmed = login.trim();
    if (!trimmed) {
      return null;
    }
    const emailLocalPattern = `${escapeLike(trimmed)}@%`;
    const row = await this.db
      .prepare(
        `SELECT id, github_login, name, avatar_url
           FROM users
           WHERE github_login = ? COLLATE NOCASE
              OR email = ? COLLATE NOCASE
              OR email LIKE ? ESCAPE '\\' COLLATE NOCASE
           LIMIT 1`,
      )
      .bind(trimmed, trimmed, emailLocalPattern)
      .first<{
        id: string;
        github_login: string | null;
        name: string;
        avatar_url: string | null;
      }>();

    return row ? toKindrawUser(row) : null;
  }

  // Concede (ou atualiza) acesso de targetUserId à pasta de ownerId.
  // UPSERT por (folder_id, user_id): se já existe, atualiza role + updated_at.
  async grantFolderAccess(
    ownerId: string,
    folderId: string,
    targetUserId: string,
    role: KindrawShareRole,
  ): Promise<KindrawFolderShare> {
    await this.requireFolder(ownerId, folderId);

    if (targetUserId === ownerId) {
      throw new HttpError(400, "You cannot share a folder with yourself.");
    }
    if (role !== "viewer" && role !== "editor") {
      throw new HttpError(400, "Invalid role.");
    }

    const now = isoNow();
    const existing = await this.db
      .prepare(
        "SELECT * FROM folder_shares WHERE folder_id = ? AND user_id = ?",
      )
      .bind(folderId, targetUserId)
      .first<FolderShareRow>();

    if (existing) {
      await this.db
        .prepare(
          `UPDATE folder_shares
             SET role = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(role, now, existing.id)
        .run();
      return this.getFolderShareById(existing.id);
    }

    const shareId = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO folder_shares
           (id, folder_id, user_id, role, granted_by_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(shareId, folderId, targetUserId, role, ownerId, now, now)
      .run();

    return this.getFolderShareById(shareId);
  }

  async updateFolderAccessRole(
    ownerId: string,
    folderId: string,
    shareId: string,
    role: KindrawShareRole,
  ): Promise<KindrawFolderShare> {
    await this.requireFolder(ownerId, folderId);
    if (role !== "viewer" && role !== "editor") {
      throw new HttpError(400, "Invalid role.");
    }

    const result = await this.db
      .prepare(
        `UPDATE folder_shares
           SET role = ?, updated_at = ?
         WHERE id = ? AND folder_id = ?`,
      )
      .bind(role, isoNow(), shareId, folderId)
      .run();

    if (!(result as { meta?: { changes?: number } }).meta?.changes) {
      throw new HttpError(404, "Folder share not found.");
    }

    return this.getFolderShareById(shareId);
  }

  async revokeFolderAccess(
    ownerId: string,
    folderId: string,
    shareId: string,
  ): Promise<void> {
    await this.requireFolder(ownerId, folderId);
    const result = await this.db
      .prepare("DELETE FROM folder_shares WHERE id = ? AND folder_id = ?")
      .bind(shareId, folderId)
      .run();

    if (!(result as { meta?: { changes?: number } }).meta?.changes) {
      throw new HttpError(404, "Folder share not found.");
    }
  }

  // Lista todas as pessoas (não-donos) com acesso à pasta de ownerId.
  async listFolderShares(
    ownerId: string,
    folderId: string,
  ): Promise<KindrawFolderShare[]> {
    await this.requireFolder(ownerId, folderId);
    const { results } = await this.db
      .prepare(
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
         WHERE folder_shares.folder_id = ?
         ORDER BY folder_shares.created_at ASC`,
      )
      .bind(folderId)
      .all<{
        share_id: string;
        share_role: KindrawShareRole;
        share_created_at: string;
        user_id: string;
        github_login: string | null;
        user_name: string;
        avatar_url: string | null;
      }>();

    return results.map((row) => ({
      id: row.share_id,
      role: row.share_role,
      createdAt: row.share_created_at,
      user: {
        id: row.user_id,
        githubLogin: row.github_login,
        name: row.user_name,
        avatarUrl: row.avatar_url,
        email: null,
      },
    }));
  }

  private async getFolderShareById(
    shareId: string,
  ): Promise<KindrawFolderShare> {
    const row = await this.db
      .prepare(
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
      .bind(shareId)
      .first<{
        share_id: string;
        share_role: KindrawShareRole;
        share_created_at: string;
        user_id: string;
        github_login: string | null;
        user_name: string;
        avatar_url: string | null;
      }>();

    if (!row) {
      throw new HttpError(404, "Folder share not found.");
    }

    return {
      id: row.share_id,
      role: row.share_role,
      createdAt: row.share_created_at,
      user: {
        id: row.user_id,
        githubLogin: row.github_login,
        name: row.user_name,
        avatarUrl: row.avatar_url,
        email: null,
      },
    };
  }

  // --- Hybrid sharing (convite por @login do GitHub) ------------------------
  // Espelha o folder sharing acima, mas mira hybrid_items diretamente. Permite
  // compartilhar um documento híbrido com pessoas específicas (viewer/editor),
  // independente de pasta.

  async grantHybridAccess(
    ownerId: string,
    hybridId: string,
    targetUserId: string,
    role: KindrawShareRole,
  ): Promise<KindrawHybridShare> {
    await this.requireHybridItem(ownerId, hybridId);

    if (targetUserId === ownerId) {
      throw new HttpError(400, "You cannot share a hybrid with yourself.");
    }
    if (role !== "viewer" && role !== "editor") {
      throw new HttpError(400, "Invalid role.");
    }

    const now = isoNow();
    const existing = await this.db
      .prepare(
        "SELECT * FROM hybrid_shares WHERE hybrid_id = ? AND user_id = ?",
      )
      .bind(hybridId, targetUserId)
      .first<HybridShareRow>();

    if (existing) {
      await this.db
        .prepare(
          `UPDATE hybrid_shares
             SET role = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(role, now, existing.id)
        .run();
      return this.getHybridShareById(existing.id);
    }

    const shareId = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO hybrid_shares
           (id, hybrid_id, user_id, role, granted_by_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(shareId, hybridId, targetUserId, role, ownerId, now, now)
      .run();

    return this.getHybridShareById(shareId);
  }

  async updateHybridAccessRole(
    ownerId: string,
    hybridId: string,
    shareId: string,
    role: KindrawShareRole,
  ): Promise<KindrawHybridShare> {
    await this.requireHybridItem(ownerId, hybridId);
    if (role !== "viewer" && role !== "editor") {
      throw new HttpError(400, "Invalid role.");
    }

    const result = await this.db
      .prepare(
        `UPDATE hybrid_shares
           SET role = ?, updated_at = ?
         WHERE id = ? AND hybrid_id = ?`,
      )
      .bind(role, isoNow(), shareId, hybridId)
      .run();

    if (!(result as { meta?: { changes?: number } }).meta?.changes) {
      throw new HttpError(404, "Hybrid share not found.");
    }

    return this.getHybridShareById(shareId);
  }

  async revokeHybridAccess(
    ownerId: string,
    hybridId: string,
    shareId: string,
  ): Promise<void> {
    await this.requireHybridItem(ownerId, hybridId);
    const result = await this.db
      .prepare("DELETE FROM hybrid_shares WHERE id = ? AND hybrid_id = ?")
      .bind(shareId, hybridId)
      .run();

    if (!(result as { meta?: { changes?: number } }).meta?.changes) {
      throw new HttpError(404, "Hybrid share not found.");
    }
  }

  async listHybridShares(
    ownerId: string,
    hybridId: string,
  ): Promise<KindrawHybridShare[]> {
    await this.requireHybridItem(ownerId, hybridId);
    const { results } = await this.db
      .prepare(
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
         WHERE hybrid_shares.hybrid_id = ?
         ORDER BY hybrid_shares.created_at ASC`,
      )
      .bind(hybridId)
      .all<{
        share_id: string;
        share_role: KindrawShareRole;
        share_created_at: string;
        user_id: string;
        github_login: string | null;
        user_name: string;
        avatar_url: string | null;
      }>();

    return results.map((row) => ({
      id: row.share_id,
      role: row.share_role,
      createdAt: row.share_created_at,
      user: {
        id: row.user_id,
        githubLogin: row.github_login,
        name: row.user_name,
        avatarUrl: row.avatar_url,
        email: null,
      },
    }));
  }

  private async getHybridShareById(
    shareId: string,
  ): Promise<KindrawHybridShare> {
    const row = await this.db
      .prepare(
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
      .bind(shareId)
      .first<{
        share_id: string;
        share_role: KindrawShareRole;
        share_created_at: string;
        user_id: string;
        github_login: string | null;
        user_name: string;
        avatar_url: string | null;
      }>();

    if (!row) {
      throw new HttpError(404, "Hybrid share not found.");
    }

    return {
      id: row.share_id,
      role: row.share_role,
      createdAt: row.share_created_at,
      user: {
        id: row.user_id,
        githubLogin: row.github_login,
        name: row.user_name,
        avatarUrl: row.avatar_url,
        email: null,
      },
    };
  }

  // Papel efetivo de userId sobre um híbrido: 'owner' se é o dono, ou o role do
  // hybrid_share, ou null se nenhum vínculo direto existe. (Não considera acesso
  // herdado de pasta — isso é tratado separadamente no getTree.)
  async hybridAccessRole(
    userId: string,
    hybridId: string,
  ): Promise<"owner" | KindrawShareRole | null> {
    const hybrid = await this.db
      .prepare("SELECT owner_id FROM hybrid_items WHERE id = ?")
      .bind(hybridId)
      .first<{ owner_id: string }>();

    if (!hybrid) {
      return null;
    }
    if (hybrid.owner_id === userId) {
      return "owner";
    }

    const share = await this.db
      .prepare(
        "SELECT role FROM hybrid_shares WHERE hybrid_id = ? AND user_id = ?",
      )
      .bind(hybridId, userId)
      .first<{ role: KindrawShareRole }>();

    return share ? share.role : null;
  }

  // --- Convites por link (share_invites) ------------------------------------
  // Unifica pasta+híbrido num único mecanismo de token. O link É a credencial:
  // qualquer conta logada que abra e aceite ganha acesso. Token único, expira
  // em 7 dias, uso único. O aceite materializa uma share real
  // (folder_shares/hybrid_shares) reusando grantFolderAccess/grantHybridAccess.

  // Garante que `userId` é o DONO do recurso, ou 404 (mesma regra do share
  // atual: só o dono convida/lista/revoga).
  private async requireResourceOwner(
    ownerId: string,
    resourceType: KindrawShareInviteResourceType,
    resourceId: string,
  ): Promise<void> {
    if (resourceType === "folder") {
      await this.requireFolder(ownerId, resourceId);
      return;
    }
    await this.requireHybridItem(ownerId, resourceId);
  }

  async createShareInvite(input: {
    resourceType: KindrawShareInviteResourceType;
    resourceId: string;
    email: string | null;
    role: KindrawShareRole;
    invitedByUserId: string;
  }): Promise<ShareInviteRecord> {
    const { resourceType, resourceId, role, invitedByUserId } = input;
    if (resourceType !== "folder" && resourceType !== "hybrid") {
      throw new HttpError(400, "Invalid resource type.");
    }
    if (role !== "viewer" && role !== "editor") {
      throw new HttpError(400, "Invalid role.");
    }
    // Só o dono do recurso pode convidar (404 se não for dono/não existir).
    await this.requireResourceOwner(invitedByUserId, resourceType, resourceId);

    // E-mail é informativo (exibição): normalizado para lower, ou null.
    const email = input.email?.trim().toLowerCase() || null;

    // Token: 32 bytes aleatórios base64url (~256 bits), igual aos API tokens.
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = base64UrlEncode(bytes);

    const id = crypto.randomUUID();
    const now = isoNow();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

    await this.db
      .prepare(
        `INSERT INTO share_invites
           (id, token, resource_type, resource_id, email, role,
            invited_by_user_id, accepted_by_user_id, accepted_at,
            expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      )
      .bind(
        id,
        token,
        resourceType,
        resourceId,
        email,
        role,
        invitedByUserId,
        expiresAt,
        now,
      )
      .run();

    return {
      id,
      token,
      resourceType,
      resourceId,
      email,
      role,
      invitedByUserId,
      acceptedByUserId: null,
      acceptedAt: null,
      expiresAt,
      createdAt: now,
    };
  }

  // Convites PENDENTES (não aceitos e não expirados) de uma pasta. Valida que
  // ownerId é o dono.
  async listFolderInvites(
    ownerId: string,
    folderId: string,
  ): Promise<KindrawPendingInvite[]> {
    await this.requireFolder(ownerId, folderId);
    return this.listPendingInvites(ownerId, "folder", folderId);
  }

  // Espelho híbrido de listFolderInvites.
  async listHybridInvites(
    ownerId: string,
    hybridId: string,
  ): Promise<KindrawPendingInvite[]> {
    await this.requireHybridItem(ownerId, hybridId);
    return this.listPendingInvites(ownerId, "hybrid", hybridId);
  }

  private async listPendingInvites(
    ownerId: string,
    resourceType: KindrawShareInviteResourceType,
    resourceId: string,
  ): Promise<KindrawPendingInvite[]> {
    const now = isoNow();
    const { results } = await this.db
      .prepare(
        `SELECT * FROM share_invites
           WHERE resource_type = ?
             AND resource_id = ?
             AND invited_by_user_id = ?
             AND accepted_at IS NULL
             AND expires_at > ?
           ORDER BY created_at DESC`,
      )
      .bind(resourceType, resourceId, ownerId, now)
      .all<ShareInviteRow>();

    return results.map(toPendingInvite);
  }

  // Revoga (apaga) um convite pendente. Valida que ownerId é quem criou.
  async revokeShareInvite(ownerId: string, inviteId: string): Promise<void> {
    const result = await this.db
      .prepare(
        "DELETE FROM share_invites WHERE id = ? AND invited_by_user_id = ?",
      )
      .bind(inviteId, ownerId)
      .run();

    if (!(result as { meta?: { changes?: number } }).meta?.changes) {
      throw new HttpError(404, "Invite not found.");
    }
  }

  // Resolve um convite por token, retornando metadados do recurso (nome + dono)
  // para a página de convite. NÃO exige login. Rejeita token inexistente,
  // expirado, ou cujo recurso sumiu. Convite já aceito ainda resolve (a UI usa
  // `accepted` para mostrar "convite já utilizado").
  async resolveShareInvite(token: string): Promise<KindrawInviteMetadata> {
    const invite = await this.getInviteByToken(token);
    if (!invite) {
      throw new HttpError(404, "Invite not found.");
    }
    if (new Date(invite.expiresAt).getTime() <= Date.now()) {
      throw new HttpError(410, "This invite has expired.");
    }

    const resource = await this.loadInviteResource(invite);
    if (!resource) {
      throw new HttpError(404, "The shared resource no longer exists.");
    }

    return {
      resourceType: invite.resourceType,
      resourceId: invite.resourceId,
      resourceName: resource.name,
      role: invite.role,
      expiresAt: invite.expiresAt,
      invitedByName: resource.ownerName,
      accepted: invite.acceptedByUserId !== null,
    };
  }

  // Aceita um convite vivo: cria a share real (UPSERT) e marca accepted_*.
  // O dono aceitar o próprio convite é um no-op amigável (ele já tem acesso).
  async acceptShareInvite(
    token: string,
    acceptingUserId: string,
  ): Promise<KindrawAcceptInviteResult> {
    const invite = await this.getInviteByToken(token);
    if (!invite) {
      throw new HttpError(404, "Invite not found.");
    }
    if (invite.acceptedByUserId !== null) {
      throw new HttpError(409, "This invite has already been used.");
    }
    if (new Date(invite.expiresAt).getTime() <= Date.now()) {
      throw new HttpError(410, "This invite has expired.");
    }

    const resource = await this.loadInviteResource(invite);
    if (!resource) {
      throw new HttpError(404, "The shared resource no longer exists.");
    }

    const result: KindrawAcceptInviteResult = {
      resourceType: invite.resourceType,
      resourceId: invite.resourceId,
    };

    // Edge: o dono não pode "ganhar acesso" ao próprio recurso (self-share é
    // bloqueado no grant). Tratamos como no-op amigável: marca aceito e segue.
    if (resource.ownerId !== acceptingUserId) {
      if (invite.resourceType === "folder") {
        await this.grantFolderAccess(
          invite.invitedByUserId,
          invite.resourceId,
          acceptingUserId,
          invite.role,
        );
      } else {
        await this.grantHybridAccess(
          invite.invitedByUserId,
          invite.resourceId,
          acceptingUserId,
          invite.role,
        );
      }
    }

    await this.db
      .prepare(
        `UPDATE share_invites
           SET accepted_by_user_id = ?, accepted_at = ?
         WHERE id = ? AND accepted_at IS NULL`,
      )
      .bind(acceptingUserId, isoNow(), invite.id)
      .run();

    return result;
  }

  private async getInviteByToken(
    token: string,
  ): Promise<ShareInviteRecord | null> {
    const trimmed = (token || "").trim();
    if (!trimmed) {
      return null;
    }
    const row = await this.db
      .prepare("SELECT * FROM share_invites WHERE token = ?")
      .bind(trimmed)
      .first<ShareInviteRow>();
    return row ? toShareInvite(row) : null;
  }

  // Carrega nome do recurso + dono (id/nome) de um convite, ou null se o
  // recurso sumiu. Para pasta: folders.name. Para híbrido: título do doc-root.
  private async loadInviteResource(
    invite: ShareInviteRecord,
  ): Promise<{ name: string; ownerId: string; ownerName: string } | null> {
    if (invite.resourceType === "folder") {
      const row = await this.db
        .prepare(
          `SELECT folders.name AS name,
                  folders.owner_id AS owner_id,
                  owner.name AS owner_name
             FROM folders
             JOIN users AS owner ON owner.id = folders.owner_id
             WHERE folders.id = ?`,
        )
        .bind(invite.resourceId)
        .first<{ name: string; owner_id: string; owner_name: string }>();
      return row
        ? { name: row.name, ownerId: row.owner_id, ownerName: row.owner_name }
        : null;
    }

    const row = await this.db
      .prepare(
        `SELECT doc.title AS name,
                hybrid_items.owner_id AS owner_id,
                owner.name AS owner_name
           FROM hybrid_items
           JOIN items AS doc ON doc.id = hybrid_items.doc_item_id
           JOIN users AS owner ON owner.id = hybrid_items.owner_id
           WHERE hybrid_items.id = ?`,
      )
      .bind(invite.resourceId)
      .first<{ name: string; owner_id: string; owner_name: string }>();
    return row
      ? { name: row.name, ownerId: row.owner_id, ownerName: row.owner_name }
      : null;
  }

  // Carrega a linha do híbrido por id, sem filtrar por dono (autorização é
  // responsabilidade do chamador). Retorna null se não existe.
  private async getHybridRecordById(
    hybridId: string,
  ): Promise<HybridItemRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM hybrid_items WHERE id = ?")
      .bind(hybridId)
      .first<HybridItemRow>();
    return row ? toHybridItemRecord(row) : null;
  }

  // Papel efetivo derivado de uma PASTA compartilhada que contém o doc-root do
  // híbrido (acesso herdado). Retorna o role da pasta, ou null.
  private async hybridFolderAccessRole(
    userId: string,
    hybridId: string,
  ): Promise<KindrawShareRole | null> {
    const row = await this.db
      .prepare(
        `SELECT doc.folder_id AS folder_id
         FROM hybrid_items
         JOIN items AS doc ON doc.id = hybrid_items.doc_item_id
         WHERE hybrid_items.id = ?`,
      )
      .bind(hybridId)
      .first<{ folder_id: string | null }>();

    if (!row?.folder_id) {
      return null;
    }
    const role = await this.folderAccessRole(userId, row.folder_id);
    return role === "owner" ? null : role;
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

    // Permite criar dentro de uma pasta própria OU de uma pasta compartilhada
    // onde o usuário é editor. O item criado pertence a QUEM cria (owner_id =
    // ownerId), mas vive na pasta compartilhada (aparece p/ ambos via getTree).
    if (input.folderId) {
      await this.requireFolderWrite(ownerId, input.folderId);
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
      await this.requireFolderWrite(ownerId, input.folderId);
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

  /**
   * Converte um drawing já existente em documento híbrido: cria um item `doc`
   * vazio na mesma pasta e liga doc+drawing numa nova linha de hybrid_items,
   * preservando o canvas como está. Devolve os ids do híbrido criado.
   *
   * Rejeita: item que não é drawing, e drawing que já faz parte de um híbrido
   * (um drawing só pode pertencer a um híbrido por vez).
   */
  async convertDrawingToHybrid(
    ownerId: string,
    drawingItemId: string,
    input?: { title?: string },
  ) {
    // Precisa ser escrita: dono ou editor da pasta do drawing.
    const drawing = await this.requireItemWrite(ownerId, drawingItemId);

    if (drawing.kind !== "drawing") {
      throw new HttpError(400, "Only drawings can be converted to a hybrid.");
    }

    const existingHybrid = await this.findHybridRowByItemId(
      undefined,
      drawingItemId,
    );
    if (existingHybrid) {
      throw new HttpError(
        409,
        "This drawing is already part of a hybrid document.",
      );
    }

    const title = (input?.title || drawing.title).trim() || drawing.title;

    // O doc novo herda a pasta do drawing e pertence a quem converte.
    const docItemId = await this.createItem(ownerId, {
      kind: "doc",
      title,
      folderId: drawing.folderId ?? null,
      content: createInitialItemContent("doc", title),
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
    // Leitura aberta a dono OU a quem tem qualquer share (viewer/editor) na
    // pasta do item. requireItemRead retorna 404 para recursos sem relação.
    const item = await this.requireItemRead(ownerId, itemId);
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
    requesterId: string,
    hybridId: string,
  ): Promise<KindrawHybridItemResponse> {
    // Acesso permitido a quem tem QUALQUER papel no híbrido (dono, editor ou
    // viewer convidado — direto ou via pasta compartilhada). Os itens internos
    // (doc/drawing) pertencem ao dono real, então a leitura usa esse owner.
    const role = await this.hybridAccessRole(requesterId, hybridId);
    if (!role) {
      // Pode ser acesso herdado de pasta compartilhada (folder share). Cai no
      // requireHybridItem? Não — tentamos via leitura dos itens com o requester.
      // Se nem isso, 404.
      const sharedRole = await this.hybridFolderAccessRole(
        requesterId,
        hybridId,
      );
      if (!sharedRole) {
        throw new HttpError(404, "Hybrid item not found.");
      }
    }

    const hybrid = await this.getHybridRecordById(hybridId);
    if (!hybrid) {
      throw new HttpError(404, "Hybrid item not found.");
    }

    // Lê os itens com o OWNER REAL do híbrido (dono dos itens), já que a
    // autorização do requester já foi validada acima.
    const realOwnerId = hybrid.ownerId;
    const [document, drawing] = await Promise.all([
      this.getItem(realOwnerId, hybrid.docItemId),
      this.getItem(realOwnerId, hybrid.drawingItemId),
    ]);
    const docRow = await this.db
      .prepare("SELECT * FROM items WHERE id = ? AND owner_id = ?")
      .bind(hybrid.docItemId, realOwnerId)
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
    // Edição de metadados: dono do item OU editor da pasta que o contém.
    const item = await this.requireItemWrite(ownerId, itemId);
    // owner_id REAL do item (pode diferir de quem edita, quando é um editor de
    // pasta compartilhada). Os UPDATEs abaixo filtram por este owner real.
    const itemOwnerId = item.ownerId;
    const title =
      typeof input.title === "string" ? input.title.trim() : item.title;
    if (!title) {
      throw new HttpError(400, "Item title is required.");
    }

    const folderId =
      "folderId" in input ? input.folderId ?? null : item.folderId;
    // Mover PARA uma pasta: precisa de acesso de escrita ao destino (dono ou
    // editor). Mover para a raiz (null) é sempre permitido para quem já pode
    // editar o item.
    if (folderId) {
      await this.requireFolderWrite(ownerId, folderId);
    }

    const archivedAt =
      "archived" in input
        ? input.archived
          ? item.archivedAt || isoNow()
          : null
        : item.archivedAt;

    const hybridRow = await this.findHybridRowByItemId(undefined, itemId);
    const now = isoNow();

    await this.db
      .prepare(
        `UPDATE items
         SET title = ?, folder_id = ?, archived_at = ?, updated_at = ?
         WHERE id = ? AND owner_id = ?`,
      )
      .bind(title, folderId, archivedAt, now, itemId, itemOwnerId)
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
        .bind(title, folderId, now, companionItemId, itemOwnerId)
        .run(),
      this.db
        .prepare(
          `UPDATE hybrid_items
           SET updated_at = ?
           WHERE id = ? AND owner_id = ?`,
        )
        .bind(now, hybridRow.id, itemOwnerId)
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
    // Escrita de conteúdo: dono do item OU editor da pasta que o contém.
    const item = await this.requireItemWrite(ownerId, itemId);
    await this.blobs.put(item.contentBlobKey, content, {
      httpMetadata: {
        contentType: blobContentType(item.kind),
      },
    });

    // updated_at é atualizado pelo id do item (não filtramos por owner_id, pois
    // um editor de pasta compartilhada não é o dono — a autorização já passou).
    await this.db
      .prepare("UPDATE items SET updated_at = ? WHERE id = ?")
      .bind(isoNow(), itemId)
      .run();
  }

  // Maintenance: find the user's drawings whose stored scene has no visible
  // elements (the empty canvases left behind by the old "create on open" bug).
  // Read-only — never deletes. Skips drawings with share links or collab so we
  // never flag anything the user intentionally published.
  async listEmptyDrawings(ownerId: string) {
    const rows = await this.db
      .prepare(
        `SELECT i.* FROM items i
         WHERE i.owner_id = ?
           AND i.kind = 'drawing'
           AND i.archived_at IS NULL
           AND i.collaboration_room_key IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM share_links s WHERE s.item_id = i.id
           )
         ORDER BY i.created_at DESC`,
      )
      .bind(ownerId)
      .all<ItemRow>();

    const empty: Array<{
      id: string;
      title: string;
      createdAt: string;
      updatedAt: string;
    }> = [];

    for (const row of rows.results) {
      let visibleElements = -1;
      try {
        const content = await this.getContent(row.content_blob_key);
        const parsed = JSON.parse(content) as {
          elements?: Array<{ isDeleted?: boolean }>;
        };
        visibleElements = (parsed.elements || []).filter(
          (element) => !element.isDeleted,
        ).length;
      } catch {
        // Unreadable/missing content is treated as non-empty (skip) so we never
        // delete something we couldn't positively confirm is empty.
        continue;
      }

      if (visibleElements === 0) {
        empty.push({
          id: row.id,
          title: row.title,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
      }
    }

    return empty;
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

  async createHybridShareLink(
    ownerId: string,
    hybridId: string,
    access: KindrawShareLinkAccess = "read",
  ) {
    const hybrid = await this.requireHybridItem(ownerId, hybridId);
    // Link de edição ao vivo: garante a collab room do DRAWING (chave de cifra
    // do canal de canvas) para o convidado também ver/editar o canvas ao vivo.
    if (access === "live-edit") {
      await this.enableItemCollaboration(ownerId, hybrid.drawingItemId).catch(
        () => undefined,
      );
    }
    return this.createShareLink(ownerId, hybrid.docItemId, access);
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

  async createShareLink(
    ownerId: string,
    itemId: string,
    access: KindrawShareLinkAccess = "read",
  ) {
    await this.requireItem(ownerId, itemId);
    if (access !== "read" && access !== "live-edit") {
      throw new HttpError(400, "Invalid share link access.");
    }
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

      // Reusa o link ativo, mas alterna o modo de acesso para o pedido (permite
      // promover um link de leitura a edição-ao-vivo e vice-versa).
      await this.db
        .prepare("UPDATE share_links SET access = ? WHERE id = ?")
        .bind(access, currentLink.id)
        .run();

      return { ...toKindrawShareLink(currentLink), access };
    }

    const shareLinkId = crypto.randomUUID();
    const token = crypto.randomUUID().replace(/-/g, "");
    const createdAt = isoNow();

    await this.db
      .prepare(
        `INSERT INTO share_links (id, item_id, token, created_by_user_id, created_at, revoked_at, access)
         VALUES (?, ?, ?, ?, ?, NULL, ?)`,
      )
      .bind(shareLinkId, itemId, token, ownerId, createdAt, access)
      .run();

    return {
      id: shareLinkId,
      token,
      createdAt,
      revokedAt: null,
      access,
    };
  }

  // Resolve um token de link público para { hybridId, access } — usado pela
  // autorização do WebSocket de colaboração. Retorna null se o token é inválido,
  // revogado, ou não aponta para um híbrido.
  async resolveHybridShareLink(
    token: string,
  ): Promise<{ hybridId: string; access: KindrawShareLinkAccess } | null> {
    const row = await this.db
      .prepare(
        `SELECT share_links.item_id AS item_id, share_links.access AS access
         FROM share_links
         WHERE share_links.token = ? AND share_links.revoked_at IS NULL`,
      )
      .bind(token)
      .first<{ item_id: string; access: KindrawShareLinkAccess | null }>();

    if (!row) {
      return null;
    }

    const hybridRow = await this.findHybridRowByItemId(undefined, row.item_id);
    if (!hybridRow) {
      return null;
    }

    return {
      hybridId: hybridRow.id,
      access: row.access === "live-edit" ? "live-edit" : "read",
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
        `SELECT items.id, items.kind, items.title, items.updated_at, items.content_blob_key, share_links.access AS access
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
        access: KindrawShareLinkAccess | null;
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
          `SELECT id, kind, title, updated_at, content_blob_key, collaboration_room_key, collaboration_enabled_at
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
          collaboration_room_key: string | null;
          collaboration_enabled_at: string | null;
        }>();

      if (drawing) {
        // Para link live-edit: expõe a collab room do canvas (chave de cifra) p/
        // o convidado entrar no canal de canvas ao vivo. Só em live-edit.
        const canvasRoom =
          row.access === "live-edit" &&
          drawing.collaboration_enabled_at &&
          drawing.collaboration_room_key
            ? {
                roomId: drawing.id,
                roomKey: drawing.collaboration_room_key,
                enabledAt: drawing.collaboration_enabled_at,
              }
            : null;
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
            collaborationRoom: canvasRoom,
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
      access: row.access === "live-edit" ? "live-edit" : "read",
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

  // Papel efetivo de userId sobre a pasta (independente do dono): 'owner' se é
  // o dono, ou o role do folder_share, ou null se nenhum vínculo existe.
  private async folderAccessRole(
    userId: string,
    folderId: string,
  ): Promise<"owner" | KindrawShareRole | null> {
    const folder = await this.db
      .prepare("SELECT owner_id FROM folders WHERE id = ?")
      .bind(folderId)
      .first<{ owner_id: string }>();

    if (!folder) {
      return null;
    }
    if (folder.owner_id === userId) {
      return "owner";
    }

    const share = await this.db
      .prepare(
        "SELECT role FROM folder_shares WHERE folder_id = ? AND user_id = ?",
      )
      .bind(folderId, userId)
      .first<{ role: KindrawShareRole }>();

    return share ? share.role : null;
  }

  // Permite escrever na pasta se userId é dono OU editor (não viewer). Usado
  // antes de criar/mover um item PARA dentro de uma pasta.
  private async requireFolderWrite(userId: string, folderId: string) {
    const role = await this.folderAccessRole(userId, folderId);
    if (role === "owner" || role === "editor") {
      return;
    }
    // viewer ou sem vínculo => a pasta "não existe" para fins de escrita (404),
    // sem revelar a diferença entre não-autorizado e inexistente.
    throw new HttpError(404, "Folder not found.");
  }

  // Carrega um item para LEITURA permitindo: dono do item OU qualquer share
  // (viewer/editor) na pasta que o contém. Recursos sem relação => 404.
  private async requireItemRead(userId: string, itemId: string) {
    const row = await this.db
      .prepare("SELECT * FROM items WHERE id = ?")
      .bind(itemId)
      .first<ItemRow>();

    if (!row) {
      throw new HttpError(404, "Item not found.");
    }

    if (row.owner_id !== userId) {
      const role = row.folder_id
        ? await this.folderAccessRole(userId, row.folder_id)
        : null;
      // Apenas itens dentro de uma pasta compartilhada comigo são legíveis.
      if (role !== "viewer" && role !== "editor") {
        throw new HttpError(404, "Item not found.");
      }
    }

    return this.itemRecordFromRow(row);
  }

  // Carrega um item para ESCRITA permitindo: dono do item OU editor da pasta
  // que o contém. Viewer e sem-relação => 404.
  private async requireItemWrite(userId: string, itemId: string) {
    const row = await this.db
      .prepare("SELECT * FROM items WHERE id = ?")
      .bind(itemId)
      .first<ItemRow>();

    if (!row) {
      throw new HttpError(404, "Item not found.");
    }

    if (row.owner_id !== userId) {
      const role = row.folder_id
        ? await this.folderAccessRole(userId, row.folder_id)
        : null;
      if (role !== "editor") {
        throw new HttpError(404, "Item not found.");
      }
    }

    return this.itemRecordFromRow(row);
  }

  // Monta um ItemRecord (com hybrid link) a partir de uma row já carregada,
  // sem reaplicar o filtro de ownership (a autorização já foi feita acima).
  private async itemRecordFromRow(row: ItemRow) {
    const hybridRow = await this.findHybridRowByItemId(undefined, row.id);
    const hybrid =
      hybridRow && hybridRow.doc_item_id === row.id
        ? toHybridLink(hybridRow, "doc")
        : hybridRow
        ? toHybridLink(hybridRow, "drawing")
        : null;
    return toItemRecord(row, hybrid);
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
