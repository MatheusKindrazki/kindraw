ALTER TABLE items ADD COLUMN archived_at TEXT;
CREATE INDEX IF NOT EXISTS items_owner_archived_idx ON items(owner_id, archived_at);
