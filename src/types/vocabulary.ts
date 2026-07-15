import { z } from "zod";
import { normalizedRectSchema } from "./selection";

export const termSchema = z.object({
  id: z.string(),
  normalizedText: z.string(),
  displayText: z.string(),
  familiarity: z.enum(["new", "learning", "familiar", "mastered"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const termOccurrenceSchema = z.object({
  id: z.string(),
  termId: z.string(),
  paperId: z.string(),
  pageNumber: z.number().int().positive(),
  selectionId: z.string().nullable(),
  selectedText: z.string(),
  sentence: z.string().nullable(),
  paragraph: z.string().nullable(),
  sectionTitle: z.string().nullable(),
  normalizedRects: z.array(normalizedRectSchema),
  createdAt: z.string(),
});

export type Term = z.infer<typeof termSchema>;
export type TermOccurrence = z.infer<typeof termOccurrenceSchema>;
export type VocabularyEntry = Term & { occurrences: TermOccurrence[] };
