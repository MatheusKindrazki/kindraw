CREATE TABLE IF NOT EXISTS hybrid_items (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  doc_item_id TEXT NOT NULL UNIQUE,
  drawing_item_id TEXT NOT NULL UNIQUE,
  default_view TEXT NOT NULL DEFAULT 'both' CHECK (default_view IN ('document', 'both', 'canvas')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (doc_item_id) REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (drawing_item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS hybrid_items_owner_id_idx
ON hybrid_items(owner_id);
