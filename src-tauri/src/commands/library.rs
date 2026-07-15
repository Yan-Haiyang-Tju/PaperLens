use crate::ai::types::NormalizedRect;
use crate::error::AppError;
use crate::state::AppState;
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperSummary {
    pub id: String,
    pub content_hash: String,
    pub file_path: String,
    pub file_name: String,
    pub title: String,
    pub authors: Vec<String>,
    pub abstract_text: Option<String>,
    pub page_count: u32,
    pub file_size: u64,
    pub created_at: String,
    pub last_opened_at: String,
}

#[tauri::command]
pub fn list_recent_papers(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> Result<Vec<PaperSummary>, AppError> {
    let limit = limit.unwrap_or(20).clamp(1, 100);
    let connection = state.database.connect()?;
    let mut statement = connection.prepare(
        r#"SELECT id,content_hash,file_path,file_name,COALESCE(title,file_name),authors_json,
           abstract_text,COALESCE(page_count,0),file_size,created_at,last_opened_at
           FROM papers ORDER BY last_opened_at DESC LIMIT ?1"#,
    )?;
    let rows = statement.query_map([limit], |row| {
        let authors_json: String = row.get(5)?;
        Ok(PaperSummary {
            id: row.get(0)?,
            content_hash: row.get(1)?,
            file_path: row.get(2)?,
            file_name: row.get(3)?,
            title: row.get(4)?,
            authors: serde_json::from_str(&authors_json).unwrap_or_default(),
            abstract_text: row.get(6)?,
            page_count: row.get(7)?,
            file_size: row.get(8)?,
            created_at: row.get(9)?,
            last_opened_at: row.get(10)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

#[tauri::command]
pub fn delete_paper(state: State<'_, AppState>, paper_id: String) -> Result<bool, AppError> {
    Ok(state
        .database
        .connect()?
        .execute("DELETE FROM papers WHERE id=?1", [paper_id])?
        > 0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingState {
    pub paper_id: String,
    pub page_number: u32,
    pub zoom: f64,
    pub zoom_mode: String,
    pub scroll_offset: f64,
    pub rotation: i32,
    pub reading_mode: String,
    pub updated_at: Option<String>,
}

fn validate_reading_state(value: &ReadingState) -> Result<(), AppError> {
    if value.page_number == 0
        || !value.zoom.is_finite()
        || !(0.1..=10.0).contains(&value.zoom)
        || !value.scroll_offset.is_finite()
        || !matches!(value.rotation.rem_euclid(360), 0 | 90 | 180 | 270)
        || !matches!(
            value.zoom_mode.as_str(),
            "custom" | "actual" | "fit-width" | "fit-page"
        )
        || !matches!(value.reading_mode.as_str(), "continuous" | "single")
    {
        return Err(AppError::InvalidInput("阅读位置数据无效。".into()));
    }
    Ok(())
}

#[tauri::command]
pub fn get_reading_state(
    state: State<'_, AppState>,
    paper_id: String,
) -> Result<Option<ReadingState>, AppError> {
    state
        .database
        .connect()?
        .query_row(
            r#"SELECT paper_id,page_number,zoom,zoom_mode,scroll_offset,rotation,reading_mode,updated_at
               FROM paper_reading_states WHERE paper_id=?1"#,
            [paper_id],
            |row| {
                Ok(ReadingState {
                    paper_id: row.get(0)?,
                    page_number: row.get(1)?,
                    zoom: row.get(2)?,
                    zoom_mode: row.get(3)?,
                    scroll_offset: row.get(4)?,
                    rotation: row.get(5)?,
                    reading_mode: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            },
        )
        .optional()
        .map_err(AppError::from)
}

#[tauri::command]
pub fn update_reading_state(
    state: State<'_, AppState>,
    reading_state: ReadingState,
) -> Result<(), AppError> {
    validate_reading_state(&reading_state)?;
    state.database.connect()?.execute(
        r#"INSERT INTO paper_reading_states
           (paper_id,page_number,zoom,zoom_mode,scroll_offset,rotation,reading_mode)
           VALUES(?1,?2,?3,?4,?5,?6,?7)
           ON CONFLICT(paper_id) DO UPDATE SET page_number=excluded.page_number,
           zoom=excluded.zoom,zoom_mode=excluded.zoom_mode,scroll_offset=excluded.scroll_offset,
           rotation=excluded.rotation,reading_mode=excluded.reading_mode,
           updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')"#,
        params![
            reading_state.paper_id,
            reading_state.page_number,
            reading_state.zoom,
            reading_state.zoom_mode,
            reading_state.scroll_offset,
            reading_state.rotation.rem_euclid(360),
            reading_state.reading_mode
        ],
    )?;
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Highlight {
    pub id: String,
    pub paper_id: String,
    pub selection_id: Option<String>,
    pub page_number: u32,
    pub selected_text: String,
    pub normalized_rects: Vec<NormalizedRect>,
    pub color: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

fn validate_rects(rects: &[NormalizedRect]) -> Result<(), AppError> {
    if rects.is_empty()
        || rects.len() > 256
        || rects.iter().any(|rect| {
            !rect.x.is_finite()
                || !rect.y.is_finite()
                || !rect.width.is_finite()
                || !rect.height.is_finite()
                || rect.x < 0.0
                || rect.y < 0.0
                || rect.width <= 0.0
                || rect.height <= 0.0
                || rect.x + rect.width > 1.001
                || rect.y + rect.height > 1.001
        })
    {
        return Err(AppError::InvalidInput(
            "高亮坐标必须是有效的页面归一化坐标。".into(),
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn save_highlight(
    state: State<'_, AppState>,
    highlight: Highlight,
) -> Result<Highlight, AppError> {
    validate_rects(&highlight.normalized_rects)?;
    if highlight.selected_text.trim().is_empty()
        || highlight.page_number == 0
        || !matches!(
            highlight.color.as_str(),
            "yellow" | "green" | "blue" | "pink" | "purple"
        )
    {
        return Err(AppError::InvalidInput("高亮数据无效。".into()));
    }
    let id = if highlight.id.trim().is_empty() {
        Uuid::new_v4().to_string()
    } else {
        highlight.id.clone()
    };
    let now = Utc::now().to_rfc3339();
    state.database.connect()?.execute(
        r#"INSERT INTO highlights(id,paper_id,selection_id,page_number,selected_text,normalized_rects_json,color,created_at,updated_at)
           VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?8) ON CONFLICT(id) DO UPDATE SET
           selection_id=excluded.selection_id,
           page_number=excluded.page_number,selected_text=excluded.selected_text,
           normalized_rects_json=excluded.normalized_rects_json,color=excluded.color,updated_at=excluded.updated_at"#,
        params![
            id,
            highlight.paper_id,
            highlight.selection_id,
            highlight.page_number,
            highlight.selected_text,
            serde_json::to_string(&highlight.normalized_rects)?,
            highlight.color,
            now
        ],
    )?;
    Ok(Highlight {
        id,
        created_at: highlight.created_at.or_else(|| Some(now.clone())),
        updated_at: Some(now),
        ..highlight
    })
}

#[tauri::command]
pub fn list_highlights(
    state: State<'_, AppState>,
    paper_id: String,
) -> Result<Vec<Highlight>, AppError> {
    let connection = state.database.connect()?;
    let mut statement = connection.prepare(
        r#"SELECT id,paper_id,selection_id,page_number,selected_text,normalized_rects_json,color,created_at,updated_at
           FROM highlights WHERE paper_id=?1 ORDER BY page_number,created_at"#,
    )?;
    let rows = statement.query_map([paper_id], |row| {
        let rects: String = row.get(5)?;
        Ok(Highlight {
            id: row.get(0)?,
            paper_id: row.get(1)?,
            selection_id: row.get(2)?,
            page_number: row.get(3)?,
            selected_text: row.get(4)?,
            normalized_rects: serde_json::from_str(&rects).unwrap_or_default(),
            color: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionRecord {
    pub id: String,
    pub paper_id: String,
    pub page_number: u32,
    pub selected_text: String,
    pub normalized_text: String,
    pub sentence: Option<String>,
    pub previous_sentence: Option<String>,
    pub next_sentence: Option<String>,
    pub paragraph: Option<String>,
    pub section_title: Option<String>,
    pub normalized_rects: Vec<NormalizedRect>,
    pub extraction_confidence: f64,
    pub created_at: Option<String>,
}

#[tauri::command]
pub fn save_selection(
    state: State<'_, AppState>,
    selection: SelectionRecord,
) -> Result<SelectionRecord, AppError> {
    if selection.id.trim().is_empty()
        || selection.paper_id.trim().is_empty()
        || selection.page_number == 0
        || selection.selected_text.trim().is_empty()
        || selection.normalized_text.trim().is_empty()
        || !selection.extraction_confidence.is_finite()
        || !(0.0..=1.0).contains(&selection.extraction_confidence)
    {
        return Err(AppError::InvalidInput("选区上下文数据无效。".into()));
    }
    validate_rects(&selection.normalized_rects)?;
    let now = Utc::now().to_rfc3339();
    state.database.connect()?.execute(
        r#"INSERT INTO selections
           (id,paper_id,page_number,selected_text,normalized_text,sentence,previous_sentence,next_sentence,
            paragraph,section_title,normalized_rects_json,extraction_confidence,created_at)
           VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
           ON CONFLICT(id) DO UPDATE SET selected_text=excluded.selected_text,
           normalized_text=excluded.normalized_text,sentence=excluded.sentence,
           previous_sentence=excluded.previous_sentence,next_sentence=excluded.next_sentence,
           paragraph=excluded.paragraph,section_title=excluded.section_title,
           normalized_rects_json=excluded.normalized_rects_json,
           extraction_confidence=excluded.extraction_confidence"#,
        params![
            selection.id,
            selection.paper_id,
            selection.page_number,
            selection.selected_text,
            selection.normalized_text,
            selection.sentence,
            selection.previous_sentence,
            selection.next_sentence,
            selection.paragraph,
            selection.section_title,
            serde_json::to_string(&selection.normalized_rects)?,
            selection.extraction_confidence,
            now
        ],
    )?;
    Ok(SelectionRecord {
        created_at: selection.created_at.or(Some(now)),
        ..selection
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperPageText {
    pub paper_id: String,
    pub page_number: u32,
    pub text_content: Option<String>,
    pub text_hash: Option<String>,
    pub section_title: Option<String>,
    pub extraction_status: String,
}

#[tauri::command]
pub fn save_paper_page_text(
    state: State<'_, AppState>,
    page: PaperPageText,
) -> Result<(), AppError> {
    if page.page_number == 0
        || !matches!(
            page.extraction_status.as_str(),
            "pending" | "extracting" | "ready" | "no-text" | "failed"
        )
        || page
            .text_content
            .as_ref()
            .is_some_and(|value| value.len() > 20 * 1024 * 1024)
    {
        return Err(AppError::InvalidInput("PDF 页面文本数据无效。".into()));
    }
    state.database.connect()?.execute(
        r#"INSERT INTO paper_pages
           (paper_id,page_number,text_content,text_hash,section_title,extraction_status)
           VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(paper_id,page_number) DO UPDATE SET
           text_content=excluded.text_content,text_hash=excluded.text_hash,
           section_title=excluded.section_title,extraction_status=excluded.extraction_status,
           updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')"#,
        params![
            page.paper_id,
            page.page_number,
            page.text_content,
            page.text_hash,
            page.section_title,
            page.extraction_status
        ],
    )?;
    Ok(())
}

#[tauri::command]
pub fn delete_highlight(state: State<'_, AppState>, id: String) -> Result<bool, AppError> {
    Ok(state
        .database
        .connect()?
        .execute("DELETE FROM highlights WHERE id=?1", [id])?
        > 0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub paper_id: String,
    pub page_number: u32,
    pub selection_id: Option<String>,
    pub highlight_id: Option<String>,
    pub selected_text: Option<String>,
    pub source_sentence: Option<String>,
    pub content_markdown: String,
    pub tags: Vec<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[tauri::command]
pub fn save_note(state: State<'_, AppState>, note: Note) -> Result<Note, AppError> {
    if note.content_markdown.trim().is_empty()
        || note.content_markdown.chars().count() > 1_000_000
        || note.page_number == 0
        || note.tags.len() > 100
    {
        return Err(AppError::InvalidInput(
            "空笔记不会保存，或笔记内容超出限制。".into(),
        ));
    }
    let id = if note.id.trim().is_empty() {
        Uuid::new_v4().to_string()
    } else {
        note.id.clone()
    };
    let now = Utc::now().to_rfc3339();
    state.database.connect()?.execute(
        r#"INSERT INTO notes(id,paper_id,page_number,selection_id,highlight_id,selected_text,source_sentence,content_markdown,tags_json,created_at,updated_at)
           VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10) ON CONFLICT(id) DO UPDATE SET
           page_number=excluded.page_number,selection_id=excluded.selection_id,
           highlight_id=excluded.highlight_id,selected_text=excluded.selected_text,
           source_sentence=excluded.source_sentence,content_markdown=excluded.content_markdown,
           tags_json=excluded.tags_json,updated_at=excluded.updated_at"#,
        params![
            id,
            note.paper_id,
            note.page_number,
            note.selection_id,
            note.highlight_id,
            note.selected_text,
            note.source_sentence,
            note.content_markdown.trim(),
            serde_json::to_string(&note.tags)?,
            now
        ],
    )?;
    Ok(Note {
        id,
        content_markdown: note.content_markdown.trim().into(),
        created_at: note.created_at.or_else(|| Some(now.clone())),
        updated_at: Some(now),
        ..note
    })
}

#[tauri::command]
pub fn list_notes(
    state: State<'_, AppState>,
    paper_id: Option<String>,
    query: Option<String>,
) -> Result<Vec<Note>, AppError> {
    let query_pattern = query
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!("%{}%", value.trim()));
    let connection = state.database.connect()?;
    let mut statement = connection.prepare(
        r#"SELECT id,paper_id,page_number,selection_id,highlight_id,selected_text,source_sentence,
           content_markdown,tags_json,created_at,updated_at FROM notes
           WHERE (?1 IS NULL OR paper_id=?1) AND (?2 IS NULL OR content_markdown LIKE ?2 OR selected_text LIKE ?2)
           ORDER BY updated_at DESC LIMIT 1000"#,
    )?;
    let rows = statement.query_map(params![paper_id, query_pattern], |row| {
        let tags: String = row.get(8)?;
        Ok(Note {
            id: row.get(0)?,
            paper_id: row.get(1)?,
            page_number: row.get(2)?,
            selection_id: row.get(3)?,
            highlight_id: row.get(4)?,
            selected_text: row.get(5)?,
            source_sentence: row.get(6)?,
            content_markdown: row.get(7)?,
            tags: serde_json::from_str(&tags).unwrap_or_default(),
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

#[tauri::command]
pub fn delete_note(state: State<'_, AppState>, id: String) -> Result<bool, AppError> {
    Ok(state
        .database
        .connect()?
        .execute("DELETE FROM notes WHERE id=?1", [id])?
        > 0)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TermOccurrenceInput {
    pub id: String,
    pub paper_id: String,
    pub selection_id: Option<String>,
    pub page_number: u32,
    pub selected_text: String,
    pub normalized_text: String,
    pub sentence: Option<String>,
    pub paragraph: Option<String>,
    pub section_title: Option<String>,
    pub normalized_rects: Vec<NormalizedRect>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedOccurrence {
    pub term_id: String,
    pub occurrence_id: String,
}

#[tauri::command]
pub fn save_term_occurrence(
    state: State<'_, AppState>,
    occurrence: TermOccurrenceInput,
) -> Result<SavedOccurrence, AppError> {
    let normalized = occurrence
        .normalized_text
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    if normalized.is_empty() || normalized.chars().count() > 512 || occurrence.page_number == 0 {
        return Err(AppError::InvalidInput("收藏词汇数据无效。".into()));
    }
    if !occurrence.normalized_rects.is_empty() {
        validate_rects(&occurrence.normalized_rects)?;
    }
    let term_id = Uuid::new_v4().to_string();
    let occurrence_id = if occurrence.id.trim().is_empty() {
        Uuid::new_v4().to_string()
    } else {
        occurrence.id
    };
    let mut connection = state.database.connect()?;
    let transaction = connection.transaction()?;
    transaction.execute(
        r#"INSERT INTO terms(id,normalized_text,display_text) VALUES(?1,?2,?3)
           ON CONFLICT(normalized_text) DO UPDATE SET display_text=excluded.display_text,
           updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')"#,
        params![term_id, normalized, occurrence.selected_text],
    )?;
    let actual_term_id: String = transaction.query_row(
        "SELECT id FROM terms WHERE normalized_text=?1",
        [&normalized],
        |row| row.get(0),
    )?;
    transaction.execute(
        r#"INSERT INTO term_occurrences
           (id,term_id,paper_id,selection_id,page_number,selected_text,sentence,paragraph,section_title,normalized_rects_json)
           VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)"#,
        params![
            occurrence_id,
            actual_term_id,
            occurrence.paper_id,
            occurrence.selection_id,
            occurrence.page_number,
            occurrence.selected_text,
            occurrence.sentence,
            occurrence.paragraph,
            occurrence.section_title,
            serde_json::to_string(&occurrence.normalized_rects)?
        ],
    )?;
    transaction.commit()?;
    Ok(SavedOccurrence {
        term_id: actual_term_id,
        occurrence_id,
    })
}

#[tauri::command]
pub fn delete_term_occurrence(
    state: State<'_, AppState>,
    occurrence_id: String,
) -> Result<bool, AppError> {
    let mut connection = state.database.connect()?;
    let transaction = connection.transaction()?;
    let term_id: Option<String> = transaction
        .query_row(
            "SELECT term_id FROM term_occurrences WHERE id=?1",
            [&occurrence_id],
            |row| row.get(0),
        )
        .optional()?;
    let deleted =
        transaction.execute("DELETE FROM term_occurrences WHERE id=?1", [&occurrence_id])? > 0;
    if let Some(term_id) = term_id {
        transaction.execute(
            "DELETE FROM terms WHERE id=?1 AND NOT EXISTS(SELECT 1 FROM term_occurrences WHERE term_id=?1)",
            [term_id],
        )?;
    }
    transaction.commit()?;
    Ok(deleted)
}

#[tauri::command]
pub fn get_app_setting(
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<serde_json::Value>, AppError> {
    if key.is_empty() || key.len() > 200 {
        return Err(AppError::InvalidInput("设置键无效。".into()));
    }
    let serialized: Option<String> = state
        .database
        .connect()?
        .query_row(
            "SELECT value_json FROM app_settings WHERE key=?1",
            [key],
            |row| row.get(0),
        )
        .optional()?;
    serialized
        .map(|value| serde_json::from_str(&value).map_err(AppError::from))
        .transpose()
}

#[tauri::command]
pub fn set_app_setting(
    state: State<'_, AppState>,
    key: String,
    value: serde_json::Value,
) -> Result<(), AppError> {
    if key.is_empty() || key.len() > 200 || key == "ai.settings" {
        return Err(AppError::InvalidInput(
            "设置键无效或必须使用专用设置命令。".into(),
        ));
    }
    let serialized = serde_json::to_string(&value)?;
    if serialized.len() > 1024 * 1024 {
        return Err(AppError::InvalidInput("单项设置不能超过 1 MiB。".into()));
    }
    state.database.connect()?.execute(
        r#"INSERT INTO app_settings(key,value_json) VALUES(?1,?2)
           ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,
           updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')"#,
        params![key, serialized],
    )?;
    Ok(())
}
