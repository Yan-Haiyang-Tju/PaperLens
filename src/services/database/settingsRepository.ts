import { appSettingsSchema, defaultSettings, type AppSettings } from "../../types/settings";
import { getDatabase } from "./client";

const SETTINGS_KEY = "app_settings";

export async function loadSettings(): Promise<AppSettings> {
  const database = await getDatabase();
  if (!database) return defaultSettings;
  const rows = await database.select<Array<{ value_json: string }>>("SELECT value_json FROM app_settings WHERE key=$1", [SETTINGS_KEY]);
  if (!rows[0]) return defaultSettings;
  try {
    const parsed = JSON.parse(rows[0].value_json) as unknown;
    const overrides = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    return appSettingsSchema.parse({ ...defaultSettings, ...overrides });
  }
  catch { return defaultSettings; }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const database = await getDatabase();
  if (!database) return;
  await database.execute(
    "INSERT INTO app_settings(key,value_json,updated_at) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at",
    [SETTINGS_KEY, JSON.stringify(settings), new Date().toISOString()],
  );
}
