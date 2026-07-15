use crate::error::AppError;
use crate::state::AppState;
use chrono::Utc;
use rusqlite::params;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri::ipc::Response;
use tauri::State;
use tokio::io::AsyncReadExt;

const MAX_PDF_BYTES: u64 = 1024 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedPaper {
    pub id: String,
    pub content_hash: String,
    pub file_path: String,
    pub file_name: String,
    pub title: String,
    pub authors: Vec<String>,
    pub abstract_text: Option<String>,
    pub page_count: u32,
    pub file_size: u64,
    pub created_at: String,
    pub last_opened_at: String,
}

fn ensure_pdf_path(path: &Path) -> Result<(), AppError> {
    let is_pdf = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"));
    if !is_pdf {
        return Err(AppError::InvalidInput("只能打开 PDF 文件。".into()));
    }
    Ok(())
}

async fn inspect_pdf(path: &Path) -> Result<(String, u64), AppError> {
    ensure_pdf_path(path)?;
    let metadata = tokio::fs::metadata(path).await?;
    if !metadata.is_file() {
        return Err(AppError::InvalidInput("所选路径不是文件。".into()));
    }
    if metadata.len() == 0 || metadata.len() > MAX_PDF_BYTES {
        return Err(AppError::InvalidInput(
            "PDF 文件为空或超过 1 GiB 安全上限。".into(),
        ));
    }

    let mut file = tokio::fs::File::open(path).await?;
    let mut header = [0_u8; 1024];
    let header_length = file.read(&mut header).await?;
    if !header[..header_length]
        .windows(5)
        .any(|window| window == b"%PDF-")
    {
        return Err(AppError::InvalidInput(
            "文件不包含有效的 PDF 文件头，可能已损坏或格式不正确。".into(),
        ));
    }

    let mut hasher = Sha256::new();
    hasher.update(&header[..header_length]);
    let mut buffer = vec![0_u8; 256 * 1024];
    loop {
        let read = file.read(&mut buffer).await?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok((hex::encode(hasher.finalize()), metadata.len()))
}

#[tauri::command]
pub async fn hash_pdf(path: PathBuf) -> Result<String, AppError> {
    let canonical = tokio::fs::canonicalize(path).await?;
    inspect_pdf(&canonical).await.map(|(hash, _)| hash)
}

#[tauri::command]
pub async fn import_pdf(
    state: State<'_, AppState>,
    path: PathBuf,
) -> Result<ImportedPaper, AppError> {
    let canonical = tokio::fs::canonicalize(path).await?;
    let (content_hash, file_size) = inspect_pdf(&canonical).await?;
    let file_name = canonical
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| AppError::InvalidInput("PDF 文件名不是有效的 Unicode。".into()))?
        .to_owned();
    let title = canonical
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("Untitled paper")
        .to_owned();
    let canonical_string = canonical.to_string_lossy().into_owned();
    let paper_id = content_hash.clone();
    let now = Utc::now().to_rfc3339();
    let connection = state.database.connect()?;
    connection.execute(
        r#"INSERT INTO papers
           (id, content_hash, file_path, file_name, title, file_size, last_opened_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
           ON CONFLICT(content_hash) DO UPDATE SET
             file_path=excluded.file_path,
             file_name=excluded.file_name,
             file_size=excluded.file_size,
             last_opened_at=excluded.last_opened_at,
             updated_at=excluded.updated_at"#,
        params![
            paper_id,
            content_hash,
            canonical_string,
            file_name,
            title,
            file_size,
            now
        ],
    )?;
    connection.execute(
        "INSERT OR IGNORE INTO paper_reading_states(paper_id) VALUES(?1)",
        [&paper_id],
    )?;
    let (stored_title, authors_json, abstract_text, page_count, created_at): (
        String,
        String,
        Option<String>,
        Option<u32>,
        String,
    ) = connection.query_row(
        "SELECT COALESCE(title,file_name),authors_json,abstract_text,page_count,created_at FROM papers WHERE id=?1",
        [&paper_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
    )?;
    Ok(ImportedPaper {
        id: paper_id,
        content_hash,
        file_path: canonical_string,
        file_name,
        title: stored_title,
        authors: serde_json::from_str(&authors_json).unwrap_or_default(),
        abstract_text,
        page_count: page_count.unwrap_or(0),
        file_size,
        created_at,
        last_opened_at: now,
    })
}

#[tauri::command]
pub fn update_paper_metadata(
    state: State<'_, AppState>,
    paper_id: String,
    title: String,
    authors: Vec<String>,
    abstract_text: Option<String>,
    page_count: u32,
) -> Result<(), AppError> {
    if title.trim().is_empty()
        || title.chars().count() > 2_000
        || authors.len() > 256
        || authors.iter().any(|author| author.chars().count() > 500)
        || abstract_text
            .as_ref()
            .is_some_and(|value| value.chars().count() > 100_000)
        || page_count > 100_000
    {
        return Err(AppError::InvalidInput("论文元数据超出允许范围。".into()));
    }
    let affected = state.database.connect()?.execute(
        r#"UPDATE papers SET title=?2,authors_json=?3,abstract_text=?4,page_count=?5,
           updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?1"#,
        params![
            paper_id,
            title.trim(),
            serde_json::to_string(&authors)?,
            abstract_text,
            page_count
        ],
    )?;
    if affected == 0 {
        return Err(AppError::NotFound("未找到这篇论文。".into()));
    }
    Ok(())
}

async fn read_validated_pdf(path: PathBuf) -> Result<Vec<u8>, AppError> {
    let canonical = tokio::fs::canonicalize(path).await?;
    inspect_pdf(&canonical).await?;
    Ok(tokio::fs::read(canonical).await?)
}

#[tauri::command]
pub async fn read_pdf(path: PathBuf) -> Result<Response, AppError> {
    Ok(Response::new(read_validated_pdf(path).await?))
}

#[tauri::command]
pub async fn read_pdf_by_id(
    state: State<'_, AppState>,
    paper_id: String,
) -> Result<Response, AppError> {
    let path: String = state
        .database
        .connect()?
        .query_row(
            "SELECT file_path FROM papers WHERE id=?1",
            [&paper_id],
            |row| row.get(0),
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("未找到这篇论文。".into()),
            other => AppError::Database(other),
        })?;
    Ok(Response::new(
        read_validated_pdf(PathBuf::from(path)).await?,
    ))
}

#[tauri::command]
pub async fn read_pdf_bytes(
    state: State<'_, AppState>,
    paper_id: Option<String>,
    path: Option<PathBuf>,
) -> Result<Response, AppError> {
    match (paper_id, path) {
        (Some(paper_id), None) => read_pdf_by_id(state, paper_id).await,
        (None, Some(path)) => read_pdf(path).await,
        _ => Err(AppError::InvalidInput(
            "read_pdf_bytes 需要且仅需要 paperId 或 path。".into(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[tokio::test]
    async fn rejects_non_pdf_content_even_with_pdf_extension() {
        let mut file = tempfile::Builder::new().suffix(".pdf").tempfile().unwrap();
        file.write_all(b"not a PDF").unwrap();
        assert!(matches!(
            inspect_pdf(file.path()).await,
            Err(AppError::InvalidInput(_))
        ));
    }

    #[tokio::test]
    async fn hashes_pdf_content_deterministically() {
        let mut file = NamedTempFile::with_suffix(".pdf").unwrap();
        file.write_all(b"%PDF-1.7\nminimal-test-content").unwrap();
        let (first, _) = inspect_pdf(file.path()).await.unwrap();
        let (second, _) = inspect_pdf(file.path()).await.unwrap();
        assert_eq!(first, second);
        assert_eq!(first.len(), 64);
    }
}
