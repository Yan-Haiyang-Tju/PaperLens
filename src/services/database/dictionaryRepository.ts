import { dictionaryResultSchema, type DictionaryResult } from "../../types/dictionary";
import { getDatabase } from "./client";

export async function getCachedDictionaryResult(normalizedTerm: string): Promise<DictionaryResult | null> {
  const database = await getDatabase();
  if (!database) return null;
  const rows = await database.select<Array<{ result_json: string; expires_at: string | null }>>(
    "SELECT result_json,expires_at FROM dictionary_cache WHERE normalized_term=$1 AND (expires_at IS NULL OR expires_at>$2) ORDER BY created_at DESC LIMIT 1",
    [normalizedTerm, new Date().toISOString()],
  );
  if (!rows[0]) return null;
  try { return dictionaryResultSchema.parse(JSON.parse(rows[0].result_json) as unknown); } catch { return null; }
}

export async function setCachedDictionaryResult(cacheKey: string, normalizedTerm: string, result: DictionaryResult): Promise<void> {
  const database = await getDatabase();
  if (!database) return;
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await database.execute(
    "INSERT INTO dictionary_cache(cache_key,normalized_term,provider,result_json,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(cache_key) DO UPDATE SET result_json=excluded.result_json,created_at=excluded.created_at,expires_at=excluded.expires_at",
    [cacheKey, normalizedTerm, result.provider, JSON.stringify(result), now.toISOString(), expires],
  );
}

export async function getImportedDictionaryResult(normalizedTerm: string): Promise<DictionaryResult | null> {
  const database = await getDatabase();
  if (!database) return null;
  const rows = await database.select<Array<{ result_json: string }>>("SELECT result_json FROM local_dictionary_entries WHERE normalized_term=$1", [normalizedTerm]);
  if (!rows[0]) return null;
  try { return dictionaryResultSchema.parse(JSON.parse(rows[0].result_json) as unknown); } catch { return null; }
}

export async function importDictionaryEntries(entries: DictionaryResult[], sourceName: string): Promise<number> {
  const database = await getDatabase();
  if (!database) return 0;
  const importedAt = new Date().toISOString();
  let count = 0;
  for (const entry of entries) {
    const normalized = entry.term.trim().toLocaleLowerCase();
    if (!normalized) continue;
    await database.execute(
      "INSERT INTO local_dictionary_entries(normalized_term,result_json,source_name,imported_at) VALUES($1,$2,$3,$4) ON CONFLICT(normalized_term) DO UPDATE SET result_json=excluded.result_json,source_name=excluded.source_name,imported_at=excluded.imported_at",
      [normalized, JSON.stringify({ ...entry, provider: `imported:${sourceName}` }), sourceName, importedAt],
    );
    count += 1;
  }
  return count;
}

export async function clearDictionaryCache(): Promise<void> {
  const database = await getDatabase();
  if (database) await database.execute("DELETE FROM dictionary_cache");
}
