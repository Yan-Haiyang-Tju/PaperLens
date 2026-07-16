import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  getCached: vi.fn(),
  getImported: vi.fn(),
  setCached: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke, isTauri: () => true }));
vi.mock("../database/dictionaryRepository", () => ({
  getCachedDictionaryResult: mocks.getCached,
  getImportedDictionaryResult: mocks.getImported,
  setCachedDictionaryResult: mocks.setCached,
}));

import { clearDictionaryMemoryCache, lookupDictionary } from "./dictionaryService";

const nativeResult = {
  term: "trained",
  phonetic: "treɪnd",
  meanings: [{ partOfSpeech: "v", definitionsZh: ["训练"] }],
  lemma: "train",
  source: "ECDICT（内置离线）",
  cachedAt: null,
};

describe("dictionary lookup chain", () => {
  beforeEach(() => {
    clearDictionaryMemoryCache();
    vi.clearAllMocks();
    mocks.getCached.mockResolvedValue(null);
    mocks.getImported.mockResolvedValue(null);
    mocks.setCached.mockResolvedValue(undefined);
  });

  it("does not negatively cache a miss when providers later change", async () => {
    mocks.invoke.mockResolvedValueOnce(null).mockResolvedValueOnce(nativeResult);

    await expect(lookupDictionary("trained")).resolves.toBeNull();
    await expect(lookupDictionary("trained", "https://example.com/{term}")).resolves.toMatchObject({ lemma: "train" });
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it("prefers an imported entry before the bundled provider", async () => {
    mocks.getImported.mockResolvedValue({
      term: "paper",
      phonetic: null,
      partOfSpeech: "noun",
      meaningsZh: ["用户释义"],
      lemma: null,
      provider: "imported:user",
      cachedAt: null,
    });

    await expect(lookupDictionary("paper")).resolves.toMatchObject({ meaningsZh: ["用户释义"] });
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
