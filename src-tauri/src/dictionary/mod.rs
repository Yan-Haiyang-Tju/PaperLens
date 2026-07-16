use crate::database::Database;
use crate::error::AppError;
use crate::state::AppState;
use async_trait::async_trait;
use chrono::{Duration, Utc};
use reqwest::Client;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
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

pub struct BundledDictionaryProvider {
    path: PathBuf,
}

type BundledEntry = (String, Option<String>, String, Option<String>);

impl BundledDictionaryProvider {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    fn connection(&self) -> Result<Connection, AppError> {
        if !self.path.is_file() {
            return Err(AppError::NotFound(
                "内置 ECDICT 资源缺失，请重新安装 PaperLens。".into(),
            ));
        }
        Ok(Connection::open_with_flags(
            &self.path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?)
    }
}

fn query_bundled_entry(
    connection: &Connection,
    term: &str,
) -> Result<Option<BundledEntry>, AppError> {
    Ok(connection
        .query_row(
            "SELECT term,phonetic,translation,pos FROM entries WHERE term=?1",
            [term],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()?)
}

fn algorithmic_lemma_candidates(term: &str) -> Vec<String> {
    let mut candidates = Vec::new();
    let mut add = |candidate: String| {
        if candidate.len() >= 2 && candidate != term && !candidates.contains(&candidate) {
            candidates.push(candidate);
        }
    };

    let irregular = [
        ("children", "child"),
        ("men", "man"),
        ("women", "woman"),
        ("teeth", "tooth"),
        ("feet", "foot"),
        ("mice", "mouse"),
        ("geese", "goose"),
        ("analyses", "analysis"),
        ("indices", "index"),
        ("matrices", "matrix"),
        ("criteria", "criterion"),
        ("phenomena", "phenomenon"),
        ("hypotheses", "hypothesis"),
        ("theses", "thesis"),
    ];
    if let Some((_, lemma)) = irregular.iter().find(|(form, _)| *form == term) {
        add((*lemma).into());
    }

    if let Some(stem) = term.strip_suffix("ies") {
        add(format!("{stem}y"));
    }
    if let Some(stem) = term.strip_suffix("ied") {
        add(format!("{stem}y"));
    }
    if let Some(stem) = term.strip_suffix("ves") {
        add(format!("{stem}f"));
        add(format!("{stem}fe"));
    }
    for suffix in ["ing", "ed"] {
        if let Some(stem) = term.strip_suffix(suffix) {
            add(stem.into());
            add(format!("{stem}e"));
            let mut chars = stem.chars().rev();
            if let (Some(last), Some(before_last)) = (chars.next(), chars.next()) {
                if last == before_last {
                    add(stem[..stem.len() - last.len_utf8()].into());
                }
            }
        }
    }
    if let Some(stem) = term.strip_suffix("es") {
        add(stem.into());
        add(format!("{stem}e"));
    }
    if let Some(stem) = term.strip_suffix('s') {
        add(stem.into());
    }
    candidates
}

fn part_of_speech_label(pos: Option<&str>) -> Option<String> {
    let labels = pos?
        .split('/')
        .filter_map(|item| item.split(':').next())
        .filter(|item| !item.is_empty())
        .take(4)
        .collect::<Vec<_>>();
    (!labels.is_empty()).then(|| labels.join(" · "))
}

fn bundled_result(requested_term: &str, entry: BundledEntry) -> DictionaryResult {
    let (lemma, phonetic, translation, pos) = entry;
    let definitions_zh = translation
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .take(10)
        .map(ToOwned::to_owned)
        .collect();
    DictionaryResult {
        term: requested_term.into(),
        phonetic,
        meanings: vec![DictionaryMeaning {
            part_of_speech: part_of_speech_label(pos.as_deref()),
            definitions_zh,
        }],
        lemma: (requested_term != lemma).then_some(lemma),
        source: "ECDICT（内置离线）".into(),
        cached_at: None,
    }
}

#[async_trait]
impl DictionaryProvider for BundledDictionaryProvider {
    async fn lookup(&self, term: &str) -> Result<Option<DictionaryResult>, AppError> {
        let normalized = normalize_term(term)?;
        let connection = self.connection()?;
        if let Some(entry) = query_bundled_entry(&connection, &normalized)? {
            return Ok(Some(bundled_result(&normalized, entry)));
        }

        let stored_lemma: Option<String> = connection
            .query_row(
                "SELECT lemma FROM forms WHERE form=?1",
                [&normalized],
                |row| row.get(0),
            )
            .optional()?;
        let candidates = stored_lemma
            .into_iter()
            .chain(algorithmic_lemma_candidates(&normalized));
        for lemma in candidates {
            if let Some(entry) = query_bundled_entry(&connection, &lemma)? {
                return Ok(Some(bundled_result(&normalized, entry)));
            }
        }
        Ok(None)
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
    let bundled = BundledDictionaryProvider::new(state.bundled_dictionary_path.clone());
    if let Some(result) = bundled.lookup(&normalized).await? {
        store_cache(&state.database, "ecdict-bundled", &normalized, &result)?;
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
/// memory cache -> SQLite cache -> imported dictionary -> bundled ECDICT -> configured URL.
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
    state.dictionary_memory_cache.clear();
    state
        .database
        .connect()?
        .execute("DELETE FROM dictionary_cache", [])?;
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

    #[test]
    fn generates_common_inflection_candidates() {
        assert!(algorithmic_lemma_candidates("studies").contains(&"study".into()));
        assert!(algorithmic_lemma_candidates("trained").contains(&"train".into()));
        assert!(algorithmic_lemma_candidates("running").contains(&"run".into()));
        assert!(algorithmic_lemma_candidates("analyses").contains(&"analysis".into()));
    }

    #[test]
    fn queries_bundled_entries_and_database_lemmas() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("ecdict.sqlite3");
        let connection = Connection::open(&path).unwrap();
        connection
            .execute_batch(
                "CREATE TABLE entries(term TEXT PRIMARY KEY,phonetic TEXT,translation TEXT NOT NULL,pos TEXT) WITHOUT ROWID;
                 CREATE TABLE forms(form TEXT PRIMARY KEY,lemma TEXT NOT NULL) WITHOUT ROWID;
                 INSERT INTO entries VALUES('study','stʌdi','n. 学习\nv. 研究','n:60/v:40');
                 INSERT INTO forms VALUES('studied','study');",
            )
            .unwrap();
        drop(connection);
        let provider = BundledDictionaryProvider::new(path);
        let result = tauri::async_runtime::block_on(provider.lookup("studied"))
            .unwrap()
            .unwrap();
        assert_eq!(result.lemma.as_deref(), Some("study"));
        assert_eq!(result.meanings[0].definitions_zh, ["n. 学习", "v. 研究"]);
        assert_eq!(result.source, "ECDICT（内置离线）");
    }

    #[test]
    fn queries_the_shipped_dictionary_resource() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("ecdict.sqlite3");
        let provider = BundledDictionaryProvider::new(path);
        for term in ["transformer", "convolution", "trained", "analyses"] {
            let result = tauri::async_runtime::block_on(provider.lookup(term))
                .unwrap()
                .unwrap_or_else(|| panic!("missing shipped dictionary term: {term}"));
            assert!(!result.meanings[0].definitions_zh.is_empty());
        }
    }
}
