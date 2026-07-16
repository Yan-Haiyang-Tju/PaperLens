import { z } from "zod";

export const collectionSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120),
  parentId: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Collection = z.infer<typeof collectionSchema>;
export type PaperCollectionLink = { paperId: string; collectionId: string };
