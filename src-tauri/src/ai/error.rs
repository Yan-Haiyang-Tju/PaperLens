use crate::error::AppError;
use reqwest::StatusCode;

#[derive(Debug, thiserror::Error)]
pub enum AiError {
    #[error("AI authentication failed")]
    Authentication,
    #[error("AI request was rate limited")]
    RateLimited,
    #[error("AI model was not found")]
    ModelNotFound,
    #[error("AI network request failed: {0}")]
    Network(String),
    #[error("AI response was invalid: {message}")]
    InvalidResponse {
        message: String,
        raw: Option<String>,
    },
    #[error("AI request was cancelled")]
    Cancelled,
}

impl AiError {
    pub fn category(&self) -> &'static str {
        match self {
            Self::Authentication => "authentication_error",
            Self::RateLimited => "rate_limited",
            Self::ModelNotFound => "model_not_found",
            Self::Network(_) => "network_error",
            Self::InvalidResponse { .. } => "invalid_response",
            Self::Cancelled => "cancelled",
        }
    }

    pub fn from_status(status: StatusCode) -> Self {
        match status {
            StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => Self::Authentication,
            StatusCode::TOO_MANY_REQUESTS => Self::RateLimited,
            StatusCode::NOT_FOUND => Self::ModelNotFound,
            other => Self::Network(format!("provider returned HTTP {}", other.as_u16())),
        }
    }
}

impl From<AiError> for AppError {
    fn from(value: AiError) -> Self {
        match value {
            AiError::Authentication => AppError::Unauthorized("authentication failed".into()),
            AiError::RateLimited => AppError::RateLimited("rate limited".into()),
            AiError::ModelNotFound => {
                AppError::InvalidInput("所配置的模型不存在或当前账号无权使用。".into())
            }
            AiError::Network(message) => AppError::Network(message),
            AiError::InvalidResponse { message, .. } => AppError::InvalidResponse(message),
            AiError::Cancelled => AppError::Cancelled,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_provider_http_errors_to_stable_categories() {
        assert!(matches!(
            AiError::from_status(StatusCode::UNAUTHORIZED),
            AiError::Authentication
        ));
        assert!(matches!(
            AiError::from_status(StatusCode::TOO_MANY_REQUESTS),
            AiError::RateLimited
        ));
        assert!(matches!(
            AiError::from_status(StatusCode::NOT_FOUND),
            AiError::ModelNotFound
        ));
    }
}
