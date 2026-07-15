import { describe, expect, it } from "vitest";
import { aiExplanationSchema } from "./ai";

const valid = {
  selectedText: "attention mechanism", expressionType: "technical_term", partOfSpeech: null,
  basicMeaningZh: "注意力机制", contextualMeaningZh: "本文中的序列建模机制", sentenceTranslationZh: null,
  technicalExplanationZh: null, roleInPaperZh: null, collocations: [], relatedTerms: [], ambiguityNoteZh: null, confidence: .9,
};

describe("aiExplanationSchema", () => {
  it("accepts the complete structured response", () => expect(aiExplanationSchema.parse(valid).confidence).toBe(.9));
  it("rejects missing fields", () => expect(() => aiExplanationSchema.parse({ ...valid, relatedTerms: undefined })).toThrow());
  it("rejects out-of-range confidence", () => expect(() => aiExplanationSchema.parse({ ...valid, confidence: 1.2 })).toThrow());
});
