import { z } from "zod";

export const normalizedRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
});

export type NormalizedRect = z.infer<typeof normalizedRectSchema>;

export const selectionContextSchema = z.object({
  id: z.string(),
  paperId: z.string(),
  selectedText: z.string().min(1),
  normalizedText: z.string().min(1),
  pageNumber: z.number().int().positive(),
  sentence: z.string().nullable(),
  previousSentence: z.string().nullable(),
  nextSentence: z.string().nullable(),
  paragraph: z.string().nullable(),
  sectionTitle: z.string().nullable(),
  boundingRects: z.array(normalizedRectSchema).min(1),
  extractionConfidence: z.number().min(0).max(1),
});

export type SelectionContext = z.infer<typeof selectionContextSchema>;

export type ToolbarAnchor = {
  left: number;
  top: number;
  width: number;
  height: number;
};
