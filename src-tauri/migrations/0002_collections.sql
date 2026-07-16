PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  parent_id TEXT REFERENCES collections(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE IF NOT EXISTS paper_collections (
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (paper_id, collection_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_unique_sibling_name
  ON collections(COALESCE(parent_id, ''), name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_collections_parent_sort
  ON collections(parent_id, sort_order, name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_paper_collections_collection
  ON paper_collections(collection_id, added_at DESC);

PRAGMA user_version = 2;
