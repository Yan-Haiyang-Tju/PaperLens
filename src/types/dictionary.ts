import { z } from "zod";

export const dictionaryResultSchema = z.object({
  term: z.string(),
  phonetic: z.string().nullable(),
  partOfSpeech: z.string().nullable(),
  meaningsZh: z.array(z.string()),
  lemma: z.string().nullable(),
  provider: z.string(),
  cachedAt: z.string().nullable(),
});

export type DictionaryResult = z.infer<typeof dictionaryResultSchema>;

export interface DictionaryProvider {
  readonly id: string;
  lookup(term: string): Promise<DictionaryResult | null>;
}
