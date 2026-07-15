use crate::error::AppError;
use keyring::Entry;
use zeroize::Zeroizing;

const SERVICE: &str = "app.paperlens.desktop";

fn entry(provider: &str) -> Result<Entry, AppError> {
    if provider.is_empty()
        || provider.len() > 64
        || !provider
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(AppError::InvalidInput("无效的 AI Provider 标识。".into()));
    }
    Entry::new(SERVICE, &format!("ai-api-key:{provider}"))
        .map_err(|error| AppError::SecureStore(error.to_string()))
}

pub async fn set_api_key(provider: String, api_key: String) -> Result<(), AppError> {
    let trimmed = api_key.trim();
    if trimmed.len() < 8 || trimmed.len() > 4096 || trimmed.chars().any(char::is_control) {
        return Err(AppError::InvalidInput("API Key 格式无效。".into()));
    }
    let secret = Zeroizing::new(trimmed.to_owned());
    tokio::task::spawn_blocking(move || {
        entry(&provider)?
            .set_password(secret.as_str())
            .map_err(|error| AppError::SecureStore(error.to_string()))
    })
    .await
    .map_err(|error| AppError::Internal(error.to_string()))?
}

pub async fn get_api_key(provider: String) -> Result<Zeroizing<String>, AppError> {
    tokio::task::spawn_blocking(move || {
        entry(&provider)?
            .get_password()
            .map(Zeroizing::new)
            .map_err(|error| match error {
                keyring::Error::NoEntry => {
                    AppError::NotConfigured("尚未为当前 AI Provider 配置 API Key。".into())
                }
                other => AppError::SecureStore(other.to_string()),
            })
    })
    .await
    .map_err(|error| AppError::Internal(error.to_string()))?
}

pub async fn api_key_configured(provider: String) -> Result<bool, AppError> {
    match get_api_key(provider).await {
        Ok(_) => Ok(true),
        Err(AppError::NotConfigured(_)) => Ok(false),
        Err(error) => Err(error),
    }
}

pub async fn delete_api_key(provider: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        entry(&provider)?
            .delete_credential()
            .or_else(|error| match error {
                keyring::Error::NoEntry => Ok(()),
                other => Err(other),
            })
            .map_err(|error| AppError::SecureStore(error.to_string()))
    })
    .await
    .map_err(|error| AppError::Internal(error.to_string()))?
}

/// Only intended for explicit connection diagnostics shown to the user. Never log its return value.
#[cfg(test)]
pub fn mask_api_key(value: &str) -> String {
    let characters: Vec<char> = value.chars().collect();
    match characters.len() {
        0 => String::new(),
        1..=8 => "••••••••".into(),
        length => format!(
            "{}••••{}",
            characters[..4].iter().collect::<String>(),
            characters[length - 4..].iter().collect::<String>()
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_api_keys_without_exposing_middle() {
        assert_eq!(mask_api_key("sk-1234567890abcdef"), "sk-1••••cdef");
        assert_eq!(mask_api_key("short"), "••••••••");
        assert_eq!(mask_api_key(""), "");
    }
}
