import { describe, expect, it } from "vitest";
import { defaultSettings } from "../../types/settings";
import { buildExplainSelectionRequest, removeLocalPaths, truncateAtWord } from "./contextBuilder";

describe("AI context privacy", () => {
  it("removes Windows and Unix absolute paths", () => {
    expect(removeLocalPaths("C:\\Users\\alice\\secret\\paper.pdf and /home/alice/private/note.txt")).not.toMatch(/alice|secret|private/);
  });
  it("truncates at a word boundary", () => expect(truncateAtWord(`${"word ".repeat(30)}tail`, 42)).toMatch(/word…$/));
  it("omits adjacent sentences when disabled", () => {
    const request = buildExplainSelectionRequest(
      { id: "p", contentHash: "h", filePath: "C:\\secret.pdf", fileName: "paper.pdf", title: "Paper", authors: [], abstractText: "Abstract", pageCount: 1, fileSize: 1, createdAt: "now", lastOpenedAt: "now" },
      { id: "s", paperId: "p", selectedText: "term", normalizedText: "term", pageNumber: 1, sentence: "Sentence.", previousSentence: "Before.", nextSentence: "After.", paragraph: "Paragraph.", sectionTitle: null, boundingRects: [{ x: .1, y: .1, width: .1, height: .02 }], extractionConfidence: .9 },
      { ...defaultSettings, sendAdjacentSentences: false },
    );
    expect(request.selection.previousSentence).toBeNull();
    expect(request.selection.nextSentence).toBeNull();
    expect(JSON.stringify(request)).not.toContain("secret.pdf");
  });
});
