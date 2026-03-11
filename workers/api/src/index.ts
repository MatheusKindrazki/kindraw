import { createStore, HttpError } from "./store";
import { KindrawCollaborationRoom } from "./collab";
import {
  handleDiagramToCodeGenerate,
  handleTextToDiagramChatStreaming,
} from "./ai";

import type {
  CreateFolderInput,
  CreateItemInput,
  Env,
  KindrawSession,
  PatchFolderInput,
  PatchItemMetaInput,
} from "./types";

type ExportedHandler<E> = {
  fetch(request: Request, env: E): Response | Promise<Response>;
};

const SESSION_COOKIE = "kindraw_session";
const OAUTH_STATE_COOKIE = "kindraw_oauth_state";
const OAUTH_RETURN_TO_COOKIE = "kindraw_oauth_return_to";

const json = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

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
  return response;
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

const requireAuth = async (request: Request, env: Env) => {
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

  return {
    auth,
    store,
    sessionId,
  };
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
