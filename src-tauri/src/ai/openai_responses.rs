use crate::ai::error::AiError;
use crate::ai::provider::{
    collect_sse, extract_responses_text, require_success, usage_from_value, AiProvider, SseFlavor,
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

pub struct OpenAiResponsesProvider {
    client: Client,
    settings: AiSettings,
    api_key: Zeroizing<String>,
}

impl OpenAiResponsesProvider {
    pub fn new(client: Client, settings: AiSettings, api_key: Zeroizing<String>) -> Self {
        Self {
            client,
            settings,
            api_key,
        }
    }

    fn endpoint(&self) -> String {
        let base = self.settings.base_url.trim_end_matches('/');
        if base.ends_with("/responses") {
            base.to_owned()
        } else {
            format!("{base}/responses")
        }
    }

    fn body(&self, request: &ExplainSelectionRequest, stream: bool, repair: Option<&str>) -> Value {
        let schema: Value = serde_json::from_str(EXPLANATION_SCHEMA)
            .expect("bundled AI explanation schema must be valid JSON");
        let input = serde_json::to_string_pretty(&build_provider_input(request))
            .expect("provider input is JSON serializable");
        let repair_message = repair.map(|invalid| {
            format!(
                "The previous response did not match the schema. Return a corrected JSON object only. Previous response:\n{}",
                invalid.chars().take(32_000).collect::<String>()
            )
        });
        let mut messages = vec![
            serde_json::json!({"role":"system","content":[{"type":"input_text","text":SYSTEM_PROMPT}]}),
            serde_json::json!({"role":"user","content":[{"type":"input_text","text":input}]}),
        ];
        if let Some(message) = repair_message {
            messages.push(
                serde_json::json!({"role":"user","content":[{"type":"input_text","text":message}]}),
            );
        }
        serde_json::json!({
            "model": self.settings.model,
            "input": messages,
            "temperature": self.settings.temperature,
            "max_output_tokens": self.settings.max_output_tokens,
            "stream": stream,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "paperlens_ai_explanation",
                    "strict": true,
                    "schema": schema
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
        let text = extract_responses_text(&value)?;
        Ok(ExplainSelectionResponse {
            explanation: AiExplanation::parse(&text)?,
            usage: usage_from_value(&value),
        })
    }
}

#[async_trait]
impl AiProvider for OpenAiResponsesProvider {
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
        let (raw, usage) = collect_sse(response, SseFlavor::OpenAiResponses, deltas).await?;
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
