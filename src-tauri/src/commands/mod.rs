pub mod library;

use crate::error::AppError;
use crate::state::AppState;
use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;
use url::Url;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataDirectoryInfo {
    pub path: String,
    pub database_path: String,
}

#[tauri::command]
pub fn get_data_directory(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<DataDirectoryInfo, AppError> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Internal(error.to_string()))?;
    Ok(DataDirectoryInfo {
        path: path.to_string_lossy().into_owned(),
        database_path: state.database.path().to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub fn clear_extracted_text_cache(state: State<'_, AppState>) -> Result<u64, AppError> {
    let affected = state.database.connect()?.execute(
        "UPDATE paper_pages SET text_content=NULL,text_hash=NULL,extraction_status='pending'",
        [],
    )?;
    Ok(affected as u64)
}

#[tauri::command]
pub fn validate_external_url(url: String) -> Result<String, AppError> {
    let parsed =
        Url::parse(&url).map_err(|_| AppError::InvalidInput("外部链接格式无效。".into()))?;
    if !matches!(parsed.scheme(), "https" | "http") {
        return Err(AppError::InvalidInput(
            "仅允许打开 http:// 或 https:// 外部链接。".into(),
        ));
    }
    if parsed.username() != "" || parsed.password().is_some() || parsed.host_str().is_none() {
        return Err(AppError::InvalidInput(
            "外部链接包含不安全的凭据或主机。".into(),
        ));
    }
    Ok(parsed.into())
}

#[tauri::command]
pub fn open_external_url(app: AppHandle, url: String) -> Result<(), AppError> {
    let safe_url = validate_external_url(url)?;
    app.opener()
        .open_url(safe_url, None::<&str>)
        .map_err(|error| AppError::Internal(error.to_string()))
}

#[tauri::command]
pub fn reveal_data_directory(app: AppHandle) -> Result<(), AppError> {
    let path: PathBuf = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::Internal(error.to_string()))?;
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|error| AppError::Internal(error.to_string()))
}
