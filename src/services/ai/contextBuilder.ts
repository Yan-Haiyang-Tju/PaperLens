import type { ExplainSelectionRequest } from "../../types/ai";
import type { Paper } from "../../types/paper";
import type { SelectionContext } from "../../types/selection";
import type { AppSettings } from "../../types/settings";

const WINDOWS_PATH = /(?:[A-Za-z]:\\|\\\\)[^\s"']+/g;
const UNIX_PATH = /(?:^|\s)\/(?:Users|home|tmp|var|opt)\/[^\s"']+/g;

export function removeLocalPaths(value: string): string {
  return value.replace(WINDOWS_PATH, "[本地路径已移除]").replace(UNIX_PATH, (match) => `${match.startsWith(" ") ? " " : ""}[本地路径已移除]`);
}

export function truncateAtWord(value: string | null, maxLength = 2400): string | null {
  if (!value || value.length <= maxLength) return value;
  const boundary = value.lastIndexOf(" ", maxLength);
  return `${value.slice(0, boundary > maxLength * .72 ? boundary : maxLength).trimEnd()}…`;
}

export function buildExplainSelectionRequest(paper: Paper, selection: SelectionContext, settings: AppSettings): ExplainSelectionRequest {
  return {
    requestId: crypto.randomUUID(),
    selectionId: selection.id,
    paper: {
      id: paper.id,
      title: removeLocalPaths(paper.title),
      authors: paper.authors.map(removeLocalPaths),
      abstractText: settings.sendAbstract ? truncateAtWord(paper.abstractText ? removeLocalPaths(paper.abstractText) : null, 1800) : null,
      currentSection: selection.sectionTitle ? removeLocalPaths(selection.sectionTitle) : null,
    },
    selection: {
      ...selection,
      selectedText: removeLocalPaths(selection.selectedText),
      normalizedText: removeLocalPaths(selection.normalizedText),
      sentence: selection.sentence ? removeLocalPaths(selection.sentence) : null,
      previousSentence: settings.sendAdjacentSentences && selection.previousSentence ? removeLocalPaths(selection.previousSentence) : null,
      nextSentence: settings.sendAdjacentSentences && selection.nextSentence ? removeLocalPaths(selection.nextSentence) : null,
      paragraph: truncateAtWord(selection.paragraph ? removeLocalPaths(selection.paragraph) : null),
    },
    preferences: {
      outputLanguage: settings.outputLanguage,
      readerBackground: "research",
      detailLevel: settings.detailLevel,
      sendAbstract: settings.sendAbstract,
      sendAdjacentSentences: settings.sendAdjacentSentences,
    },
  };
}

export function requestContextPreview(request: ExplainSelectionRequest): string {
  return JSON.stringify({ paper: request.paper, selection: request.selection, preferences: request.preferences }, null, 2);
}
