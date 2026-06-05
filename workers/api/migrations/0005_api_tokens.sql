-- Personal Access Tokens for the public /v1 API (CLI + MCP server).
-- The token secret is NEVER stored: `id` is the SHA-256 hash of the secret,
-- so a DB leak does not expose usable tokens. `prefix` is a short, safe-to-show
-- fragment (e.g. "kdr_ab12") for listing tokens in the UI.
CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,            -- SHA-256(secret), hex; lookup key
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,          -- displayable, e.g. "kdr_ab12cd34"
  scope TEXT NOT NULL DEFAULT 'full',
  created_at TEXT NOT NULL,
  expires_at TEXT,               -- NULL = never expires
  last_seen_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS api_tokens_user_id_idx ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS api_tokens_prefix_idx ON api_tokens(prefix);
