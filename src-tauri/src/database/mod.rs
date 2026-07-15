use crate::error::AppError;
use rusqlite::{Connection, OpenFlags};
use std::path::{Path, PathBuf};

pub const DATABASE_NAME: &str = "paperlens.db";
pub const DATABASE_URL: &str = "sqlite:paperlens.db";
pub const INITIAL_MIGRATION: &str = include_str!("../../migrations/0001_initial.sql");

#[derive(Clone, Debug)]
pub struct Database {
    path: PathBuf,
}

impl Database {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn connect(&self) -> Result<Connection, AppError> {
        let connection = Connection::open_with_flags(
            &self.path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        configure_connection(&connection)?;
        Ok(connection)
    }

    pub fn migrate(&self) -> Result<(), AppError> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let connection = self.connect()?;
        connection.execute_batch(INITIAL_MIGRATION)?;
        Ok(())
    }
}

pub fn configure_connection(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.pragma_update(None, "journal_mode", "WAL")?;
    connection.pragma_update(None, "busy_timeout", 5000_i64)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use tempfile::tempdir;

    fn test_db() -> (tempfile::TempDir, Database) {
        let directory = tempdir().unwrap();
        let database = Database::new(directory.path().join("test.db"));
        database.migrate().unwrap();
        (directory, database)
    }

    #[test]
    fn migration_creates_expected_schema_and_version() {
        let (_directory, db) = test_db();
        let connection = db.connect().unwrap();
        let version: i64 = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        let table_count: i64 = connection
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('papers','highlights','notes','terms','term_occurrences','ai_explanations')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(version, 1);
        assert_eq!(table_count, 6);
    }

    #[test]
    fn paper_deletion_cascades_annotations_and_occurrences() {
        let (_directory, db) = test_db();
        let connection = db.connect().unwrap();
        connection.execute(
            "INSERT INTO papers(id,content_hash,file_path,file_name,file_size) VALUES('p','hash','paper.pdf','paper.pdf',1)",
            [],
        ).unwrap();
        connection.execute(
            "INSERT INTO highlights(id,paper_id,page_number,selected_text,normalized_rects_json,color) VALUES('h','p',1,'term','[]','yellow')",
            [],
        ).unwrap();
        connection.execute(
            "INSERT INTO notes(id,paper_id,page_number,highlight_id,content_markdown) VALUES('n','p',1,'h','note')",
            [],
        ).unwrap();
        connection
            .execute(
                "INSERT INTO terms(id,normalized_text,display_text) VALUES('t','term','Term')",
                [],
            )
            .unwrap();
        connection.execute(
            "INSERT INTO term_occurrences(id,term_id,paper_id,page_number,selected_text) VALUES('o','t','p',1,'Term')",
            [],
        ).unwrap();
        connection
            .execute("DELETE FROM papers WHERE id='p'", [])
            .unwrap();
        for table in ["highlights", "notes", "term_occurrences"] {
            let count: i64 = connection
                .query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(count, 0, "{table} should cascade");
        }
    }

    #[test]
    fn note_update_and_term_occurrence_relationship_are_persisted() {
        let (_directory, db) = test_db();
        let connection = db.connect().unwrap();
        connection.execute(
            "INSERT INTO papers(id,content_hash,file_path,file_name,file_size) VALUES('p','hash','paper.pdf','paper.pdf',1)",
            [],
        ).unwrap();
        connection.execute(
            "INSERT INTO notes(id,paper_id,page_number,content_markdown) VALUES('n','p',1,'first')",
            [],
        ).unwrap();
        connection
            .execute(
                "UPDATE notes SET content_markdown=?1 WHERE id='n'",
                ["updated"],
            )
            .unwrap();
        connection.execute(
            "INSERT INTO terms(id,normalized_text,display_text) VALUES('t','compliance','compliance')",
            [],
        ).unwrap();
        connection.execute(
            "INSERT INTO term_occurrences(id,term_id,paper_id,page_number,selected_text) VALUES('o','t','p',2,'compliance')",
            [],
        ).unwrap();
        let (content, relation): (String, String) = connection.query_row(
            "SELECT n.content_markdown, t.normalized_text FROM notes n CROSS JOIN term_occurrences o JOIN terms t ON t.id=o.term_id WHERE n.id=?1 AND o.id=?2",
            params!["n", "o"],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).unwrap();
        assert_eq!(content, "updated");
        assert_eq!(relation, "compliance");
    }
}
