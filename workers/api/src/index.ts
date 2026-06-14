import { createStore, HttpError } from "./store";
import { KindrawCollaborationRoom } from "./collab";
import {
  handleDiagramToCodeGenerate,
  handleTextToDiagramChatStreaming,
} from "./ai";
import { handleIconSearch, handleIconSvg } from "./icons";
import { handleTemplateList, handleTemplateById } from "./templates";
import { handleLibraryList, handleLibraryBlob } from "./libraries";

import type {
  CreateFolderInput,
  CreateHybridItemInput,
  CreateItemInput,
  Env,
  KindrawSession,
  KindrawTreeEntry,
  PatchFolderInput,
  PatchHybridItemMetaInput,
  PatchItemMetaInput,
} from "./types";

type ExportedHandler<E> = {
  fetch(request: Request, env: E): Response | Promise<Response>;
};

const SESSION_COOKIE = "kindraw_session";
const OAUTH_STATE_COOKIE = "kindraw_oauth_state";
const OAUTH_RETURN_TO_COOKIE = "kindraw_oauth_return_to";
// For the CLI OAuth loopback: stores the full localhost callback URL so the
// callback can mint a one-time code and redirect there instead of the web app.
const CLI_RETURN_TO_COOKIE = "kindraw_cli_return_to";

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

// Public /v1 item shape: omits internal/sensitive fields (ownerId,
// collaborationRoomId, share links) so the public API never leaks them.
const toV1ItemSummary = (item: KindrawTreeEntry) => ({
  id: item.id,
  kind: item.kind,
  title: item.title,
  folderId: item.folderId,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});

const drawingUrl = (request: Request, env: Env, itemId: string) =>
  `${resolveAppOrigin(request, env)}/draw/${itemId}`;

const errorResponse = (status: number, message: string) =>
  json(
    {
      error: message,
      status,
    },
    { status },
  );

export const parseCookies = (cookieHeader: string | null) => {
  const cookies = new Map<string, string>();
  if (!cookieHeader) {
    return cookies;
  }

  for (const cookie of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = cookie.split("=");
    if (!rawName) {
      continue;
    }
    cookies.set(rawName.trim(), decodeURIComponent(rawValue.join("=").trim()));
  }

  return cookies;
};

export const buildCookie = (
  name: string,
  value: string,
  opts: {
    maxAge?: number;
    sameSite?: "Lax" | "Strict" | "None";
    httpOnly?: boolean;
    secure?: boolean;
    path?: string;
  } = {},
) => {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path || "/"}`);
  parts.push(`SameSite=${opts.sameSite || "Lax"}`);
  if (typeof opts.maxAge === "number") {
    parts.push(`Max-Age=${opts.maxAge}`);
  }
  if (opts.httpOnly !== false) {
    parts.push("HttpOnly");
  }
  if (opts.secure !== false) {
    parts.push("Secure");
  }
  return parts.join("; ");
};

const isSecureRequest = (request: Request) =>
  new URL(request.url).protocol === "https:";

const normalizeOrigin = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const isLocalOrigin = (origin: string) => {
  const url = new URL(origin);
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  );
};

const isPagesProjectOrigin = (origin: string, configuredOrigin: string) => {
  const originUrl = new URL(origin);
  const configuredUrl = new URL(configuredOrigin);

  if (
    originUrl.protocol !== "https:" ||
    configuredUrl.protocol !== "https:" ||
    !configuredUrl.hostname.endsWith(".pages.dev")
  ) {
    return false;
  }

  return (
    originUrl.hostname === configuredUrl.hostname ||
    originUrl.hostname.endsWith(`.${configuredUrl.hostname}`)
  );
};

const isAllowedAppOrigin = (origin: string | null | undefined, env: Env) => {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) {
    return false;
  }

  if (isLocalOrigin(normalizedOrigin)) {
    return true;
  }

  const configuredOrigin = normalizeOrigin(env.KINDRAW_APP_ORIGIN);
  if (!configuredOrigin) {
    return false;
  }

  return (
    normalizedOrigin === configuredOrigin ||
    isPagesProjectOrigin(normalizedOrigin, configuredOrigin)
  );
};

const getSiteKey = (origin: string) => {
  const { hostname, protocol } = new URL(origin);
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return `${protocol}//${hostname}`;
  }

  const parts = hostname.split(".");
  const registrableDomain =
    parts.length > 2 ? parts.slice(-2).join(".") : hostname;
  return `${protocol}//${registrableDomain}`;
};

const getSessionCookieSameSite = (request: Request, appOrigin: string) => {
  const workerOrigin = new URL(request.url).origin;
  return getSiteKey(workerOrigin) === getSiteKey(appOrigin) ? "Lax" : "None";
};

const resolveAppOrigin = (
  request: Request,
  env: Env,
  cookies: Map<string, string> = parseCookies(request.headers.get("Cookie")),
) => {
  const requestUrl = new URL(request.url);
  const candidates = [
    cookies.get(OAUTH_RETURN_TO_COOKIE) ?? null,
    requestUrl.searchParams.get("returnTo"),
    request.headers.get("Origin"),
    request.headers.get("Referer"),
    env.KINDRAW_APP_ORIGIN,
  ];

  for (const candidate of candidates) {
    if (isAllowedAppOrigin(candidate, env)) {
      return normalizeOrigin(candidate)!;
    }
  }

  return normalizeOrigin(env.KINDRAW_APP_ORIGIN) || requestUrl.origin;
};

const getAllowedOrigin = (request: Request, env: Env) => {
  const origin = request.headers.get("Origin");
  if (isAllowedAppOrigin(origin, env)) {
    return normalizeOrigin(origin)!;
  }

  return (
    normalizeOrigin(env.KINDRAW_APP_ORIGIN) || normalizeOrigin(origin) || "*"
  );
};

const withCors = (response: Response, request: Request, env: Env) => {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", getAllowedOrigin(request, env));
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set(
    "Access-Control-Allow-Methods",
    "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  );
  headers.set("Vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const readJson = async <T>(request: Request): Promise<T> => {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
};

const readGithubOAuthPayload = async (response: Response) => {
  try {
    return (await response.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
  } catch {
    return null;
  }
};

const exchangeGithubCode = async (request: Request, env: Env, code: string) => {
  const redirectUri = new URL(
    "/api/auth/callback/github",
    request.url,
  ).toString();
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "kindraw-worker",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data = await readGithubOAuthPayload(response);

  if (!response.ok) {
    throw new HttpError(
      502,
      `GitHub token exchange failed: ${
        data?.error_description || data?.error || `status ${response.status}`
      }.`,
    );
  }

  if (!data?.access_token) {
    throw new HttpError(
      502,
      `GitHub access token missing: ${
        data?.error_description || data?.error || "unknown GitHub response"
      }.`,
    );
  }

  return data.access_token;
};

const fetchGithubUser = async (accessToken: string) => {
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": "kindraw-worker",
  };

  const [userResponse, emailResponse] = await Promise.all([
    fetch("https://api.github.com/user", { headers }),
    fetch("https://api.github.com/user/emails", { headers }),
  ]);

  if (!userResponse.ok) {
    throw new HttpError(502, "GitHub profile request failed.");
  }

  const user = (await userResponse.json()) as {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string | null;
  };

  if (!emailResponse.ok) {
    return user;
  }

  return user;
};

const handleAuthLogin = async (request: Request, env: Env) => {
  const state = crypto.randomUUID().replace(/-/g, "");
  const appOrigin = resolveAppOrigin(request, env);
  const redirectUri = new URL(
    "/api/auth/callback/github",
    request.url,
  ).toString();
  const githubUrl = new URL("https://github.com/login/oauth/authorize");
  githubUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  githubUrl.searchParams.set("redirect_uri", redirectUri);
  githubUrl.searchParams.set("scope", "read:user user:email");
  githubUrl.searchParams.set("state", state);

  const response = new Response(null, {
    status: 302,
    headers: {
      Location: githubUrl.toString(),
    },
  });
  response.headers.append(
    "Set-Cookie",
    buildCookie(OAUTH_STATE_COOKIE, state, {
      maxAge: 60 * 10,
      sameSite: "Lax",
      secure: isSecureRequest(request),
    }),
  );
  response.headers.append(
    "Set-Cookie",
    buildCookie(OAUTH_RETURN_TO_COOKIE, appOrigin, {
      maxAge: 60 * 10,
      sameSite: "Lax",
      secure: isSecureRequest(request),
    }),
  );

  // CLI loopback login: remember the full localhost callback URL so the
  // callback redirects there with a one-time code (not the web app).
  const cliReturnTo = parseLoopbackReturnTo(
    new URL(request.url).searchParams.get("returnTo"),
  );
  if (cliReturnTo) {
    response.headers.append(
      "Set-Cookie",
      buildCookie(CLI_RETURN_TO_COOKIE, cliReturnTo, {
        maxAge: 60 * 10,
        sameSite: "Lax",
        secure: isSecureRequest(request),
      }),
    );
  }
  return response;
};

// Validates that a returnTo is a localhost loopback callback URL (CLI flow).
const parseLoopbackReturnTo = (value: string | null): string | null => {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      url.pathname === "/callback"
    ) {
      return url.toString();
    }
  } catch {
    // not a URL
  }
  return null;
};

const handleAuthCallback = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const cookies = parseCookies(request.headers.get("Cookie"));
  const appOrigin = resolveAppOrigin(request, env, cookies);
  const sessionCookieSameSite = getSessionCookieSameSite(request, appOrigin);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  if (!state || !code || cookies.get(OAUTH_STATE_COOKIE) !== state) {
    throw new HttpError(400, "Invalid GitHub OAuth state.");
  }

  const accessToken = await exchangeGithubCode(request, env, code);
  const githubUser = await fetchGithubUser(accessToken);
  const store = createStore(env.KINDRAW_DB, env.KINDRAW_BLOBS);
  const user = await store.upsertGithubUser({
    githubId: String(githubUser.id),
    githubLogin: githubUser.login,
    name: githubUser.name || githubUser.login,
    avatarUrl: githubUser.avatar_url,
  });

  // CLI loopback flow: issue a one-time code and redirect to the local server,
  // which exchanges it for a PAT. No web session cookie is set.
  const cliReturnTo = parseLoopbackReturnTo(
    cookies.get(CLI_RETURN_TO_COOKIE) ?? null,
  );
  if (cliReturnTo) {
    const { code } = await store.createCliAuthCode(user.id, "kindraw CLI");
    const target = new URL(cliReturnTo);
    target.searchParams.set("code", code);
    const cliResponse = new Response(null, {
      status: 302,
      headers: { Location: target.toString() },
    });
    for (const cookieName of [
      OAUTH_STATE_COOKIE,
      OAUTH_RETURN_TO_COOKIE,
      CLI_RETURN_TO_COOKIE,
    ]) {
      cliResponse.headers.append(
        "Set-Cookie",
        buildCookie(cookieName, "", {
          maxAge: 0,
          sameSite: "Lax",
          secure: isSecureRequest(request),
        }),
      );
    }
    return cliResponse;
  }

  const session = await store.createSession(user.id);

  const response = new Response(null, {
    status: 302,
    headers: {
      Location: `${appOrigin}/`,
    },
  });
  response.headers.append(
    "Set-Cookie",
    buildCookie(SESSION_COOKIE, session.id, {
      maxAge: 60 * 60 * 24 * 30,
      sameSite: sessionCookieSameSite,
      secure: isSecureRequest(request),
    }),
  );
  response.headers.append(
    "Set-Cookie",
    buildCookie(OAUTH_STATE_COOKIE, "", {
      maxAge: 0,
      sameSite: "Lax",
      secure: isSecureRequest(request),
    }),
  );
  response.headers.append(
    "Set-Cookie",
    buildCookie(OAUTH_RETURN_TO_COOKIE, "", {
      maxAge: 0,
      sameSite: "Lax",
      secure: isSecureRequest(request),
    }),
  );
  return response;
};

const getAuthSession = async (
  request: Request,
  env: Env,
): Promise<KindrawSession | null> => {
  const cookies = parseCookies(request.headers.get("Cookie"));
  const sessionId = cookies.get(SESSION_COOKIE);
  if (!sessionId) {
    return null;
  }

  const store = createStore(env.KINDRAW_DB, env.KINDRAW_BLOBS);
  return store.getSessionPayload(sessionId);
};

// Accepts either an API token (Authorization: Bearer kdr_...) or a browser
// session cookie. Used by /v1/api/* (public API) and all existing routes.
const requireAuth = async (request: Request, env: Env) => {
  const store = createStore(env.KINDRAW_DB, env.KINDRAW_BLOBS);

  const authorization = request.headers.get("Authorization");
  if (authorization && authorization.startsWith("Bearer ")) {
    const secret = authorization.slice("Bearer ".length).trim();
    const auth = await store.resolveApiToken(secret);
    if (!auth) {
      throw new HttpError(401, "Invalid or expired API token.");
    }
    return { auth, store, sessionId: null as string | null };
  }

  const cookies = parseCookies(request.headers.get("Cookie"));
  const sessionId = cookies.get(SESSION_COOKIE);
  if (!sessionId) {
    throw new HttpError(401, "Authentication required.");
  }

  const auth = await store.resolveSession(sessionId);
  if (!auth) {
    throw new HttpError(401, "Session is missing or expired.");
  }

  return { auth, store, sessionId: sessionId as string | null };
};

// Cookie-only auth. Used by token-management routes so that an API token can
// never mint or revoke other API tokens (privilege containment).
const requireSession = async (request: Request, env: Env) => {
  const cookies = parseCookies(request.headers.get("Cookie"));
  const sessionId = cookies.get(SESSION_COOKIE);
  if (!sessionId) {
    throw new HttpError(401, "Authentication required.");
  }

  const store = createStore(env.KINDRAW_DB, env.KINDRAW_BLOBS);
  const auth = await store.resolveSession(sessionId);
  if (!auth) {
    throw new HttpError(401, "Session is missing or expired.");
  }

  return { auth, store, sessionId };
};

export const routeRequest = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (pathname === "/api/auth/login/github" && request.method === "GET") {
    return handleAuthLogin(request, env);
  }

  if (pathname === "/api/auth/callback/github" && request.method === "GET") {
    return handleAuthCallback(request, env);
  }

  if (pathname === "/api/auth/session" && request.method === "GET") {
    return json(await getAuthSession(request, env));
  }

  if (pathname === "/api/auth/logout" && request.method === "POST") {
    const cookies = parseCookies(request.headers.get("Cookie"));
    const appOrigin = resolveAppOrigin(request, env, cookies);
    const sessionCookieSameSite = getSessionCookieSameSite(request, appOrigin);
    const sessionId = cookies.get(SESSION_COOKIE);
    if (sessionId) {
      const store = createStore(env.KINDRAW_DB, env.KINDRAW_BLOBS);
      await store.deleteSession(sessionId);
    }

    const response = new Response(null, { status: 204 });
    response.headers.append(
      "Set-Cookie",
      buildCookie(SESSION_COOKIE, "", {
        maxAge: 0,
        sameSite: sessionCookieSameSite,
        secure: isSecureRequest(request),
      }),
    );
    return response;
  }

  // CLI loopback: exchange a one-time auth code for a PAT (the code is the
  // credential; single-use; minted only by the GitHub callback in CLI flow).
  if (pathname === "/api/auth/cli-exchange" && request.method === "POST") {
    const store = createStore(env.KINDRAW_DB, env.KINDRAW_BLOBS);
    const input = await readJson<{ code?: string }>(request);
    const result = await store.exchangeCliAuthCode(input.code || "");
    if (!result) {
      throw new HttpError(400, "Invalid or expired authorization code.");
    }
    return json(result, { status: 201 });
  }

  // --- API token management (cookie-only; a PAT cannot mint/list/revoke PATs) -
  if (pathname === "/api/auth/tokens" && request.method === "GET") {
    const { auth, store } = await requireSession(request, env);
    return json({ tokens: await store.listApiTokens(auth.user.id) });
  }

  if (pathname === "/api/auth/tokens" && request.method === "POST") {
    const { auth, store } = await requireSession(request, env);
    const input = await readJson<{ name?: string; expiresInDays?: number }>(
      request,
    );
    const created = await store.createApiToken(auth.user.id, {
      name: input.name || "API token",
      expiresInDays: input.expiresInDays ?? null,
    });
    // `secret` is returned exactly once here and never again.
    return json(created, { status: 201 });
  }

  if (
    pathname.startsWith("/api/auth/tokens/") &&
    request.method === "DELETE"
  ) {
    const prefix = pathname.replace("/api/auth/tokens/", "");
    const { auth, store } = await requireSession(request, env);
    const revoked = await store.revokeApiToken(auth.user.id, prefix);
    if (!revoked) {
      throw new HttpError(404, "Token not found.");
    }
    return new Response(null, { status: 204 });
  }

  // --- Public API surface /v1/api/* (Bearer token; also accepts cookie) -------
  if (pathname === "/v1/api/me" && request.method === "GET") {
    const { auth } = await requireAuth(request, env);
    return json({
      user: {
        id: auth.user.id,
        githubLogin: auth.user.githubLogin,
        name: auth.user.name,
      },
      scope: auth.apiToken?.scope ?? "full",
      via: auth.apiToken ? "token" : "session",
    });
  }

  if (pathname === "/v1/api/items" && request.method === "GET") {
    const { auth, store } = await requireAuth(request, env);
    const tree = await store.getTree(auth.user.id);
    return json({ items: tree.items.map(toV1ItemSummary) });
  }

  if (pathname === "/v1/api/items" && request.method === "POST") {
    const { auth, store } = await requireAuth(request, env);
    const input = await readJson<CreateItemInput>(request);
    const itemId = await store.createItem(auth.user.id, input);
    return json({ itemId, url: drawingUrl(request, env, itemId) }, {
      status: 201,
    });
  }

  // Create a drawing from pre-serialized Excalidraw content. Mermaid->Excalidraw
  // conversion happens client-side (see kindraw-client); this endpoint only
  // persists. A `mermaid` field is explicitly rejected so the contract is clear.
  if (
    (pathname === "/v1/api/items:generate" ||
      pathname === "/v1/api/items/generate") &&
    request.method === "POST"
  ) {
    const { auth, store } = await requireAuth(request, env);
    const input = await readJson<{
      title?: string;
      folderId?: string | null;
      content?: string;
      mermaid?: string;
    }>(request);

    if (input.mermaid && !input.content) {
      throw new HttpError(
        422,
        "Mermaid conversion happens client-side. Send serialized Excalidraw `content`.",
      );
    }
    if (!input.content || typeof input.content !== "string") {
      throw new HttpError(400, "`content` (serialized Excalidraw JSON) is required.");
    }
    // Cheap structural validation — no DOM/rendering in the Worker.
    try {
      const parsed = JSON.parse(input.content) as { elements?: unknown };
      if (!parsed || !Array.isArray(parsed.elements)) {
        throw new Error("missing elements array");
      }
    } catch {
      throw new HttpError(400, "`content` is not valid Excalidraw JSON.");
    }

    const itemId = await store.createItem(auth.user.id, {
      kind: "drawing",
      title: input.title || "Untitled drawing",
      folderId: input.folderId ?? null,
      content: input.content,
    });
    return json({ itemId, url: drawingUrl(request, env, itemId) }, {
      status: 201,
    });
  }

  if (pathname.startsWith("/v1/api/items/") && pathname.endsWith("/content")) {
    const itemId = pathname
      .replace("/v1/api/items/", "")
      .replace("/content", "");
    const { auth, store } = await requireAuth(request, env);
    if (request.method === "PUT") {
      const input = await readJson<{ content?: string }>(request);
      await store.putItemContent(auth.user.id, itemId, input.content || "");
      return new Response(null, { status: 204 });
    }
  }

  if (pathname.startsWith("/v1/api/items/")) {
    const itemId = pathname.replace("/v1/api/items/", "");
    const { auth, store } = await requireAuth(request, env);
    if (request.method === "GET") {
      const { item, content } = await store.getItem(auth.user.id, itemId);
      return json({ item: toV1ItemSummary(item), content });
    }
    if (request.method === "DELETE") {
      await store.deleteItem(auth.user.id, itemId);
      return new Response(null, { status: 204 });
    }
  }

  if (
    pathname === "/v1/ai/text-to-diagram/chat-streaming" &&
    request.method === "POST"
  ) {
    const { auth } = await requireAuth(request, env);
    return handleTextToDiagramChatStreaming(request, env, auth.user.id);
  }

  if (
    pathname === "/v1/ai/diagram-to-code/generate" &&
    request.method === "POST"
  ) {
    const { auth } = await requireAuth(request, env);
    return handleDiagramToCodeGenerate(request, env, auth.user.id);
  }

  if (pathname === "/api/tree" && request.method === "GET") {
    const { auth, store } = await requireAuth(request, env);
    return json(await store.getTree(auth.user.id));
  }

  if (pathname === "/api/hybrid-items" && request.method === "POST") {
    const { auth, store } = await requireAuth(request, env);
    const input = await readJson<CreateHybridItemInput>(request);
    return json(await store.createHybridItem(auth.user.id, input), {
      status: 201,
    });
  }

  if (pathname.startsWith("/api/hybrid-items/")) {
    const hybridId = pathname
      .replace("/api/hybrid-items/", "")
      .replace("/meta", "")
      .replace("/share-links", "");
    const { auth, store } = await requireAuth(request, env);

    if (request.method === "GET" && !pathname.endsWith("/meta")) {
      return json(await store.getHybridItem(auth.user.id, hybridId));
    }

    if (pathname.endsWith("/meta") && request.method === "PATCH") {
      const input = await readJson<PatchHybridItemMetaInput>(request);
      await store.patchHybridItemMeta(auth.user.id, hybridId, input);
      return new Response(null, { status: 204 });
    }

    if (pathname.endsWith("/share-links") && request.method === "POST") {
      return json(
        {
          shareLink: await store.createHybridShareLink(auth.user.id, hybridId),
        },
        { status: 201 },
      );
    }

    if (request.method === "DELETE" && !pathname.endsWith("/meta")) {
      await store.deleteHybridItem(auth.user.id, hybridId);
      return new Response(null, { status: 204 });
    }
  }

  // User search for the share invite UI (by @login / name). Authenticated.
  if (pathname === "/api/users/search" && request.method === "GET") {
    const { auth, store } = await requireAuth(request, env);
    const q = (url.searchParams.get("q") || "").trim();
    if (!q) {
      throw new HttpError(400, "Search query `q` is required.");
    }
    return json({ users: await store.searchUsers(q, auth.user.id) });
  }

  if (pathname === "/api/folders" && request.method === "POST") {
    const { auth, store } = await requireAuth(request, env);
    const input = await readJson<CreateFolderInput>(request);
    return json(
      {
        folderId: await store.createFolder(auth.user.id, input),
      },
      { status: 201 },
    );
  }

  // --- Folder shares (people with access to a folder) ------------------------
  // Matched BEFORE the generic /api/folders/:id handler so the longer paths win.
  if (pathname.match(/^\/api\/folders\/[^/]+\/shares(\/[^/]+)?$/)) {
    const rest = pathname.replace("/api/folders/", "");
    const [folderId, sharesSegment, shareId] = rest.split("/");
    const { auth, store } = await requireAuth(request, env);

    // /api/folders/:folderId/shares
    if (sharesSegment === "shares" && !shareId) {
      if (request.method === "GET") {
        return json({
          shares: await store.listFolderShares(auth.user.id, folderId),
        });
      }
      if (request.method === "POST") {
        const input = await readJson<{
          login?: string;
          role?: string;
        }>(request);
        const login = (input.login || "").trim();
        if (!login) {
          throw new HttpError(400, "`login` is required.");
        }
        const role = input.role;
        if (role !== "viewer" && role !== "editor") {
          throw new HttpError(400, "`role` must be 'viewer' or 'editor'.");
        }
        const target = await store.getUserByLogin(login);
        if (!target) {
          throw new HttpError(404, `No user found with login @${login}.`);
        }
        const share = await store.grantFolderAccess(
          auth.user.id,
          folderId,
          target.id,
          role,
        );
        return json({ share }, { status: 201 });
      }
    }

    // /api/folders/:folderId/shares/:shareId
    if (sharesSegment === "shares" && shareId) {
      if (request.method === "PATCH") {
        const input = await readJson<{ role?: string }>(request);
        const role = input.role;
        if (role !== "viewer" && role !== "editor") {
          throw new HttpError(400, "`role` must be 'viewer' or 'editor'.");
        }
        const share = await store.updateFolderAccessRole(
          auth.user.id,
          folderId,
          shareId,
          role,
        );
        return json({ share });
      }
      if (request.method === "DELETE") {
        await store.revokeFolderAccess(auth.user.id, folderId, shareId);
        return new Response(null, { status: 204 });
      }
    }
  }

  if (pathname.startsWith("/api/folders/")) {
    const folderId = pathname.replace("/api/folders/", "");
    const { auth, store } = await requireAuth(request, env);

    if (request.method === "PATCH") {
      const input = await readJson<PatchFolderInput>(request);
      await store.patchFolder(auth.user.id, folderId, input);
      return new Response(null, { status: 204 });
    }

    if (request.method === "DELETE") {
      await store.deleteFolder(auth.user.id, folderId);
      return new Response(null, { status: 204 });
    }
  }

  if (pathname === "/api/items" && request.method === "POST") {
    const { auth, store } = await requireAuth(request, env);
    const input = await readJson<CreateItemInput>(request);
    return json(
      {
        itemId: await store.createItem(auth.user.id, input),
      },
      { status: 201 },
    );
  }

  // Maintenance: list the authenticated user's empty drawings (read-only).
  if (
    pathname === "/api/admin/empty-drawings" &&
    request.method === "GET"
  ) {
    const { auth, store } = await requireAuth(request, env);
    return json({ drawings: await store.listEmptyDrawings(auth.user.id) });
  }

  // Maintenance: delete the given drawing ids, but ONLY those that are still
  // confirmed empty at delete time (re-scan) — a non-empty drawing is never
  // deleted even if its id is passed in.
  if (
    pathname === "/api/admin/empty-drawings/delete" &&
    request.method === "POST"
  ) {
    const { auth, store } = await requireAuth(request, env);
    const input = await readJson<{ ids?: string[] }>(request);
    const requested = new Set(input.ids || []);
    const stillEmpty = (await store.listEmptyDrawings(auth.user.id)).filter(
      (drawing) => requested.has(drawing.id),
    );
    for (const drawing of stillEmpty) {
      await store.deleteItem(auth.user.id, drawing.id);
    }
    return json({
      deleted: stillEmpty.map((drawing) => drawing.id),
      deletedCount: stillEmpty.length,
    });
  }

  if (pathname.startsWith("/api/items/") && pathname.endsWith("/meta")) {
    const itemId = pathname.replace("/api/items/", "").replace("/meta", "");
    const { auth, store } = await requireAuth(request, env);
    if (request.method === "PATCH") {
      const input = await readJson<PatchItemMetaInput>(request);
      await store.patchItemMeta(auth.user.id, itemId, input);
      return new Response(null, { status: 204 });
    }
  }

  if (pathname.startsWith("/api/items/") && pathname.endsWith("/content")) {
    const itemId = pathname.replace("/api/items/", "").replace("/content", "");
    const { auth, store } = await requireAuth(request, env);
    if (request.method === "PUT") {
      const input = await readJson<{ content?: string }>(request);
      await store.putItemContent(auth.user.id, itemId, input.content || "");
      return new Response(null, { status: 204 });
    }
  }

  if (pathname.startsWith("/api/items/") && pathname.endsWith("/share-links")) {
    const itemId = pathname
      .replace("/api/items/", "")
      .replace("/share-links", "");
    const { auth, store } = await requireAuth(request, env);
    if (request.method === "POST") {
      return json(
        {
          shareLink: await store.createShareLink(auth.user.id, itemId),
        },
        { status: 201 },
      );
    }
  }

  if (
    pathname.startsWith("/api/collaboration-room/") &&
    pathname.endsWith("/bootstrap") &&
    request.method === "GET"
  ) {
    const roomId = pathname
      .replace("/api/collaboration-room/", "")
      .replace("/bootstrap", "");
    const roomKey = new URL(request.url).searchParams.get("key") || "";
    const store = createStore(env.KINDRAW_DB, env.KINDRAW_BLOBS);
    return json(await store.getCollaborationRoomBootstrap(roomId, roomKey));
  }

  if (
    pathname.startsWith("/api/items/") &&
    pathname.endsWith("/collaboration-room")
  ) {
    const itemId = pathname
      .replace("/api/items/", "")
      .replace("/collaboration-room", "");
    const { auth, store } = await requireAuth(request, env);

    if (request.method === "POST") {
      return json(
        {
          collaborationRoom: await store.enableItemCollaboration(
            auth.user.id,
            itemId,
          ),
        },
        { status: 201 },
      );
    }

    if (request.method === "DELETE") {
      await store.disableItemCollaboration(auth.user.id, itemId);
      return new Response(null, { status: 204 });
    }
  }

  if (pathname.startsWith("/api/items/")) {
    const itemId = pathname.replace("/api/items/", "");
    const { auth, store } = await requireAuth(request, env);

    if (request.method === "GET") {
      return json(await store.getItem(auth.user.id, itemId));
    }

    if (request.method === "DELETE") {
      await store.deleteItem(auth.user.id, itemId);
      return new Response(null, { status: 204 });
    }
  }

  if (pathname.startsWith("/api/share-links/") && request.method === "DELETE") {
    const shareLinkId = pathname.replace("/api/share-links/", "");
    const { auth, store } = await requireAuth(request, env);
    await store.revokeShareLink(auth.user.id, shareLinkId);
    return new Response(null, { status: 204 });
  }

  if (pathname.startsWith("/api/public/") && request.method === "GET") {
    const token = pathname.replace("/api/public/", "");
    const store = createStore(env.KINDRAW_DB, env.KINDRAW_BLOBS);
    return json(await store.getPublicItem(token));
  }

  if (pathname === "/api/icons/search" && request.method === "GET") {
    return handleIconSearch(request, env);
  }

  if (pathname === "/api/icons/svg" && request.method === "GET") {
    return handleIconSvg(request, env);
  }

  if (pathname === "/api/templates" && request.method === "GET") {
    return handleTemplateList(request, env);
  }

  if (pathname.startsWith("/api/templates/") && request.method === "GET") {
    const id = pathname.replace("/api/templates/", "");
    return handleTemplateById(request, env, id);
  }

  if (pathname === "/api/libraries" && request.method === "GET") {
    return handleLibraryList(request, env);
  }

  if (pathname.startsWith("/api/libraries/") && request.method === "GET") {
    const id = pathname.replace("/api/libraries/", "");
    return handleLibraryBlob(request, env, id);
  }

  if (pathname.startsWith("/api/collab/rooms/") && pathname.endsWith("/ws")) {
    const roomId = pathname
      .replace("/api/collab/rooms/", "")
      .replace("/ws", "");
    const stub = env.KINDRAW_COLLAB.get(env.KINDRAW_COLLAB.idFromName(roomId));
    return stub.fetch(request);
  }

  return errorResponse(404, "Not found.");
};

const handleError = (error: unknown) => {
  if (error instanceof HttpError) {
    return errorResponse(error.status, error.message);
  }

  console.error(error);
  return errorResponse(500, "Internal server error.");
};

const worker: ExportedHandler<Env> = {
  async fetch(request, env) {
    try {
      const response = await routeRequest(request, env);
      if (response.status === 101) {
        return response;
      }
      return withCors(response, request, env);
    } catch (error) {
      return withCors(handleError(error), request, env);
    }
  },
};

export default worker;
export { KindrawCollaborationRoom };
