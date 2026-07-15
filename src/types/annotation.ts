import { z } from "zod";
import { normalizedRectSchema } from "./selection";

export const highlightColorSchema = z.enum(["yellow", "green", "blue", "pink", "purple"]);
export type HighlightColor = z.infer<typeof highlightColorSchema>;

export const highlightSchema = z.object({
  id: z.string(),
  paperId: z.string(),
  pageNumber: z.number().int().positive(),
  selectionId: z.string().nullable(),
  selectedText: z.string(),
  normalizedRects: z.array(normalizedRectSchema),
  color: highlightColorSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Highlight = z.infer<typeof highlightSchema>;

export const noteSchema = z.object({
  id: z.string(),
  paperId: z.string(),
  pageNumber: z.number().int().positive(),
  selectionId: z.string().nullable(),
  highlightId: z.string().nullable(),
  selectedText: z.string().nullable(),
  contentMarkdown: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Note = z.infer<typeof noteSchema>;
