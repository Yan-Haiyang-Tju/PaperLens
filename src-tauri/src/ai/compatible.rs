use crate::ai::error::AiError;
use crate::ai::provider::{
    collect_sse, extract_chat_text, require_success, usage_from_value, AiProvider, SseFlavor,
};
use crate::ai::types::{
    build_provider_input, AiExplanation, ExplainSelectionRequest, ExplainSelectionResponse,
    ProviderDelta, EXPLANATION_SCHEMA, SYSTEM_PROMPT,
};
use crate::ai::AiSettings;
use async_trait::async_trait;
use reqwest::Client;
use serde_json::Value;
use tokio::sync::mpsc;
use zeroize::Zeroizing;

pub struct GenericOpenAiCompatibleProvider {
    client: Client,
    settings: AiSettings,
    api_key: Zeroizing<String>,
}

impl GenericOpenAiCompatibleProvider {
    pub fn new(client: Client, settings: AiSettings, api_key: Zeroizing<String>) -> Self {
        Self {
            client,
            settings,
            api_key,
        }
    }

    fn endpoint(&self) -> String {
        let base = self.settings.base_url.trim_end_matches('/');
        if base.ends_with("/chat/completions") {
            base.to_owned()
        } else {
            format!("{base}/chat/completions")
        }
    }

    fn body(&self, request: &ExplainSelectionRequest, stream: bool, repair: Option<&str>) -> Value {
        let schema: Value = serde_json::from_str(EXPLANATION_SCHEMA)
            .expect("bundled AI explanation schema must be valid JSON");
        let input = serde_json::to_string_pretty(&build_provider_input(request))
            .expect("provider input is JSON serializable");
        let mut messages = vec![
            serde_json::json!({"role":"system","content":SYSTEM_PROMPT}),
            serde_json::json!({"role":"user","content":input}),
        ];
        if let Some(invalid) = repair {
            messages.push(serde_json::json!({
                "role":"user",
                "content": format!("Correct the previous response to the required schema and return JSON only:\n{}", invalid.chars().take(32_000).collect::<String>())
            }));
        }
        serde_json::json!({
            "model": self.settings.model,
            "messages": messages,
            "temperature": self.settings.temperature,
            "max_tokens": self.settings.max_output_tokens,
            "stream": stream,
            "stream_options": if stream { serde_json::json!({"include_usage": true}) } else { Value::Null },
            "response_format": {
                "type":"json_schema",
                "json_schema": {
                    "name":"paperlens_ai_explanation",
                    "strict":true,
                    "schema":schema
                }
            }
        })
    }

    async fn send_json(
        &self,
        request: &ExplainSelectionRequest,
        repair: Option<&str>,
    ) -> Result<ExplainSelectionResponse, AiError> {
        let response = self
            .client
            .post(self.endpoint())
            .bearer_auth(self.api_key.as_str())
            .json(&self.body(request, false, repair))
            .send()
            .await
            .map_err(|error| AiError::Network(error.to_string()))?;
        let value: Value = require_success(response)
            .await?
            .json()
            .await
            .map_err(|error| AiError::InvalidResponse {
                message: error.to_string(),
                raw: None,
            })?;
        let text = extract_chat_text(&value)?;
        Ok(ExplainSelectionResponse {
            explanation: AiExplanation::parse(&text)?,
            usage: usage_from_value(&value),
        })
    }
}

#[async_trait]
impl AiProvider for GenericOpenAiCompatibleProvider {
    async fn explain_selection(
        &self,
        request: ExplainSelectionRequest,
    ) -> Result<ExplainSelectionResponse, AiError> {
        self.send_json(&request, None).await
    }

    async fn explain_selection_stream(
        &self,
        request: ExplainSelectionRequest,
        deltas: mpsc::Sender<ProviderDelta>,
    ) -> Result<ExplainSelectionResponse, AiError> {
        let response = self
            .client
            .post(self.endpoint())
            .bearer_auth(self.api_key.as_str())
            .json(&self.body(&request, true, None))
            .send()
            .await
            .map_err(|error| AiError::Network(error.to_string()))?;
        let response = require_success(response).await?;
        let (raw, usage) = collect_sse(response, SseFlavor::OpenAiCompatibleChat, deltas).await?;
        Ok(ExplainSelectionResponse {
            explanation: AiExplanation::parse(&raw)?,
            usage,
        })
    }

    async fn repair_response(
        &self,
        request: ExplainSelectionRequest,
        invalid_response: String,
    ) -> Result<ExplainSelectionResponse, AiError> {
        self.send_json(&request, Some(&invalid_response)).await
    }
}
