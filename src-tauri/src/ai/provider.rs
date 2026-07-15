use crate::ai::error::AiError;
use crate::ai::types::{
    ExplainSelectionRequest, ExplainSelectionResponse, ProviderDelta, TokenUsage,
};
use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::Response;
use tokio::sync::mpsc;

#[derive(Debug, Clone, Copy)]
pub enum SseFlavor {
    OpenAiResponses,
    OpenAiCompatibleChat,
}

#[async_trait]
pub trait AiProvider: Send + Sync {
    async fn explain_selection(
        &self,
        request: ExplainSelectionRequest,
    ) -> Result<ExplainSelectionResponse, AiError>;

    async fn explain_selection_stream(
        &self,
        request: ExplainSelectionRequest,
        deltas: mpsc::Sender<ProviderDelta>,
    ) -> Result<ExplainSelectionResponse, AiError>;

    async fn repair_response(
        &self,
        request: ExplainSelectionRequest,
        invalid_response: String,
    ) -> Result<ExplainSelectionResponse, AiError>;
}

pub async fn require_success(response: Response) -> Result<Response, AiError> {
    if response.status().is_success() {
        Ok(response)
    } else {
        Err(AiError::from_status(response.status()))
    }
}

fn parse_usage(value: &serde_json::Value) -> TokenUsage {
    let usage = value
        .get("usage")
        .or_else(|| value.pointer("/response/usage"));
    TokenUsage {
        input_tokens: usage.and_then(|usage| {
            usage
                .get("input_tokens")
                .or_else(|| usage.get("prompt_tokens"))
                .and_then(serde_json::Value::as_u64)
        }),
        output_tokens: usage.and_then(|usage| {
            usage
                .get("output_tokens")
                .or_else(|| usage.get("completion_tokens"))
                .and_then(serde_json::Value::as_u64)
        }),
    }
}

fn parse_sse_value(
    value: &serde_json::Value,
    flavor: SseFlavor,
) -> (Option<&str>, Option<TokenUsage>) {
    match flavor {
        SseFlavor::OpenAiResponses => {
            let delta = (value.get("type").and_then(serde_json::Value::as_str)
                == Some("response.output_text.delta"))
            .then(|| value.get("delta").and_then(serde_json::Value::as_str))
            .flatten();
            let usage = (value.get("type").and_then(serde_json::Value::as_str)
                == Some("response.completed"))
            .then(|| parse_usage(value));
            (delta, usage)
        }
        SseFlavor::OpenAiCompatibleChat => {
            let delta = value
                .pointer("/choices/0/delta/content")
                .and_then(serde_json::Value::as_str);
            let usage = value.get("usage").map(|_| parse_usage(value));
            (delta, usage)
        }
    }
}

pub async fn collect_sse(
    response: Response,
    flavor: SseFlavor,
    deltas: mpsc::Sender<ProviderDelta>,
) -> Result<(String, TokenUsage), AiError> {
    let mut stream = response.bytes_stream();
    let mut pending = Vec::<u8>::new();
    let mut output = String::new();
    let mut usage = TokenUsage::default();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| AiError::Network(error.to_string()))?;
        pending.extend_from_slice(&chunk);
        while let Some(position) = pending.windows(2).position(|window| window == b"\n\n") {
            let block: Vec<u8> = pending.drain(..position + 2).collect();
            let block = String::from_utf8_lossy(&block);
            let data = block
                .lines()
                .filter_map(|line| line.strip_prefix("data:"))
                .map(str::trim_start)
                .collect::<Vec<_>>()
                .join("\n");
            if data.is_empty() || data == "[DONE]" {
                continue;
            }
            let value: serde_json::Value =
                serde_json::from_str(&data).map_err(|error| AiError::InvalidResponse {
                    message: format!("invalid SSE event: {error}"),
                    raw: None,
                })?;
            let (delta, event_usage) = parse_sse_value(&value, flavor);
            if let Some(delta) = delta {
                output.push_str(delta);
                let _ = deltas
                    .send(ProviderDelta {
                        text: delta.to_owned(),
                    })
                    .await;
            }
            if let Some(event_usage) = event_usage {
                usage = event_usage;
            }
        }
    }
    if output.trim().is_empty() {
        return Err(AiError::InvalidResponse {
            message: "stream completed without output text".into(),
            raw: None,
        });
    }
    Ok((output, usage))
}

pub fn extract_responses_text(value: &serde_json::Value) -> Result<String, AiError> {
    if let Some(text) = value.get("output_text").and_then(serde_json::Value::as_str) {
        return Ok(text.to_owned());
    }
    value
        .get("output")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|output| {
            output
                .get("content")
                .and_then(serde_json::Value::as_array)
                .into_iter()
                .flatten()
        })
        .find_map(|content| {
            content
                .get("text")
                .and_then(serde_json::Value::as_str)
                .map(ToOwned::to_owned)
        })
        .ok_or_else(|| AiError::InvalidResponse {
            message: "response did not include output text".into(),
            raw: None,
        })
}

pub fn extract_chat_text(value: &serde_json::Value) -> Result<String, AiError> {
    value
        .pointer("/choices/0/message/content")
        .and_then(serde_json::Value::as_str)
        .map(ToOwned::to_owned)
        .ok_or_else(|| AiError::InvalidResponse {
            message: "chat response did not include message content".into(),
            raw: None,
        })
}

pub fn usage_from_value(value: &serde_json::Value) -> TokenUsage {
    parse_usage(value)
}
