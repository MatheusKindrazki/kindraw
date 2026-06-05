// OAuth loopback login for the CLI. Opens the browser to the Kindraw GitHub
// login, with returnTo pointing at an ephemeral localhost server. The callback
// receives a one-time authorization `code` (never the PAT in the URL), which is
// then exchanged for a Personal Access Token over a direct POST.

import http from "node:http";
import { spawn } from "node:child_process";
import { DEFAULT_API_BASE_URL } from "./client.js";

export type LoopbackLoginOptions = {
  apiBaseUrl?: string;
  tokenName?: string;
  /** Opens the URL in the user's browser. Override in tests. */
  openBrowser?: (url: string) => void;
  timeoutMs?: number;
};

export type LoopbackLoginResult = {
  secret: string;
  prefix: string;
};

const openInBrowser = (url: string) => {
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? "open"
      : platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
  } catch {
    // Non-fatal: we still print the URL for manual open.
  }
};

export const startLoopbackLogin = (
  options: LoopbackLoginOptions = {},
): Promise<LoopbackLoginResult> => {
  const apiBaseUrl = (options.apiBaseUrl || DEFAULT_API_BASE_URL).replace(
    /\/+$/,
    "",
  );
  const open = options.openBrowser || openInBrowser;
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || "/", "http://localhost");
        if (url.pathname !== "/callback") {
          res.writeHead(404).end("Not found");
          return;
        }
        const code = url.searchParams.get("code");
        if (!code) {
          res.writeHead(400).end("Missing authorization code.");
          finish(new Error("Login failed: no authorization code returned."));
          return;
        }

        // Exchange the one-time code for a PAT over a direct POST (the secret
        // is in the response body, never in a URL/log).
        const response = await fetch(`${apiBaseUrl}/api/auth/cli-exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            name: options.tokenName || "kindraw CLI",
          }),
        });
        if (!response.ok) {
          res.writeHead(500).end("Token exchange failed.");
          finish(
            new Error(`Token exchange failed (HTTP ${response.status}).`),
          );
          return;
        }
        const data = (await response.json()) as {
          secret: string;
          token?: { prefix: string };
        };
        res
          .writeHead(200, { "Content-Type": "text/html" })
          .end(
            "<!DOCTYPE html><html><body style='font-family:sans-serif;padding:3rem'>" +
              "<h2>✅ Kindraw connected</h2><p>You can close this tab and return to the terminal.</p></body></html>",
          );
        finish(null, {
          secret: data.secret,
          prefix: data.token?.prefix || "",
        });
      } catch (error) {
        res.writeHead(500).end("Internal error.");
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });

    let settled = false;
    const timer = setTimeout(() => {
      finish(new Error("Login timed out."));
    }, timeoutMs);

    const finish = (error: Error | null, result?: LoopbackLoginResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      server.close();
      if (error) {
        reject(error);
      } else if (result) {
        resolve(result);
      }
    };

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        finish(new Error("Could not bind loopback server."));
        return;
      }
      const returnTo = `http://localhost:${address.port}/callback`;
      const loginUrl = `${apiBaseUrl}/api/auth/login/github?returnTo=${encodeURIComponent(
        returnTo,
      )}&cli=1`;
      // eslint-disable-next-line no-console
      console.log(`\nOpening browser to sign in:\n  ${loginUrl}\n`);
      open(loginUrl);
    });
  });
};
