import { z } from "zod";
import { selectionContextSchema } from "./selection";

export const aiExplanationSchema = z.object({
  selectedText: z.string(),
  expressionType: z.enum([
    "general_word",
    "academic_expression",
    "technical_term",
    "abbreviation",
    "model_or_dataset",
    "sentence_or_passage",
    "formula_related",
    "unknown",
  ]),
  partOfSpeech: z.string().nullable(),
  basicMeaningZh: z.string(),
  contextualMeaningZh: z.string(),
  sentenceTranslationZh: z.string().nullable(),
  technicalExplanationZh: z.string().nullable(),
  roleInPaperZh: z.string().nullable(),
  collocations: z.array(z.string()),
  relatedTerms: z.array(z.object({ term: z.string(), relationZh: z.string() })),
  ambiguityNoteZh: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type AiExplanation = z.infer<typeof aiExplanationSchema>;

export const explainSelectionRequestSchema = z.object({
  requestId: z.string(),
  selectionId: z.string(),
  paper: z.object({
    id: z.string(),
    title: z.string(),
    authors: z.array(z.string()),
    abstractText: z.string().nullable(),
    currentSection: z.string().nullable(),
  }),
  selection: selectionContextSchema,
  preferences: z.object({
    outputLanguage: z.string(),
    readerBackground: z.string(),
    detailLevel: z.enum(["concise", "balanced", "detailed"]),
    sendAbstract: z.boolean(),
    sendAdjacentSentences: z.boolean(),
  }),
});

export type ExplainSelectionRequest = z.infer<typeof explainSelectionRequestSchema>;

export type AiStreamEvent =
  | { type: "started"; paperId: string; requestId: string; selectionId: string }
  | { type: "delta"; paperId: string; requestId: string; selectionId: string; content: string }
  | { type: "repairing"; paperId: string; requestId: string; selectionId: string }
  | { type: "completed"; paperId: string; requestId: string; selectionId: string; explanation: AiExplanation; cached: boolean }
  | { type: "failed"; paperId: string; requestId: string; selectionId: string; code: string; message: string }
  | { type: "cancelled"; paperId: string; requestId: string; selectionId: string };
