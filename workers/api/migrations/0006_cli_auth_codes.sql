-- One-time authorization codes for the CLI OAuth loopback flow.
-- After GitHub auth completes in a CLI login, the callback issues a short-lived
-- single-use code (id = SHA-256 of the code, never the raw code) that the local
-- loopback server exchanges for a Personal Access Token. The code carries the
-- authenticated user id and is consumed (deleted) on first exchange.
CREATE TABLE IF NOT EXISTS cli_auth_codes (
  id TEXT PRIMARY KEY,          -- SHA-256(code) hex
  user_id TEXT NOT NULL,
  token_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS cli_auth_codes_expires_at_idx ON cli_auth_codes(expires_at);
