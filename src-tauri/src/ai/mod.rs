pub mod compatible;
pub mod error;
pub mod mock;
pub mod openai_responses;
pub mod provider;
pub mod types;

use crate::ai::compatible::GenericOpenAiCompatibleProvider;
use crate::ai::error::AiError;
use crate::ai::mock::MockAiProvider;
use crate::ai::openai_responses::OpenAiResponsesProvider;
use crate::ai::provider::AiProvider;
use crate::ai::types::{
    build_provider_input, cache_key, context_hash, validate_request, AiExplanation, AiStreamEvent,
    ExplainSelectionRequest, ExplainSelectionResponse, PROMPT_VERSION,
};
use crate::error::AppError;
use crate::secure_store;
use crate::state::AppState;
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::time::Instant;
use tauri::ipc::Channel;
use tauri::State;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use url::Url;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AiProviderKind {
    Openai,
    OpenaiCompatible,
    Mock,
}

impl AiProviderKind {
    fn secure_store_name(&self) -> &'static str {
        match self {
            Self::Openai => "openai",
            Self::OpenaiCompatible => "openai-compatible",
            Self::Mock => "mock",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    pub provider: AiProviderKind,
    pub base_url: String,
    pub model: String,
    #[serde(default)]
    pub api_key_configured: bool,
    pub temperature: f64,
    pub max_output_tokens: u32,
    pub stream: bool,
    #[serde(default)]
    pub save_request_context: bool,
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            provider: AiProviderKind::Openai,
            base_url: "https://api.openai.com/v1".into(),
            model: "gpt-4.1-mini".into(),
            api_key_configured: false,
            temperature: 0.2,
            max_output_tokens: 1600,
            stream: true,
            save_request_context: false,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiStatus {
    pub configured: bool,
    pub provider: AiProviderKind,
    pub model: String,
    pub stream: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub ok: bool,
    pub provider: String,
    pub model: String,
    pub latency_ms: u128,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplainCommandResult {
    pub request_id: String,
    pub explanation_id: String,
    pub cached: bool,
}

fn load_settings(state: &AppState) -> Result<AiSettings, AppError> {
    let serialized: Option<String> = state
        .database
        .connect()?
        .query_row(
            "SELECT value_json FROM app_settings WHERE key='ai.settings'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    match serialized {
        Some(value) => serde_json::from_str(&value)
            .map_err(|error| AppError::InvalidResponse(error.to_string())),
        None => Ok(AiSettings::default()),
    }
}

fn validate_settings(settings: &AiSettings) -> Result<(), AppError> {
    if settings.model.trim().is_empty()
        || settings.model.len() > 256
        || !settings.temperature.is_finite()
        || !(0.0..=2.0).contains(&settings.temperature)
        || !(128..=32_768).contains(&settings.max_output_tokens)
    {
        return Err(AppError::InvalidInput(
            "AI 设置中的模型或生成参数无效。".into(),
        ));
    }
    if settings.provider == AiProviderKind::Mock {
        if cfg!(debug_assertions) {
            return Ok(());
        }
        return Err(AppError::InvalidInput(
            "Mock Provider 仅在开发和自动测试构建中可用。".into(),
        ));
    }
    let url = Url::parse(&settings.base_url)
        .map_err(|_| AppError::InvalidInput("AI Base URL 无效。".into()))?;
    let is_local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1"));
    if url.scheme() != "https" && !(url.scheme() == "http" && is_local) {
        return Err(AppError::InvalidInput(
            "AI Base URL 必须使用 HTTPS；本机 localhost 服务可使用 HTTP。".into(),
        ));
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err(AppError::InvalidInput(
            "AI Base URL 不能包含查询参数或 URL fragment。".into(),
        ));
    }
    Ok(())
}

#[tauri::command]
pub async fn get_ai_settings(state: State<'_, AppState>) -> Result<AiSettings, AppError> {
    let mut settings = load_settings(&state)?;
    settings.api_key_configured = if settings.provider == AiProviderKind::Mock {
        cfg!(debug_assertions)
    } else {
        secure_store::api_key_configured(settings.provider.secure_store_name().into()).await?
    };
    Ok(settings)
}

#[tauri::command]
pub async fn get_ai_status(state: State<'_, AppState>) -> Result<AiStatus, AppError> {
    let settings = get_ai_settings(state).await?;
    Ok(AiStatus {
        configured: settings.api_key_configured,
        provider: settings.provider,
        model: settings.model,
        stream: settings.stream,
    })
}

#[tauri::command]
pub fn update_ai_settings(
    state: State<'_, AppState>,
    mut settings: AiSettings,
) -> Result<(), AppError> {
    validate_settings(&settings)?;
    settings.api_key_configured = false;
    let serialized = serde_json::to_string(&settings)?;
    state.database.connect()?.execute(
        r#"INSERT INTO app_settings(key,value_json) VALUES('ai.settings',?1)
           ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,
           updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')"#,
        [&serialized],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn set_api_key(
    state: State<'_, AppState>,
    provider: Option<AiProviderKind>,
    api_key: String,
) -> Result<(), AppError> {
    let provider = provider.unwrap_or(load_settings(&state)?.provider);
    if provider == AiProviderKind::Mock {
        return Err(AppError::InvalidInput(
            "Mock Provider 不使用 API Key。".into(),
        ));
    }
    secure_store::set_api_key(provider.secure_store_name().into(), api_key).await
}

#[tauri::command]
pub async fn delete_api_key(
    state: State<'_, AppState>,
    provider: Option<AiProviderKind>,
) -> Result<(), AppError> {
    let provider = provider.unwrap_or(load_settings(&state)?.provider);
    if provider != AiProviderKind::Mock {
        secure_store::delete_api_key(provider.secure_store_name().into()).await?;
    }
    Ok(())
}

async fn create_provider(
    state: &AppState,
    settings: &AiSettings,
) -> Result<Box<dyn AiProvider>, AppError> {
    validate_settings(settings)?;
    match settings.provider {
        AiProviderKind::Mock if cfg!(debug_assertions) => Ok(Box::new(MockAiProvider)),
        AiProviderKind::Mock => Err(AppError::InvalidInput(
            "Mock Provider 仅在开发构建中可用。".into(),
        )),
        AiProviderKind::Openai => {
            let key = secure_store::get_api_key("openai".into()).await?;
            Ok(Box::new(OpenAiResponsesProvider::new(
                state.http.clone(),
                settings.clone(),
                key,
            )))
        }
        AiProviderKind::OpenaiCompatible => {
            let key = secure_store::get_api_key("openai-compatible".into()).await?;
            Ok(Box::new(GenericOpenAiCompatibleProvider::new(
                state.http.clone(),
                settings.clone(),
                key,
            )))
        }
    }
}

#[tauri::command]
pub async fn test_ai_connection(
    state: State<'_, AppState>,
) -> Result<ConnectionTestResult, AppError> {
    let settings = load_settings(&state)?;
    validate_settings(&settings)?;
    if settings.provider == AiProviderKind::Mock {
        return Ok(ConnectionTestResult {
            ok: true,
            provider: "mock".into(),
            model: settings.model,
            latency_ms: 0,
        });
    }
    let key = secure_store::get_api_key(settings.provider.secure_store_name().into()).await?;
    let base = settings.base_url.trim_end_matches('/');
    let endpoint = if base.ends_with("/models") {
        base.to_owned()
    } else {
        format!("{base}/models")
    };
    let started = Instant::now();
    let response = state
        .http
        .get(endpoint)
        .bearer_auth(key.as_str())
        .send()
        .await
        .map_err(|error| AppError::Network(error.to_string()))?;
    if !response.status().is_success() {
        return Err(AiError::from_status(response.status()).into());
    }
    Ok(ConnectionTestResult {
        ok: true,
        provider: settings.provider.secure_store_name().into(),
        model: settings.model,
        latency_ms: started.elapsed().as_millis(),
    })
}

fn load_cached_explanation(
    state: &AppState,
    key: &str,
) -> Result<Option<(String, AiExplanation)>, AppError> {
    let value: Option<(String, String)> = state
        .database
        .connect()?
        .query_row(
            "SELECT id, explanation_json FROM ai_explanations WHERE cache_key=?1",
            [key],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    value
        .map(|(id, serialized)| {
            serde_json::from_str(&serialized)
                .map(|explanation| (id, explanation))
                .map_err(AppError::from)
        })
        .transpose()
}

fn save_explanation(
    state: &AppState,
    request: &ExplainSelectionRequest,
    settings: &AiSettings,
    key: &str,
    response: &ExplainSelectionResponse,
) -> Result<String, AppError> {
    let id = Uuid::new_v4().to_string();
    state.database.connect()?.execute(
        r#"INSERT INTO ai_explanations
           (id,paper_id,selection_id,cache_key,provider,model,prompt_version,explanation_json)
           VALUES(?1,?2,?3,?4,?5,?6,?7,?8)
           ON CONFLICT(cache_key) DO UPDATE SET explanation_json=excluded.explanation_json,
             provider=excluded.provider,model=excluded.model,prompt_version=excluded.prompt_version,
             updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')"#,
        params![
            id,
            request.paper.id,
            request.selection_id,
            key,
            settings.provider.secure_store_name(),
            settings.model,
            PROMPT_VERSION,
            serde_json::to_string(&response.explanation)?
        ],
    )?;
    let actual_id: String = state.database.connect()?.query_row(
        "SELECT id FROM ai_explanations WHERE cache_key=?1",
        [key],
        |row| row.get(0),
    )?;
    Ok(actual_id)
}

struct RequestLog<'a> {
    request: &'a ExplainSelectionRequest,
    settings: &'a AiSettings,
    status: &'a str,
    duration_ms: u128,
    error_category: Option<&'a str>,
    response: Option<&'a ExplainSelectionResponse>,
}

fn save_request_log(state: &AppState, log: RequestLog<'_>) -> Result<(), AppError> {
    let request_context = log
        .settings
        .save_request_context
        .then(|| serde_json::to_string(&build_provider_input(log.request)))
        .transpose()?;
    state.database.connect()?.execute(
        r#"INSERT INTO ai_request_logs
           (id,request_id,requested_at,provider,model,status,duration_ms,error_category,
            input_tokens,output_tokens,context_hash,request_context_json)
           VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
           ON CONFLICT(request_id) DO UPDATE SET status=excluded.status,
             duration_ms=excluded.duration_ms,error_category=excluded.error_category,
             input_tokens=excluded.input_tokens,output_tokens=excluded.output_tokens"#,
        params![
            Uuid::new_v4().to_string(),
            log.request.request_id,
            Utc::now().to_rfc3339(),
            log.settings.provider.secure_store_name(),
            log.settings.model,
            log.status,
            i64::try_from(log.duration_ms).unwrap_or(i64::MAX),
            log.error_category,
            log.response
                .and_then(|value| value.usage.input_tokens)
                .and_then(|value| i64::try_from(value).ok()),
            log.response
                .and_then(|value| value.usage.output_tokens)
                .and_then(|value| i64::try_from(value).ok()),
            context_hash(log.request),
            request_context
        ],
    )?;
    Ok(())
}

fn send_event(channel: &Channel<AiStreamEvent>, event: AiStreamEvent) -> Result<(), AppError> {
    channel
        .send(event)
        .map_err(|error| AppError::Internal(error.to_string()))
}

async fn run_provider(
    provider: &dyn AiProvider,
    settings: &AiSettings,
    request: &ExplainSelectionRequest,
    token: &CancellationToken,
    on_event: &Channel<AiStreamEvent>,
) -> Result<ExplainSelectionResponse, AiError> {
    if !settings.stream {
        return tokio::select! {
            _ = token.cancelled() => Err(AiError::Cancelled),
            result = provider.explain_selection(request.clone()) => result,
        };
    }

    let (delta_sender, mut delta_receiver) = mpsc::channel(32);
    let future = provider.explain_selection_stream(request.clone(), delta_sender);
    tokio::pin!(future);
    loop {
        tokio::select! {
            _ = token.cancelled() => return Err(AiError::Cancelled),
            result = &mut future => return result,
            Some(delta) = delta_receiver.recv() => {
                send_event(on_event, AiStreamEvent::Delta {
                    request_id: request.request_id.clone(),
                    selection_id: request.selection_id.clone(),
                    paper_id: request.paper.id.clone(),
                    delta: delta.text,
                }).map_err(|error| AiError::Network(error.to_string()))?;
            }
        }
    }
}

#[tauri::command]
pub async fn explain_selection(
    state: State<'_, AppState>,
    request: ExplainSelectionRequest,
    on_event: Channel<AiStreamEvent>,
) -> Result<ExplainCommandResult, AppError> {
    validate_request(&request).map_err(AppError::from)?;
    if state.ai_cancellations.contains_key(&request.request_id) {
        return Err(AppError::InvalidInput(
            "相同 requestId 的 AI 请求正在执行。".into(),
        ));
    }
    let settings = load_settings(&state)?;
    validate_settings(&settings)?;
    let key = cache_key(&request, &settings.model);
    send_event(
        &on_event,
        AiStreamEvent::Started {
            request_id: request.request_id.clone(),
            selection_id: request.selection_id.clone(),
            paper_id: request.paper.id.clone(),
        },
    )?;

    if let Some((id, explanation)) = load_cached_explanation(&state, &key)? {
        send_event(
            &on_event,
            AiStreamEvent::Completed {
                request_id: request.request_id.clone(),
                selection_id: request.selection_id.clone(),
                paper_id: request.paper.id.clone(),
                explanation: Box::new(explanation),
                usage: Default::default(),
                cached: true,
            },
        )?;
        return Ok(ExplainCommandResult {
            request_id: request.request_id,
            explanation_id: id,
            cached: true,
        });
    }

    let provider = create_provider(&state, &settings).await?;
    let token = CancellationToken::new();
    state
        .ai_cancellations
        .insert(request.request_id.clone(), token.clone());
    let started = Instant::now();
    let first_result =
        run_provider(provider.as_ref(), &settings, &request, &token, &on_event).await;
    let result = match first_result {
        Err(AiError::InvalidResponse { raw: Some(raw), .. }) => {
            send_event(
                &on_event,
                AiStreamEvent::Repairing {
                    request_id: request.request_id.clone(),
                    selection_id: request.selection_id.clone(),
                    paper_id: request.paper.id.clone(),
                },
            )?;
            tokio::select! {
                _ = token.cancelled() => Err(AiError::Cancelled),
                repaired = provider.repair_response(request.clone(), raw) => repaired,
            }
        }
        other => other,
    };
    state.ai_cancellations.remove(&request.request_id);

    match result {
        Ok(response) => {
            let explanation_id = save_explanation(&state, &request, &settings, &key, &response)?;
            save_request_log(
                &state,
                RequestLog {
                    request: &request,
                    settings: &settings,
                    status: "completed",
                    duration_ms: started.elapsed().as_millis(),
                    error_category: None,
                    response: Some(&response),
                },
            )?;
            send_event(
                &on_event,
                AiStreamEvent::Completed {
                    request_id: request.request_id.clone(),
                    selection_id: request.selection_id.clone(),
                    paper_id: request.paper.id.clone(),
                    explanation: Box::new(response.explanation),
                    usage: response.usage,
                    cached: false,
                },
            )?;
            Ok(ExplainCommandResult {
                request_id: request.request_id,
                explanation_id,
                cached: false,
            })
        }
        Err(error) => {
            let category = error.category();
            let app_error: AppError = error.into();
            let _ = save_request_log(
                &state,
                RequestLog {
                    request: &request,
                    settings: &settings,
                    status: if category == "cancelled" {
                        "cancelled"
                    } else {
                        "failed"
                    },
                    duration_ms: started.elapsed().as_millis(),
                    error_category: Some(category),
                    response: None,
                },
            );
            if category == "cancelled" {
                let _ = send_event(
                    &on_event,
                    AiStreamEvent::Cancelled {
                        request_id: request.request_id.clone(),
                        selection_id: request.selection_id.clone(),
                        paper_id: request.paper.id.clone(),
                    },
                );
            } else {
                let _ = send_event(
                    &on_event,
                    AiStreamEvent::Failed {
                        request_id: request.request_id.clone(),
                        selection_id: request.selection_id.clone(),
                        paper_id: request.paper.id.clone(),
                        code: app_error.category().into(),
                        message: app_error.user_message(),
                        retryable: matches!(
                            app_error,
                            AppError::Network(_)
                                | AppError::RateLimited(_)
                                | AppError::InvalidResponse(_)
                        ),
                    },
                );
            }
            Err(app_error)
        }
    }
}

#[tauri::command]
pub fn cancel_ai_request(state: State<'_, AppState>, request_id: String) -> bool {
    if let Some(token) = state.ai_cancellations.get(&request_id) {
        token.cancel();
        true
    } else {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_reject_remote_plain_http() {
        let mut settings = AiSettings {
            base_url: "http://example.com/v1".into(),
            ..AiSettings::default()
        };
        assert!(validate_settings(&settings).is_err());
        settings.base_url = "http://localhost:8000/v1".into();
        assert!(validate_settings(&settings).is_ok());
    }
}
