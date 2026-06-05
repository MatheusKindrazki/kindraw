# @kindraw/cli

Command-line tool for [Kindraw](https://kindraw.dev): connect with GitHub and
create drawings from your terminal — including straight from Mermaid.

## Usage

```bash
# Connect (opens your browser to sign in with GitHub)
npx @kindraw/cli login

# Who am I?
npx @kindraw/cli whoami

# Create a drawing from a Mermaid diagram
echo 'graph TD; A[Login] --> B{Valid?}; B -->|yes| C[Home]; B -->|no| A' \
  | npx @kindraw/cli generate --mermaid - --title "Login flow"

# Manage items
npx @kindraw/cli items list
npx @kindraw/cli items get <id>
npx @kindraw/cli items delete <id>
```

Install globally for a shorter `kindraw` command:

```bash
npm i -g @kindraw/cli
kindraw login
```

## Auth

`kindraw login` stores a token at `~/.config/kindraw/config.json` (mode 0600).
For CI, set `KINDRAW_TOKEN` (generate one at kindraw.dev → API tokens).

## Env

- `KINDRAW_TOKEN` — API token (overrides the saved login).
- `KINDRAW_API_BASE_URL` — defaults to `https://api.kindraw.dev`.
