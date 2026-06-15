-- Adds Google as a second OAuth provider and unifies accounts by email.
--
-- Before: users.github_id was NOT NULL UNIQUE and there was no email/google
-- column. Identity was keyed solely by github_id.
--
-- After: identity can be keyed by github_id OR google_sub (both nullable,
-- both UNIQUE-when-present), and a verified email lets the two providers
-- resolve to the SAME account (account linking). SQLite cannot ALTER a column
-- to drop NOT NULL/UNIQUE, so we rebuild the table.
--
-- D1 runs each migration file inside a transaction, so the rebuild is atomic:
-- if any statement fails the whole file rolls back (no half-dropped users
-- table). We intentionally do NOT toggle `PRAGMA foreign_keys` here — it is a
-- no-op inside a transaction and D1 manages FK enforcement for migrations.
-- The rebuild preserves every `id` (PK), so existing FK references from
-- sessions/items/folders/api_tokens/*_shares remain valid by value.

CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  github_id TEXT,
  google_sub TEXT,
  email TEXT,
  github_login TEXT,
  name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Backfill: every existing row is a GitHub account. email/google_sub start NULL
-- and get populated on the user's next GitHub login (we now read the verified
-- primary email) or first Google login.
INSERT INTO users_new (
  id, github_id, google_sub, email, github_login, name, avatar_url,
  created_at, updated_at
)
SELECT
  id, github_id, NULL, NULL, github_login, name, avatar_url,
  created_at, updated_at
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- A provider id may appear at most once across all accounts. Partial indexes so
-- NULLs (an account that only has the other provider) don't collide.
CREATE UNIQUE INDEX users_github_id_idx ON users(github_id) WHERE github_id IS NOT NULL;
CREATE UNIQUE INDEX users_google_sub_idx ON users(google_sub) WHERE google_sub IS NOT NULL;
-- One account per verified email — the key that lets GitHub and Google link.
-- COLLATE NOCASE so "Bob@x.com" and "bob@x.com" can never become two accounts;
-- the app also lowercases emails before storing (see normalizeEmail).
CREATE UNIQUE INDEX users_email_idx ON users(email COLLATE NOCASE) WHERE email IS NOT NULL;
