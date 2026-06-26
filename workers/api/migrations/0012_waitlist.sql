-- Email waitlist captured from the public landing page (logged-out root).
-- No auth required to write; the public POST /api/waitlist endpoint upserts here.
-- `email` is the primary key so duplicate sign-ups are idempotent (ON CONFLICT
-- DO NOTHING). `source` records where the address came from (e.g. "landing").
CREATE TABLE IF NOT EXISTS waitlist (
  email TEXT PRIMARY KEY,         -- normalized (lower + trim)
  source TEXT,                    -- e.g. "landing", "landing-hero"
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS waitlist_created_at_idx ON waitlist(created_at);
