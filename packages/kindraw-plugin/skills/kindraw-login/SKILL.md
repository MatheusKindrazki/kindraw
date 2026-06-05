---
name: kindraw-login
description: Help the user connect their Kindraw account by setting the plugin's API token, so the Kindraw drawing tools work. Use when the user wants to set up, log in, connect, or authenticate Kindraw, or when Kindraw tools fail with an authentication error or aren't available.
---

# Connect Kindraw

Guide the user to set their Kindraw API token so the drawing tools load.

## 1. Get a token

Tell the user to:

1. Open **https://kindraw.dev** and sign in with GitHub.
2. Click their profile → **API tokens** → **Generate token** (name it e.g.
   "Claude").
3. **Copy** the token (it's shown only once). It looks like `kdr_...`.

⚠️ Tell the user **not to paste the token into the chat** — it's a secret and
gets stored in the conversation log. They set it via the plugin config instead
(next step), which never reaches the chat.

## 2. Set it as the plugin's token

The Kindraw plugin reads the token from its **`api_token` user config**. The
user sets it one of these ways:

- **In Claude Code (recommended):** run `/plugin`, open the **kindraw** plugin,
  and set **API token** there. The value is stored securely (keychain), not in
  the chat.
- **Or from the terminal**, re-enable the plugin with the token:
  ```bash
  claude plugin enable kindraw@kindraw --config api_token=kdr_...
  ```
- **Or via env var** (e.g. for CI): export `KINDRAW_TOKEN` (note: `KINDRAW_TOKEN`,
  not `KINDRAW_API_TOKEN`) before starting Claude Code.

## 3. Restart Claude Code

The MCP server picks up the token at startup, so the user must **restart Claude
Code** after setting it. After restarting, the `kindraw_create_diagram` tool
becomes available.

## 4. Verify

Once restarted, confirm by calling `kindraw_list_items`. If it returns items (or
an empty list) instead of an auth error, they're connected — then they can ask
you to draw anything.

If the tools still aren't available after restart, have them run `/doctor` and
check the MCP section, and confirm the token was saved (`/plugin` → kindraw).
