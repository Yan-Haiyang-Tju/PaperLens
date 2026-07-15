const previewFields = ["basicMeaningZh", "contextualMeaningZh", "sentenceTranslationZh", "technicalExplanationZh", "roleInPaperZh"] as const;
export type PartialAiPreview = Partial<Record<(typeof previewFields)[number], string>>;

export function parsePartialAiPreview(raw: string): PartialAiPreview {
  const result: PartialAiPreview = {};
  for (const field of previewFields) {
    const match = new RegExp(`"${field}"\\s*:\\s*("(?:\\\\.|[^"\\\\])*")`).exec(raw);
    if (!match?.[1]) continue;
    try { result[field] = JSON.parse(match[1]) as string; } catch { /* incomplete JSON string */ }
  }
  return result;
}
