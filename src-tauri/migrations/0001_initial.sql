PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  title TEXT,
  authors_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(authors_json)),
  abstract_text TEXT,
  page_count INTEGER,
  file_size INTEGER NOT NULL CHECK (file_size >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_opened_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS paper_reading_states (
  paper_id TEXT PRIMARY KEY NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL DEFAULT 1 CHECK (page_number >= 1),
  zoom REAL NOT NULL DEFAULT 1 CHECK (zoom > 0),
  zoom_mode TEXT NOT NULL DEFAULT 'fit-width',
  scroll_offset REAL NOT NULL DEFAULT 0,
  rotation INTEGER NOT NULL DEFAULT 0,
  reading_mode TEXT NOT NULL DEFAULT 'continuous',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS paper_pages (
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL CHECK (page_number >= 1),
  text_content TEXT,
  text_hash TEXT,
  section_title TEXT,
  extraction_status TEXT NOT NULL DEFAULT 'pending',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (paper_id, page_number)
);

CREATE TABLE IF NOT EXISTS selections (
  id TEXT PRIMARY KEY NOT NULL,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL CHECK (page_number >= 1),
  selected_text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  sentence TEXT,
  previous_sentence TEXT,
  next_sentence TEXT,
  paragraph TEXT,
  section_title TEXT,
  normalized_rects_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(normalized_rects_json)),
  extraction_confidence REAL NOT NULL CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS highlights (
  id TEXT PRIMARY KEY NOT NULL,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  selection_id TEXT REFERENCES selections(id) ON DELETE SET NULL,
  page_number INTEGER NOT NULL CHECK (page_number >= 1),
  selected_text TEXT NOT NULL,
  normalized_rects_json TEXT NOT NULL CHECK (json_valid(normalized_rects_json)),
  color TEXT NOT NULL CHECK (color IN ('yellow','green','blue','pink','purple')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY NOT NULL,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL CHECK (page_number >= 1),
  selection_id TEXT REFERENCES selections(id) ON DELETE SET NULL,
  highlight_id TEXT REFERENCES highlights(id) ON DELETE SET NULL,
  selected_text TEXT,
  source_sentence TEXT,
  content_markdown TEXT NOT NULL CHECK (length(trim(content_markdown)) > 0),
  tags_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS terms (
  id TEXT PRIMARY KEY NOT NULL,
  normalized_text TEXT NOT NULL UNIQUE,
  display_text TEXT NOT NULL,
  familiarity TEXT NOT NULL DEFAULT 'new' CHECK (familiarity IN ('new','learning','familiar','mastered')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS term_occurrences (
  id TEXT PRIMARY KEY NOT NULL,
  term_id TEXT NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  selection_id TEXT REFERENCES selections(id) ON DELETE SET NULL,
  page_number INTEGER NOT NULL CHECK (page_number >= 1),
  selected_text TEXT NOT NULL,
  sentence TEXT,
  paragraph TEXT,
  section_title TEXT,
  normalized_rects_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(normalized_rects_json)),
  dictionary_cache_key TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS dictionary_cache (
  cache_key TEXT PRIMARY KEY NOT NULL,
  normalized_term TEXT NOT NULL,
  provider TEXT NOT NULL,
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS local_dictionary_entries (
  normalized_term TEXT PRIMARY KEY NOT NULL,
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  source_name TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS ai_explanations (
  id TEXT PRIMARY KEY NOT NULL,
  paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  selection_id TEXT NOT NULL,
  occurrence_id TEXT REFERENCES term_occurrences(id) ON DELETE SET NULL,
  cache_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  explanation_json TEXT NOT NULL CHECK (json_valid(explanation_json)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS ai_request_logs (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  requested_at TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  error_category TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  context_hash TEXT NOT NULL,
  request_context_json TEXT CHECK (request_context_json IS NULL OR json_valid(request_context_json))
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS idx_papers_content_hash ON papers(content_hash);
CREATE INDEX IF NOT EXISTS idx_papers_last_opened ON papers(last_opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_highlights_paper_page ON highlights(paper_id, page_number);
CREATE INDEX IF NOT EXISTS idx_selections_paper_page ON selections(paper_id, page_number);
CREATE INDEX IF NOT EXISTS idx_notes_paper_page ON notes(paper_id, page_number);
CREATE INDEX IF NOT EXISTS idx_terms_normalized_text ON terms(normalized_text);
CREATE INDEX IF NOT EXISTS idx_occurrences_paper_term ON term_occurrences(paper_id, term_id);
CREATE INDEX IF NOT EXISTS idx_explanations_occurrence ON ai_explanations(occurrence_id);
CREATE INDEX IF NOT EXISTS idx_dictionary_normalized_term ON dictionary_cache(normalized_term);
CREATE INDEX IF NOT EXISTS idx_ai_logs_requested_at ON ai_request_logs(requested_at DESC);

PRAGMA user_version = 1;
