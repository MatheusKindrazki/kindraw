---
name: kindraw-login
description: Help the user connect their Kindraw account by getting an API token, so the Kindraw drawing tools work. Use when the user wants to set up, log in, connect, or authenticate Kindraw, or when Kindraw tools fail with an authentication error.
---

# Connect Kindraw

Guide the user to connect their Kindraw account so the drawing tools work.

There are two ways to get an API token. **Prefer the web UI** — it works today
without extra setup.

## Option A — Copy a token from the web (recommended)

Tell the user to:

1. Open **https://kindraw.dev** and sign in with GitHub.
2. Click their profile, then **API tokens**.
3. Click **Generate token**, give it a name (e.g. "Claude"), and **copy** the
   token (it's shown only once).
4. Provide it to the plugin: either set it as the plugin's `api_token` config,
   or export it for this session:
   ```bash
   export KINDRAW_TOKEN="kdr_..."
   ```

If they configured the plugin's `api_token`, the Kindraw MCP server picks it up
automatically — no further action needed.

## Option B — CLI login (OAuth in the browser)

If they have Node, they can run the CLI which opens a browser login:

```bash
npx @kindraw/cli login
```

This stores the token at `~/.config/kindraw/config.json`, which the Kindraw MCP
server also reads.

## Verify it worked

Once a token is set, confirm by listing their workspace — call
`kindraw_list_items`. If it returns items (or an empty list) instead of an auth
error, they're connected. Then they can ask you to draw anything.
