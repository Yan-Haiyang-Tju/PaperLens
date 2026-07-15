export function cleanSelectedText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
}

export function normalizeSelectedText(value: string): string {
  return cleanSelectedText(value)
    .replace(/([\p{L}])-\n\s*([\p{Ll}])/gu, "$1$2")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export type ExtractedContext = {
  sentence: string | null;
  previousSentence: string | null;
  nextSentence: string | null;
  paragraph: string | null;
  extractionConfidence: number;
};

function sentenceSegments(text: string): string[] {
  if (typeof Intl.Segmenter !== "undefined") {
    return Array.from(new Intl.Segmenter("en", { granularity: "sentence" }).segment(text), (item) => item.segment.trim()).filter(Boolean);
  }
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9([])/).map((item) => item.trim()).filter(Boolean);
}

export function extractSelectionContext(pageText: string, selectedText: string): ExtractedContext {
  const normalizedPage = normalizeSelectedText(pageText);
  const normalizedSelection = normalizeSelectedText(selectedText);
  const index = normalizedPage.toLocaleLowerCase().indexOf(normalizedSelection.toLocaleLowerCase());
  if (index < 0) return { sentence: null, previousSentence: null, nextSentence: null, paragraph: null, extractionConfidence: .55 };

  const sentences = sentenceSegments(normalizedPage);
  let cursor = 0;
  let sentenceIndex = -1;
  for (let i = 0; i < sentences.length; i += 1) {
    const sentence = sentences[i];
    if (!sentence) continue;
    const start = normalizedPage.indexOf(sentence, cursor);
    const end = start + sentence.length;
    if (index >= start && index <= end) { sentenceIndex = i; break; }
    cursor = Math.max(cursor, end);
  }

  const paragraphs = pageText.split(/\n{2,}/).map(normalizeSelectedText).filter(Boolean);
  const paragraph = paragraphs.find((item) => item.toLocaleLowerCase().includes(normalizedSelection.toLocaleLowerCase())) ?? null;
  return {
    sentence: sentenceIndex >= 0 ? sentences[sentenceIndex] ?? null : null,
    previousSentence: sentenceIndex > 0 ? sentences[sentenceIndex - 1] ?? null : null,
    nextSentence: sentenceIndex >= 0 ? sentences[sentenceIndex + 1] ?? null : null,
    paragraph,
    extractionConfidence: sentenceIndex >= 0 ? .94 : .76,
  };
}
