# @kindraw/mcp

MCP server that gives Claude tools to create and manage drawings in your
[Kindraw](https://kindraw.dev) workspace — including turning Mermaid diagrams
into real Excalidraw drawings.

## Setup

1. **Get an API token.** Open [kindraw.dev](https://kindraw.dev), sign in with
   GitHub, open **API tokens** from your profile, and generate a token. Copy it
   (it's shown only once).

2. **Add the server to Claude Code** (`~/.claude.json` or project `.mcp.json`):

   ```json
   {
     "mcpServers": {
       "kindraw": {
         "command": "npx",
         "args": ["-y", "@kindraw/mcp"],
         "env": { "KINDRAW_TOKEN": "kdr_your_token_here" }
       }
     }
   }
   ```

   If you've run `kindraw login` (see `@kindraw/cli`), the token is picked up
   from `~/.config/kindraw/config.json` automatically and `env` is optional.

## Tools

| Tool | What it does |
|------|--------------|
| `kindraw_create_diagram` | Create a drawing from a Mermaid definition (flowchart, sequence, class, ER…) |
| `kindraw_create_drawing` | Create a drawing from pre-serialized Excalidraw JSON |
| `kindraw_list_items` | List your drawings and docs |
| `kindraw_get_item` | Fetch one item (with content) |
| `kindraw_delete_item` | Delete an item |

Then just ask Claude things like *"draw a login flow in my Kindraw"* and the
diagram appears in your workspace.

## Env

- `KINDRAW_TOKEN` — your API token (falls back to the CLI config).
- `KINDRAW_API_BASE_URL` — defaults to `https://api.kindraw.dev`.
