use crate::ai::error::AiError;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const PROMPT_VERSION: &str = "2026-07-15.1";
pub const SYSTEM_PROMPT: &str = include_str!("../../../prompts/academic_selection_explanation.txt");
pub const EXPLANATION_SCHEMA: &str =
    include_str!("../../../prompts/schemas/ai_explanation.schema.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperContext {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub authors: Vec<String>,
    #[serde(default, alias = "abstract")]
    pub abstract_text: Option<String>,
    #[serde(default)]
    pub current_section: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionContext {
    pub selected_text: String,
    pub normalized_text: String,
    pub page_number: u32,
    #[serde(default)]
    pub sentence: Option<String>,
    #[serde(default)]
    pub previous_sentence: Option<String>,
    #[serde(default)]
    pub next_sentence: Option<String>,
    #[serde(default)]
    pub paragraph: Option<String>,
    #[serde(default)]
    pub section_title: Option<String>,
    #[serde(default)]
    pub bounding_rects: Vec<NormalizedRect>,
    pub extraction_confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplanationPreferences {
    #[serde(default = "default_output_language")]
    pub output_language: String,
    #[serde(default)]
    pub reader_background: Option<String>,
    #[serde(default = "default_detail_level")]
    pub detail_level: String,
    #[serde(default = "default_true")]
    pub send_abstract: bool,
    #[serde(default = "default_true")]
    pub send_adjacent_sentences: bool,
}

fn default_output_language() -> String {
    "zh-CN".into()
}
fn default_detail_level() -> String {
    "concise".into()
}
fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplainSelectionRequest {
    pub request_id: String,
    pub selection_id: String,
    pub paper: PaperContext,
    pub selection: SelectionContext,
    #[serde(default)]
    pub preferences: ExplanationPreferences,
}

impl Default for ExplanationPreferences {
    fn default() -> Self {
        Self {
            output_language: default_output_language(),
            reader_background: None,
            detail_level: default_detail_level(),
            send_abstract: true,
            send_adjacent_sentences: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExpressionType {
    GeneralWord,
    AcademicExpression,
    TechnicalTerm,
    Abbreviation,
    ModelOrDataset,
    SentenceOrPassage,
    FormulaRelated,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RelatedTerm {
    pub term: String,
    pub relation_zh: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiExplanation {
    pub selected_text: String,
    pub expression_type: ExpressionType,
    pub part_of_speech: Option<String>,
    pub basic_meaning_zh: String,
    pub contextual_meaning_zh: String,
    pub sentence_translation_zh: Option<String>,
    pub technical_explanation_zh: Option<String>,
    pub role_in_paper_zh: Option<String>,
    pub collocations: Vec<String>,
    pub related_terms: Vec<RelatedTerm>,
    pub ambiguity_note_zh: Option<String>,
    pub confidence: f64,
}

impl AiExplanation {
    pub fn validate(&self) -> Result<(), AiError> {
        if self.selected_text.trim().is_empty()
            || self.contextual_meaning_zh.trim().is_empty()
            || !self.confidence.is_finite()
            || !(0.0..=1.0).contains(&self.confidence)
            || self.collocations.len() > 12
            || self.related_terms.len() > 12
            || self
                .related_terms
                .iter()
                .any(|term| term.term.trim().is_empty() || term.relation_zh.trim().is_empty())
        {
            return Err(AiError::InvalidResponse {
                message: "AI explanation failed semantic validation".into(),
                raw: None,
            });
        }
        Ok(())
    }

    pub fn parse(raw: &str) -> Result<Self, AiError> {
        let explanation: Self =
            serde_json::from_str(raw).map_err(|error| AiError::InvalidResponse {
                message: error.to_string(),
                raw: Some(raw.to_owned()),
            })?;
        explanation.validate().map_err(|error| match error {
            AiError::InvalidResponse { message, .. } => AiError::InvalidResponse {
                message,
                raw: Some(raw.to_owned()),
            },
            other => other,
        })?;
        Ok(explanation)
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExplainSelectionResponse {
    pub explanation: AiExplanation,
    pub usage: TokenUsage,
}

#[derive(Debug, Clone)]
pub struct ProviderDelta {
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum AiStreamEvent {
    Started {
        request_id: String,
        selection_id: String,
        paper_id: String,
    },
    Delta {
        request_id: String,
        selection_id: String,
        paper_id: String,
        #[serde(rename = "content")]
        delta: String,
    },
    Repairing {
        request_id: String,
        selection_id: String,
        paper_id: String,
    },
    Completed {
        request_id: String,
        selection_id: String,
        paper_id: String,
        explanation: Box<AiExplanation>,
        usage: TokenUsage,
        cached: bool,
    },
    Cancelled {
        request_id: String,
        selection_id: String,
        paper_id: String,
    },
    Failed {
        request_id: String,
        selection_id: String,
        paper_id: String,
        code: String,
        message: String,
        retryable: bool,
    },
}

pub fn validate_request(request: &ExplainSelectionRequest) -> Result<(), AiError> {
    if request.request_id.trim().is_empty()
        || request.selection_id.trim().is_empty()
        || request.paper.id.trim().is_empty()
        || request.selection.selected_text.trim().is_empty()
        || request.selection.page_number == 0
        || !request.selection.extraction_confidence.is_finite()
        || !(0.0..=1.0).contains(&request.selection.extraction_confidence)
        || request.selection.selected_text.chars().count() > 20_000
    {
        return Err(AiError::InvalidResponse {
            message: "AI request payload is invalid".into(),
            raw: None,
        });
    }
    Ok(())
}

fn sanitize_text(value: &str) -> String {
    value
        .split_whitespace()
        .map(|token| {
            let looks_like_windows_path = token.len() > 3
                && token.as_bytes().get(1) == Some(&b':')
                && token
                    .as_bytes()
                    .get(2)
                    .is_some_and(|value| matches!(value, b'\\' | b'/'));
            let looks_like_unix_path = token.starts_with("/home/")
                || token.starts_with("/Users/")
                || token.starts_with("/tmp/");
            if looks_like_windows_path || looks_like_unix_path {
                "[local path omitted]"
            } else {
                token
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn truncate_at_boundary(value: &str, maximum_characters: usize) -> String {
    if value.chars().count() <= maximum_characters {
        return sanitize_text(value);
    }
    let mut shortened = value
        .split_whitespace()
        .scan(0_usize, |length, word| {
            let next = word.chars().count() + usize::from(*length > 0);
            if *length + next > maximum_characters {
                None
            } else {
                *length += next;
                Some(word)
            }
        })
        .collect::<Vec<_>>()
        .join(" ");
    shortened.push('…');
    sanitize_text(&shortened)
}

pub fn build_provider_input(request: &ExplainSelectionRequest) -> serde_json::Value {
    serde_json::json!({
        "paper": {
            "title": sanitize_text(&request.paper.title),
            "authors": request.paper.authors.iter().map(|value| sanitize_text(value)).collect::<Vec<_>>(),
            "abstract": if request.preferences.send_abstract { request.paper.abstract_text.as_deref().map(|value| truncate_at_boundary(value, 5000)) } else { None },
            "current_section": request.paper.current_section.as_deref().or(request.selection.section_title.as_deref()).map(sanitize_text)
        },
        "selection": {
            "selected_text": sanitize_text(&request.selection.selected_text),
            "normalized_text": sanitize_text(&request.selection.normalized_text),
            "page_number": request.selection.page_number,
            "sentence": request.selection.sentence.as_deref().map(|value| truncate_at_boundary(value, 3000)),
            "previous_sentence": if request.preferences.send_adjacent_sentences { request.selection.previous_sentence.as_deref().map(|value| truncate_at_boundary(value, 2000)) } else { None },
            "next_sentence": if request.preferences.send_adjacent_sentences { request.selection.next_sentence.as_deref().map(|value| truncate_at_boundary(value, 2000)) } else { None },
            "paragraph": request.selection.paragraph.as_deref().map(|value| truncate_at_boundary(value, 6000)),
            "extraction_confidence": request.selection.extraction_confidence
        },
        "preferences": {
            "output_language": request.preferences.output_language,
            "reader_background": request.preferences.reader_background,
            "detail_level": request.preferences.detail_level
        }
    })
}

pub fn cache_key(request: &ExplainSelectionRequest, model: &str) -> String {
    let value = serde_json::json!({
        "paperId": request.paper.id,
        "normalizedText": request.selection.normalized_text,
        "sentence": request.selection.sentence,
        "model": model,
        "promptVersion": PROMPT_VERSION,
        "preferences": request.preferences,
    });
    hex::encode(Sha256::digest(
        serde_json::to_vec(&value).unwrap_or_default(),
    ))
}

pub fn context_hash(request: &ExplainSelectionRequest) -> String {
    hex::encode(Sha256::digest(
        serde_json::to_vec(&build_provider_input(request)).unwrap_or_default(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> ExplainSelectionRequest {
        ExplainSelectionRequest {
            request_id: "r".into(),
            selection_id: "s".into(),
            paper: PaperContext {
                id: "p".into(),
                title: "A Paper".into(),
                authors: vec![],
                abstract_text: Some("abstract".into()),
                current_section: Some("Method".into()),
            },
            selection: SelectionContext {
                selected_text: "compliance".into(),
                normalized_text: "compliance".into(),
                page_number: 2,
                sentence: Some("Stored at C:\\Users\\someone\\secret.pdf".into()),
                previous_sentence: None,
                next_sentence: None,
                paragraph: Some("context".into()),
                section_title: None,
                bounding_rects: vec![],
                extraction_confidence: 0.9,
            },
            preferences: ExplanationPreferences::default(),
        }
    }

    #[test]
    fn request_builder_removes_local_paths() {
        let input = build_provider_input(&request()).to_string();
        assert!(!input.contains("Users"));
        assert!(input.contains("local path omitted"));
    }

    #[test]
    fn cache_key_changes_with_model_and_prompt_inputs() {
        let mut changed = request();
        let first = cache_key(&changed, "model-a");
        changed.selection.sentence = Some("different".into());
        assert_ne!(first, cache_key(&changed, "model-a"));
        assert_ne!(first, cache_key(&request(), "model-b"));
    }

    #[test]
    fn parses_and_validates_structured_explanation() {
        let raw = r#"{"selectedText":"term","expressionType":"technical_term","partOfSpeech":null,"basicMeaningZh":"术语","contextualMeaningZh":"本文含义","sentenceTranslationZh":null,"technicalExplanationZh":null,"roleInPaperZh":null,"collocations":[],"relatedTerms":[],"ambiguityNoteZh":null,"confidence":0.8}"#;
        assert_eq!(AiExplanation::parse(raw).unwrap().confidence, 0.8);
    }

    #[test]
    fn frontend_contract_uses_abstract_text_and_delta_content() {
        let payload = serde_json::to_value(request()).unwrap();
        assert_eq!(payload["paper"]["abstractText"], "abstract");
        let event = serde_json::to_value(AiStreamEvent::Delta {
            request_id: "r".into(),
            selection_id: "s".into(),
            paper_id: "p".into(),
            delta: "chunk".into(),
        })
        .unwrap();
        assert_eq!(event["content"], "chunk");
        assert!(event.get("delta").is_none());
    }
}
