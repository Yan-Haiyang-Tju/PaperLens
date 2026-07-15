use crate::ai::error::AiError;
use crate::ai::provider::AiProvider;
use crate::ai::types::{
    AiExplanation, ExplainSelectionRequest, ExplainSelectionResponse, ExpressionType,
    ProviderDelta, RelatedTerm, TokenUsage,
};
use async_trait::async_trait;
use tokio::sync::mpsc;

pub struct MockAiProvider;

impl MockAiProvider {
    fn response(request: &ExplainSelectionRequest) -> ExplainSelectionResponse {
        ExplainSelectionResponse {
            explanation: AiExplanation {
                selected_text: request.selection.selected_text.clone(),
                expression_type: ExpressionType::TechnicalTerm,
                part_of_speech: None,
                basic_meaning_zh: "测试用基础释义".into(),
                contextual_meaning_zh: "这是 Mock Provider 根据当前选区生成的确定性语境解释。"
                    .into(),
                sentence_translation_zh: request
                    .selection
                    .sentence
                    .as_ref()
                    .map(|_| "测试原句翻译。".into()),
                technical_explanation_zh: Some(
                    "仅用于自动测试与开发模式，不会发送网络请求。".into(),
                ),
                role_in_paper_zh: Some("用于验证 PaperLens 的流式响应链路。".into()),
                collocations: vec![],
                related_terms: vec![RelatedTerm {
                    term: "mock provider".into(),
                    relation_zh: "确定性测试数据源".into(),
                }],
                ambiguity_note_zh: None,
                confidence: 1.0,
            },
            usage: TokenUsage {
                input_tokens: Some(0),
                output_tokens: Some(0),
            },
        }
    }
}

#[async_trait]
impl AiProvider for MockAiProvider {
    async fn explain_selection(
        &self,
        request: ExplainSelectionRequest,
    ) -> Result<ExplainSelectionResponse, AiError> {
        Ok(Self::response(&request))
    }

    async fn explain_selection_stream(
        &self,
        request: ExplainSelectionRequest,
        deltas: mpsc::Sender<ProviderDelta>,
    ) -> Result<ExplainSelectionResponse, AiError> {
        let response = Self::response(&request);
        let raw = serde_json::to_string(&response.explanation).expect("mock response serializes");
        for chunk in raw.as_bytes().chunks(24) {
            let text = String::from_utf8_lossy(chunk).into_owned();
            let _ = deltas.send(ProviderDelta { text }).await;
            tokio::task::yield_now().await;
        }
        Ok(response)
    }

    async fn repair_response(
        &self,
        request: ExplainSelectionRequest,
        _invalid_response: String,
    ) -> Result<ExplainSelectionResponse, AiError> {
        Ok(Self::response(&request))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::types::{ExplanationPreferences, PaperContext, SelectionContext};

    #[tokio::test]
    async fn mock_provider_returns_schema_valid_explanation() {
        let request = ExplainSelectionRequest {
            request_id: "r".into(),
            selection_id: "s".into(),
            paper: PaperContext {
                id: "p".into(),
                title: "paper".into(),
                authors: vec![],
                abstract_text: None,
                current_section: None,
            },
            selection: SelectionContext {
                selected_text: "term".into(),
                normalized_text: "term".into(),
                page_number: 1,
                sentence: None,
                previous_sentence: None,
                next_sentence: None,
                paragraph: None,
                section_title: None,
                bounding_rects: vec![],
                extraction_confidence: 0.9,
            },
            preferences: ExplanationPreferences::default(),
        };
        let response = MockAiProvider.explain_selection(request).await.unwrap();
        response.explanation.validate().unwrap();
    }
}
