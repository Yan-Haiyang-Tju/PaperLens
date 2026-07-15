use crate::database::Database;
use crate::error::AppError;
use crate::state::AppState;
use async_trait::async_trait;
use chrono::{Duration, Utc};
use reqwest::Client;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::State;
use url::Url;

const MAX_REMOTE_DICTIONARY_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryMeaning {
    pub part_of_speech: Option<String>,
    pub definitions_zh: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryResult {
    pub term: String,
    pub phonetic: Option<String>,
    pub meanings: Vec<DictionaryMeaning>,
    pub lemma: Option<String>,
    pub source: String,
    pub cached_at: Option<String>,
}

#[async_trait]
pub trait DictionaryProvider: Send + Sync {
    async fn lookup(&self, term: &str) -> Result<Option<DictionaryResult>, AppError>;
}

pub struct LocalDictionaryProvider {
    database: Database,
}

impl LocalDictionaryProvider {
    pub fn new(database: Database) -> Self {
        Self { database }
    }
}

#[async_trait]
impl DictionaryProvider for LocalDictionaryProvider {
    async fn lookup(&self, term: &str) -> Result<Option<DictionaryResult>, AppError> {
        let normalized = normalize_term(term)?;
        let serialized: Option<String> = self
            .database
            .connect()?
            .query_row(
                "SELECT result_json FROM local_dictionary_entries WHERE normalized_term=?1",
                [&normalized],
                |row| row.get(0),
            )
            .optional()?;
        serialized
            .map(|value| serde_json::from_str(&value).map_err(AppError::from))
            .transpose()
    }
}

pub struct RemoteDictionaryProvider {
    client: Client,
    url_template: String,
}

impl RemoteDictionaryProvider {
    pub fn new(client: Client, url_template: String) -> Self {
        Self {
            client,
            url_template,
        }
    }

    fn url(&self, term: &str) -> Result<Url, AppError> {
        let encoded: String = url::form_urlencoded::byte_serialize(term.as_bytes()).collect();
        let rendered = if self.url_template.contains("{term}") {
            self.url_template.replace("{term}", &encoded)
        } else {
            format!(
                "{}{}term={encoded}",
                self.url_template,
                if self.url_template.contains('?') {
                    "&"
                } else {
                    "?"
                }
            )
        };
        let url = Url::parse(&rendered)
            .map_err(|_| AppError::InvalidInput("词典服务地址无效。".into()))?;
        let is_local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1"));
        if url.scheme() != "https" && !(url.scheme() == "http" && is_local) {
            return Err(AppError::InvalidInput(
                "词典服务必须使用 HTTPS；本机 localhost 服务可使用 HTTP。".into(),
            ));
        }
        Ok(url)
    }
}

#[async_trait]
impl DictionaryProvider for RemoteDictionaryProvider {
    async fn lookup(&self, term: &str) -> Result<Option<DictionaryResult>, AppError> {
        let response = self
            .client
            .get(self.url(term)?)
            .header(reqwest::header::ACCEPT, "application/json")
            .send()
            .await
            .map_err(|error| AppError::Network(error.to_string()))?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(None);
        }
        if !response.status().is_success() {
            return Err(AppError::Network(format!(
                "dictionary service returned {}",
                response.status()
            )));
        }
        if response.content_length().unwrap_or(0) > MAX_REMOTE_DICTIONARY_BYTES {
            return Err(AppError::InvalidResponse(
                "词典服务响应超过 2 MiB 上限。".into(),
            ));
        }
        let bytes = response
            .bytes()
            .await
            .map_err(|error| AppError::Network(error.to_string()))?;
        if bytes.len() as u64 > MAX_REMOTE_DICTIONARY_BYTES {
            return Err(AppError::InvalidResponse(
                "词典服务响应超过 2 MiB 上限。".into(),
            ));
        }
        parse_remote_result(term, &bytes)
    }
}

fn parse_remote_result(term: &str, bytes: &[u8]) -> Result<Option<DictionaryResult>, AppError> {
    let value: serde_json::Value = serde_json::from_slice(bytes)?;
    if value.is_null() {
        return Ok(None);
    }
    if let Ok(mut canonical) = serde_json::from_value::<DictionaryResult>(value.clone()) {
        canonical.source = "remote".into();
        return Ok(Some(canonical));
    }

    // Also accept the widely used dictionaryapi.dev shape. Its definitions may be
    // English; the UI labels the provider source and never presents this as AI output.
    let first = value
        .as_array()
        .and_then(|items| items.first())
        .ok_or_else(|| AppError::InvalidResponse("词典响应不包含词条。".into()))?;
    let phonetic = first
        .get("phonetic")
        .and_then(serde_json::Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| {
            first
                .get("phonetics")?
                .as_array()?
                .iter()
                .filter_map(|item| item.get("text")?.as_str())
                .next()
                .map(ToOwned::to_owned)
        });
    let meanings = first
        .get("meanings")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|meaning| {
            let definitions_zh: Vec<String> = meaning
                .get("definitions")?
                .as_array()?
                .iter()
                .filter_map(|definition| definition.get("definition")?.as_str())
                .take(5)
                .map(ToOwned::to_owned)
                .collect();
            (!definitions_zh.is_empty()).then(|| DictionaryMeaning {
                part_of_speech: meaning
                    .get("partOfSpeech")
                    .and_then(serde_json::Value::as_str)
                    .map(ToOwned::to_owned),
                definitions_zh,
            })
        })
        .collect::<Vec<_>>();
    if meanings.is_empty() {
        return Ok(None);
    }
    Ok(Some(DictionaryResult {
        term: first
            .get("word")
            .and_then(serde_json::Value::as_str)
            .unwrap_or(term)
            .to_owned(),
        phonetic,
        meanings,
        lemma: None,
        source: "remote".into(),
        cached_at: None,
    }))
}

pub fn normalize_term(term: &str) -> Result<String, AppError> {
    let normalized = term
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    if normalized.is_empty() || normalized.chars().count() > 256 {
        return Err(AppError::InvalidInput(
            "查询内容不能为空且不能超过 256 个字符。".into(),
        ));
    }
    Ok(normalized)
}

fn cache_key(provider: &str, normalized_term: &str) -> String {
    hex::encode(Sha256::digest(
        format!("{provider}\0{normalized_term}").as_bytes(),
    ))
}

fn cached_lookup(
    database: &Database,
    normalized_term: &str,
) -> Result<Option<DictionaryResult>, AppError> {
    let serialized: Option<String> = database
        .connect()?
        .query_row(
            "SELECT result_json FROM dictionary_cache WHERE normalized_term=?1 AND (expires_at IS NULL OR expires_at > ?2) ORDER BY created_at DESC LIMIT 1",
            params![normalized_term, Utc::now().to_rfc3339()],
            |row| row.get(0),
        )
        .optional()?;
    serialized
        .map(|value| serde_json::from_str(&value).map_err(AppError::from))
        .transpose()
}

fn store_cache(
    database: &Database,
    provider: &str,
    normalized_term: &str,
    result: &DictionaryResult,
) -> Result<(), AppError> {
    database.connect()?.execute(
        r#"INSERT INTO dictionary_cache(cache_key,normalized_term,provider,result_json,expires_at)
           VALUES(?1,?2,?3,?4,?5)
           ON CONFLICT(cache_key) DO UPDATE SET result_json=excluded.result_json,
             created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), expires_at=excluded.expires_at"#,
        params![
            cache_key(provider, normalized_term),
            normalized_term,
            provider,
            serde_json::to_string(result)?,
            (Utc::now() + Duration::days(30)).to_rfc3339()
        ],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn lookup_dictionary(
    state: State<'_, AppState>,
    term: String,
    remote_url_template: Option<String>,
) -> Result<Option<DictionaryResult>, AppError> {
    let normalized = normalize_term(&term)?;
    if let Some(result) = state.dictionary_memory_cache.get(&normalized) {
        let mut cached = result.clone();
        cached.source = "memory-cache".into();
        return Ok(Some(cached));
    }
    if let Some(mut result) = cached_lookup(&state.database, &normalized)? {
        result.source = "sqlite-cache".into();
        state
            .dictionary_memory_cache
            .insert(normalized, result.clone());
        return Ok(Some(result));
    }
    let local = LocalDictionaryProvider::new(state.database.clone());
    if let Some(mut result) = local.lookup(&normalized).await? {
        result.source = "local-import".into();
        store_cache(&state.database, "local-import", &normalized, &result)?;
        state
            .dictionary_memory_cache
            .insert(normalized, result.clone());
        return Ok(Some(result));
    }
    if let Some(template) = remote_url_template.filter(|value| !value.trim().is_empty()) {
        let remote = RemoteDictionaryProvider::new(state.http.clone(), template);
        if let Some(mut result) = remote.lookup(&normalized).await? {
            result.cached_at = Some(Utc::now().to_rfc3339());
            store_cache(&state.database, "remote", &normalized, &result)?;
            state
                .dictionary_memory_cache
                .insert(normalized, result.clone());
            return Ok(Some(result));
        }
    }
    Ok(None)
}

/// Frontend-compatible entrypoint. It still honors the required lookup order:
/// memory cache -> SQLite cache -> imported local dictionary -> configured URL.
#[tauri::command]
pub async fn remote_dictionary_lookup(
    state: State<'_, AppState>,
    url: String,
    term: String,
) -> Result<Option<DictionaryResult>, AppError> {
    lookup_dictionary(state, term, Some(url)).await
}

#[tauri::command]
pub fn clear_dictionary_cache(state: State<'_, AppState>) -> Result<(), AppError> {
    state.dictionary_memory_cache.clear();
    state
        .database
        .connect()?
        .execute("DELETE FROM dictionary_cache", [])?;
    Ok(())
}

#[tauri::command]
pub async fn import_local_dictionary(
    state: State<'_, AppState>,
    path: PathBuf,
    source_name: String,
) -> Result<usize, AppError> {
    if source_name.trim().is_empty() {
        return Err(AppError::InvalidInput(
            "请提供词典来源名称和许可证信息。".into(),
        ));
    }
    let bytes = tokio::fs::read(&path).await?;
    if bytes.len() > 128 * 1024 * 1024 {
        return Err(AppError::InvalidInput("词典文件超过 128 MiB 上限。".into()));
    }
    let results: Vec<DictionaryResult> = serde_json::from_slice(&bytes).map_err(|_| {
        AppError::InvalidInput("本地词典应为 DictionaryResult 对象组成的 UTF-8 JSON 数组。".into())
    })?;
    let mut connection = state.database.connect()?;
    let transaction = connection.transaction()?;
    for result in &results {
        let normalized = normalize_term(&result.term)?;
        transaction.execute(
            r#"INSERT INTO local_dictionary_entries(normalized_term,result_json,source_name)
               VALUES(?1,?2,?3) ON CONFLICT(normalized_term) DO UPDATE SET
               result_json=excluded.result_json,source_name=excluded.source_name,
               imported_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')"#,
            params![normalized, serde_json::to_string(result)?, source_name],
        )?;
    }
    transaction.commit()?;
    Ok(results.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_terms_without_losing_internal_hyphens() {
        assert_eq!(
            normalize_term("  Vision-Language-Action \n ").unwrap(),
            "vision-language-action"
        );
    }

    #[test]
    fn parses_canonical_remote_result() {
        let raw = r#"{"term":"compliance","phonetic":null,"meanings":[{"partOfSpeech":"noun","definitionsZh":["顺应性"]}],"lemma":null,"source":"custom","cachedAt":null}"#;
        let parsed = parse_remote_result("compliance", raw.as_bytes())
            .unwrap()
            .unwrap();
        assert_eq!(parsed.meanings[0].definitions_zh[0], "顺应性");
        assert_eq!(parsed.source, "remote");
    }
}
