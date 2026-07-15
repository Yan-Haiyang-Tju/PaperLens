import { isTauri } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";

let databasePromise: Promise<Database> | null = null;

export async function getDatabase(): Promise<Database | null> {
  if (!isTauri()) return null;
  databasePromise ??= Database.load("sqlite:paperlens.db").then(async (database) => {
    await database.execute("PRAGMA foreign_keys = ON");
    return database;
  });
  return databasePromise;
}

export async function verifyForeignKeys(): Promise<boolean> {
  const database = await getDatabase();
  if (!database) return true;
  const rows = await database.select<Array<{ foreign_keys: number }>>("PRAGMA foreign_keys");
  return rows[0]?.foreign_keys === 1;
}
