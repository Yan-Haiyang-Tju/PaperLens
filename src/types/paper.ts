import { z } from "zod";

export const paperSchema = z.object({
  id: z.string(),
  contentHash: z.string(),
  filePath: z.string(),
  fileName: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  abstractText: z.string().nullable(),
  pageCount: z.number().int().nonnegative(),
  fileSize: z.number().int().nonnegative(),
  createdAt: z.string(),
  lastOpenedAt: z.string(),
});

export type Paper = z.infer<typeof paperSchema>;

export const readingStateSchema = z.object({
  paperId: z.string(),
  pageNumber: z.number().int().positive(),
  scrollOffset: z.number().nonnegative(),
  zoom: z.number().positive(),
  zoomMode: z.enum(["custom", "actual", "fit-width", "fit-page"]),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  viewMode: z.enum(["continuous", "single"]),
  updatedAt: z.string(),
});

export type ReadingState = z.infer<typeof readingStateSchema>;
