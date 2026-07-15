use serde::Serialize;
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub code: &'static str,
    pub message: String,
    pub retryable: bool,
}

#[derive(Debug)]
// Wrapped causes are intentionally retained for local diagnostics while serialized command
// errors expose only stable, privacy-safe categories and messages.
#[allow(dead_code)]
pub enum AppError {
    InvalidInput(String),
    NotFound(String),
    Io(std::io::Error),
    Database(rusqlite::Error),
    Network(String),
    Unauthorized(String),
    RateLimited(String),
    InvalidResponse(String),
    NotConfigured(String),
    Cancelled,
    SecureStore(String),
    Internal(String),
}

impl AppError {
    pub fn category(&self) -> &'static str {
        match self {
            Self::InvalidInput(_) => "invalid_input",
            Self::NotFound(_) => "not_found",
            Self::Io(_) => "io_error",
            Self::Database(_) => "database_error",
            Self::Network(_) => "network_error",
            Self::Unauthorized(_) => "authentication_error",
            Self::RateLimited(_) => "rate_limited",
            Self::InvalidResponse(_) => "invalid_response",
            Self::NotConfigured(_) => "not_configured",
            Self::Cancelled => "cancelled",
            Self::SecureStore(_) => "secure_store_error",
            Self::Internal(_) => "internal_error",
        }
    }

    pub fn user_message(&self) -> String {
        match self {
            Self::InvalidInput(message) | Self::NotFound(message) => message.clone(),
            Self::Io(_) => "无法读取或写入文件，请检查文件是否仍然存在及权限是否允许。".into(),
            Self::Database(_) => "本地数据库操作失败。数据未被标记为已保存。".into(),
            Self::Network(_) => "无法连接到服务，请检查网络、服务地址和代理设置。".into(),
            Self::Unauthorized(_) => "API 鉴权失败，请重新检查 API Key。".into(),
            Self::RateLimited(_) => "请求过于频繁，请稍后重试。".into(),
            Self::InvalidResponse(_) => "模型返回的数据格式不符合要求，请重试或更换模型。".into(),
            Self::NotConfigured(message) => message.clone(),
            Self::Cancelled => "请求已停止。".into(),
            Self::SecureStore(_) => "无法访问系统安全凭据库，请检查系统凭据服务。".into(),
            Self::Internal(_) => "发生内部错误，请重试。".into(),
        }
    }
}

impl Display for AppError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.user_message())
    }
}

impl std::error::Error for AppError {}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        CommandError {
            code: self.category(),
            message: self.user_message(),
            retryable: matches!(
                self,
                Self::Io(_)
                    | Self::Database(_)
                    | Self::Network(_)
                    | Self::RateLimited(_)
                    | Self::InvalidResponse(_)
                    | Self::Internal(_)
            ),
        }
        .serialize(serializer)
    }
}

impl From<std::io::Error> for AppError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(value: rusqlite::Error) -> Self {
        Self::Database(value)
    }
}

impl From<serde_json::Error> for AppError {
    fn from(value: serde_json::Error) -> Self {
        Self::InvalidResponse(value.to_string())
    }
}
