use crate::database::Database;
use crate::dictionary::DictionaryResult;
use dashmap::DashMap;
use reqwest::Client;
use std::sync::Arc;
use std::time::Duration;
use tokio_util::sync::CancellationToken;

#[derive(Clone)]
pub struct AppState {
    pub database: Database,
    pub http: Client,
    pub ai_cancellations: Arc<DashMap<String, CancellationToken>>,
    pub dictionary_memory_cache: Arc<DashMap<String, DictionaryResult>>,
}

impl AppState {
    pub fn new(database: Database) -> Result<Self, reqwest::Error> {
        let http = Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(90))
            .user_agent(concat!("PaperLens/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(Self {
            database,
            http,
            ai_cancellations: Arc::new(DashMap::new()),
            dictionary_memory_cache: Arc::new(DashMap::new()),
        })
    }
}
