import { beforeEach, describe, expect, it } from "vitest";
import { useAiStore } from "./aiStore";
import type { ExplainSelectionRequest } from "../types/ai";

function request(requestId: string, selectionId: string, paperId: string): ExplainSelectionRequest {
  return {
    requestId, selectionId,
    paper: { id: paperId, title: "Paper", authors: [], abstractText: null, currentSection: null },
    selection: { id: selectionId, paperId, selectedText: "term", normalizedText: "term", pageNumber: 1, sentence: null, previousSentence: null, nextSentence: null, paragraph: null, sectionTitle: null, boundingRects: [{ x: .1, y: .1, width: .1, height: .02 }], extractionConfidence: .8 },
    preferences: { outputLanguage: "zh-CN", readerBackground: "research", detailLevel: "concise", sendAbstract: true, sendAdjacentSentences: true },
  };
}

describe("ai response race protection", () => {
  beforeEach(() => useAiStore.getState().reset());
  it("ignores a response after a rapid selection switch", () => {
    useAiStore.getState().begin(request("new-request", "new-selection", "paper"));
    useAiStore.getState().receive({ type: "delta", requestId: "old-request", selectionId: "old-selection", paperId: "paper", content: "wrong" });
    expect(useAiStore.getState().partial).toBe("");
    useAiStore.getState().receive({ type: "delta", requestId: "new-request", selectionId: "new-selection", paperId: "paper", content: "right" });
    expect(useAiStore.getState().partial).toBe("right");
  });
  it("ignores a response from another paper even with matching IDs", () => {
    useAiStore.getState().begin(request("request", "selection", "new-paper"));
    useAiStore.getState().receive({ type: "failed", requestId: "request", selectionId: "selection", paperId: "old-paper", code: "network", message: "wrong paper" });
    expect(useAiStore.getState().status).toBe("loading");
  });
});
