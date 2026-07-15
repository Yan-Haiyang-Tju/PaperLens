import { invoke, isTauri } from "@tauri-apps/api/core";
import { z } from "zod";
import { dictionaryResultSchema, type DictionaryProvider, type DictionaryResult } from "../../types/dictionary";
import { getCachedDictionaryResult, getImportedDictionaryResult, setCachedDictionaryResult } from "../database/dictionaryRepository";

const memoryCache = new Map<string, DictionaryResult | null>();

function normalizeTerm(term: string): string { return term.trim().replace(/\s+/g, " ").toLocaleLowerCase(); }

async function cacheKey(term: string, provider: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${provider}:${term}`);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

class MemoryProvider implements DictionaryProvider {
  readonly id = "memory";
  lookup(term: string): Promise<DictionaryResult | null> { return Promise.resolve(memoryCache.get(normalizeTerm(term)) ?? null); }
  has(term: string): boolean { return memoryCache.has(normalizeTerm(term)); }
}

class SqliteCacheProvider implements DictionaryProvider {
  readonly id = "sqlite-cache";
  lookup(term: string): Promise<DictionaryResult | null> { return getCachedDictionaryResult(normalizeTerm(term)); }
}

class ImportedProvider implements DictionaryProvider {
  readonly id = "imported";
  lookup(term: string): Promise<DictionaryResult | null> { return getImportedDictionaryResult(normalizeTerm(term)); }
}

class RemoteProvider implements DictionaryProvider {
  readonly id = "remote";
  constructor(private readonly url: string) {}
  async lookup(term: string): Promise<DictionaryResult | null> {
    if (!this.url || !isTauri()) return null;
    if (!this.url.startsWith("https://") && !this.url.startsWith("http://127.0.0.1") && !this.url.startsWith("http://localhost")) throw new Error("远程词典地址必须使用 HTTPS。");
    const result = await invoke<unknown>("remote_dictionary_lookup", { url: this.url, term });
    if (result === null) return null;
    const raw = z.object({
      term: z.string(), phonetic: z.string().nullable(), meanings: z.array(z.object({ partOfSpeech: z.string().nullable(), definitionsZh: z.array(z.string()) })),
      lemma: z.string().nullable(), source: z.string(), cachedAt: z.string().nullable(),
    }).parse(result);
    return dictionaryResultSchema.parse({
      term: raw.term, phonetic: raw.phonetic, partOfSpeech: raw.meanings.find((meaning) => meaning.partOfSpeech)?.partOfSpeech ?? null,
      meaningsZh: raw.meanings.flatMap((meaning) => meaning.definitionsZh), lemma: raw.lemma, provider: raw.source, cachedAt: raw.cachedAt,
    });
  }
}

const memoryProvider = new MemoryProvider();
const cacheProvider = new SqliteCacheProvider();
const importedProvider = new ImportedProvider();

export async function lookupDictionary(term: string, remoteUrl = ""): Promise<DictionaryResult | null> {
  const normalized = normalizeTerm(term);
  if (!normalized) return null;
  if (memoryProvider.has(normalized)) return memoryProvider.lookup(normalized);
  const providers: DictionaryProvider[] = [cacheProvider, importedProvider];
  if (remoteUrl) providers.push(new RemoteProvider(remoteUrl));
  for (const provider of providers) {
    const result = await provider.lookup(normalized);
    if (!result) continue;
    memoryCache.set(normalized, result);
    if (provider.id !== "sqlite-cache") await setCachedDictionaryResult(await cacheKey(normalized, provider.id), normalized, result);
    return result;
  }
  memoryCache.set(normalized, null);
  return null;
}

export function clearDictionaryMemoryCache(): void { memoryCache.clear(); }
