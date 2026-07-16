mod ai;
mod commands;
mod data_transfer;
mod database;
mod dictionary;
mod error;
mod files;
mod secure_store;
mod state;

use database::{Database, COLLECTIONS_MIGRATION, DATABASE_NAME, DATABASE_URL, INITIAL_MIGRATION};
use state::AppState;
use tauri::path::BaseDirectory;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    DATABASE_URL,
                    vec![
                        Migration {
                            version: 1,
                            description: "initial PaperLens local database",
                            sql: INITIAL_MIGRATION,
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 2,
                            description: "nested paper collections",
                            sql: COLLECTIONS_MIGRATION,
                            kind: MigrationKind::Up,
                        },
                    ],
                )
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_directory)?;
            let database = Database::new(data_directory.join(DATABASE_NAME));
            database.migrate()?;
            let bundled_dictionary_path = app
                .path()
                .resolve("resources/ecdict.sqlite3", BaseDirectory::Resource)?;
            let state = AppState::new(database, bundled_dictionary_path)?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            files::hash_pdf,
            files::import_pdf,
            files::update_paper_metadata,
            files::read_pdf,
            files::read_pdf_by_id,
            files::read_pdf_bytes,
            commands::library::list_recent_papers,
            commands::library::delete_paper,
            commands::library::get_reading_state,
            commands::library::update_reading_state,
            commands::library::save_highlight,
            commands::library::list_highlights,
            commands::library::delete_highlight,
            commands::library::save_selection,
            commands::library::save_paper_page_text,
            commands::library::save_note,
            commands::library::list_notes,
            commands::library::delete_note,
            commands::library::save_term_occurrence,
            commands::library::delete_term_occurrence,
            commands::library::get_app_setting,
            commands::library::set_app_setting,
            dictionary::lookup_dictionary,
            dictionary::remote_dictionary_lookup,
            dictionary::clear_dictionary_cache,
            dictionary::import_local_dictionary,
            ai::get_ai_settings,
            ai::get_ai_status,
            ai::update_ai_settings,
            ai::set_api_key,
            ai::delete_api_key,
            ai::test_ai_connection,
            ai::explain_selection,
            ai::cancel_ai_request,
            data_transfer::backup_database,
            data_transfer::export_data,
            data_transfer::import_data,
            commands::get_data_directory,
            commands::clear_extracted_text_cache,
            commands::validate_external_url,
            commands::open_external_url,
            commands::reveal_data_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
