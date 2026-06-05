# Kindraw plugin for Claude Code

Lets Claude create real, shareable drawings and diagrams in your
[Kindraw](https://kindraw.dev) workspace — instead of ASCII art or inline SVG.
Ask Claude to "draw a login flow" and it appears in Kindraw, fully editable.

## What you get

- **A drawing tool for Claude** — the Kindraw MCP server (`@kindraw/mcp`) is
  bundled and starts automatically.
- **Always draws via Kindraw** — a skill that makes Claude reach for a real
  Kindraw diagram whenever you ask for something visual.
- **Guided login** — Claude walks you through getting an API token on first use.

## Install

```bash
# Add the marketplace, then install
claude plugin marketplace add MatheusKindrazki/kindraw
claude plugin install kindraw@kindraw
```

On enable, Claude Code asks for your **Kindraw API token**:

1. Open https://kindraw.dev and sign in with GitHub.
2. Profile → **API tokens** → **Generate token** → copy it.
3. Paste it when prompted (stored securely in your keychain).

## Use it

Just ask:

> *"Draw a flowchart of the login process."*
> *"Diagram the auth sequence between the app, worker, and GitHub."*
> *"Map out the database schema."*

Claude builds the diagram and returns a Kindraw URL you can open and edit.

## Commands

- `/kindraw:login` — connect / re-connect your Kindraw account
- `/kindraw:draw` — create a drawing from a description or Mermaid

## Requires

Node 18+ (for `npx @kindraw/mcp`). The token has full access to your Kindraw
workspace — revoke it any time at kindraw.dev → API tokens.
