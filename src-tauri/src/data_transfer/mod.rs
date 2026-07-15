use crate::database::{configure_connection, INITIAL_MIGRATION};
use crate::error::AppError;
use crate::state::AppState;
use chrono::Utc;
use rusqlite::{backup::Backup, Connection};
use serde::Serialize;
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::State;
use uuid::Uuid;
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferResult {
    pub path: String,
    pub bytes_written: u64,
}

fn validate_destination(path: &Path, expected_extension: &str) -> Result<(), AppError> {
    if path
        .extension()
        .and_then(|value| value.to_str())
        .is_none_or(|value| !value.eq_ignore_ascii_case(expected_extension))
    {
        return Err(AppError::InvalidInput(format!(
            "目标文件必须使用 .{expected_extension} 扩展名。"
        )));
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    Ok(())
}

fn snapshot_database(source: &Path, destination: &Path) -> Result<(), AppError> {
    let source_connection = Connection::open(source)?;
    configure_connection(&source_connection)?;
    source_connection.execute_batch("PRAGMA wal_checkpoint(FULL);")?;
    let mut destination_connection = Connection::open(destination)?;
    let backup = Backup::new(&source_connection, &mut destination_connection)?;
    backup.run_to_completion(100, std::time::Duration::from_millis(5), None)?;
    Ok(())
}

#[tauri::command]
pub async fn backup_database(
    state: State<'_, AppState>,
    destination: PathBuf,
) -> Result<TransferResult, AppError> {
    let source = state.database.path().to_owned();
    tokio::task::spawn_blocking(move || {
        validate_destination(&destination, "db")?;
        snapshot_database(&source, &destination)?;
        let size = std::fs::metadata(&destination)?.len();
        Ok(TransferResult {
            path: destination.to_string_lossy().into_owned(),
            bytes_written: size,
        })
    })
    .await
    .map_err(|error| AppError::Internal(error.to_string()))?
}

#[tauri::command]
pub async fn export_data(
    state: State<'_, AppState>,
    destination: PathBuf,
) -> Result<TransferResult, AppError> {
    let source = state.database.path().to_owned();
    tokio::task::spawn_blocking(move || {
        validate_destination(&destination, "paperlens")?;
        let temporary =
            std::env::temp_dir().join(format!("paperlens-export-{}.db", Uuid::new_v4().simple()));
        snapshot_database(&source, &temporary)?;
        let operation = (|| -> Result<TransferResult, AppError> {
            let output = File::create(&destination)?;
            let mut archive = ZipWriter::new(output);
            let options = SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated)
                .unix_permissions(0o600);
            archive
                .start_file("paperlens.db", options)
                .map_err(|error| AppError::Io(std::io::Error::other(error)))?;
            let mut database_file = File::open(&temporary)?;
            std::io::copy(&mut database_file, &mut archive)?;
            archive
                .start_file("manifest.json", options)
                .map_err(|error| AppError::Io(std::io::Error::other(error)))?;
            let manifest = serde_json::json!({
                "format": "paperlens-export",
                "version": 1,
                "createdAt": Utc::now().to_rfc3339(),
                "containsApiKeys": false,
                "containsPdfFiles": false
            });
            archive.write_all(serde_json::to_string_pretty(&manifest)?.as_bytes())?;
            archive
                .finish()
                .map_err(|error| AppError::Io(std::io::Error::other(error)))?;
            let size = std::fs::metadata(&destination)?.len();
            Ok(TransferResult {
                path: destination.to_string_lossy().into_owned(),
                bytes_written: size,
            })
        })();
        let _ = std::fs::remove_file(temporary);
        operation
    })
    .await
    .map_err(|error| AppError::Internal(error.to_string()))?
}

fn validate_import_database(path: &Path) -> Result<(), AppError> {
    let connection = Connection::open(path)?;
    connection.execute_batch("PRAGMA foreign_keys=ON;")?;
    let integrity: String = connection.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(AppError::InvalidInput(
            "导入文件中的数据库未通过完整性检查。".into(),
        ));
    }
    let required: i64 = connection.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('papers','app_settings','highlights','notes')",
        [],
        |row| row.get(0),
    )?;
    if required != 4 {
        return Err(AppError::InvalidInput(
            "导入文件不是受支持的 PaperLens 数据。".into(),
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn import_data(
    state: State<'_, AppState>,
    source: PathBuf,
) -> Result<TransferResult, AppError> {
    let database_path = state.database.path().to_owned();
    tokio::task::spawn_blocking(move || {
        if !source.is_file() {
            return Err(AppError::InvalidInput("导入文件不存在。".into()));
        }
        let extracted =
            std::env::temp_dir().join(format!("paperlens-import-{}.db", Uuid::new_v4().simple()));
        let operation = (|| -> Result<TransferResult, AppError> {
            match source.extension().and_then(|value| value.to_str()) {
                Some(value) if value.eq_ignore_ascii_case("db") => {
                    std::fs::copy(&source, &extracted)?;
                }
                Some(value) if value.eq_ignore_ascii_case("paperlens") => {
                    let input = File::open(&source)?;
                    let mut archive = ZipArchive::new(input)
                        .map_err(|error| AppError::InvalidInput(error.to_string()))?;
                    let mut manifest_text = String::new();
                    archive
                        .by_name("manifest.json")
                        .map_err(|_| AppError::InvalidInput("导出包缺少 manifest.json。".into()))?
                        .read_to_string(&mut manifest_text)?;
                    let manifest: serde_json::Value = serde_json::from_str(&manifest_text)?;
                    if manifest.get("format").and_then(|value| value.as_str())
                        != Some("paperlens-export")
                    {
                        return Err(AppError::InvalidInput("不支持的导出包格式。".into()));
                    }
                    let mut archived_database = archive
                        .by_name("paperlens.db")
                        .map_err(|_| AppError::InvalidInput("导出包缺少数据库。".into()))?;
                    let mut output = File::create(&extracted)?;
                    std::io::copy(&mut archived_database, &mut output)?;
                }
                _ => {
                    return Err(AppError::InvalidInput(
                        "仅支持 .paperlens 或 .db 导入文件。".into(),
                    ))
                }
            }
            validate_import_database(&extracted)?;

            let pre_import = database_path.with_extension(format!(
                "pre-import-{}.db",
                Utc::now().format("%Y%m%d-%H%M%S")
            ));
            if database_path.exists() {
                snapshot_database(&database_path, &pre_import)?;
            }
            snapshot_database(&extracted, &database_path)?;
            let connection = Connection::open(&database_path)?;
            configure_connection(&connection)?;
            connection.execute_batch(INITIAL_MIGRATION)?;
            Ok(TransferResult {
                path: database_path.to_string_lossy().into_owned(),
                bytes_written: std::fs::metadata(&database_path)?.len(),
            })
        })();
        let _ = std::fs::remove_file(extracted);
        operation
    })
    .await
    .map_err(|error| AppError::Internal(error.to_string()))?
}
