import { describe, expect, it } from "vitest";
import { extractSelectionContext, normalizeSelectedText } from "./selectionText";

describe("normalizeSelectedText", () => {
  it("collapses PDF whitespace", () => expect(normalizeSelectedText("  contextual   meaning \n in papers ")).toBe("contextual meaning in papers"));
  it("repairs a line-end hyphen", () => expect(normalizeSelectedText("general-\nization ability")).toBe("generalization ability"));
  it("keeps meaningful inline hyphens", () => expect(normalizeSelectedText("vision-language-action and soft-body")).toBe("vision-language-action and soft-body"));
});

describe("extractSelectionContext", () => {
  it("finds the surrounding sentence without inventing context", () => {
    const result = extractSelectionContext("We introduce the model. Contextual meaning depends on the paper. Results follow.", "Contextual meaning");
    expect(result.sentence).toBe("Contextual meaning depends on the paper.");
    expect(result.previousSentence).toBe("We introduce the model.");
    expect(result.nextSentence).toBe("Results follow.");
    expect(result.extractionConfidence).toBeGreaterThan(.9);
  });
  it("marks low confidence when text cannot be restored", () => expect(extractSelectionContext("unrelated", "missing").extractionConfidence).toBeLessThan(.6));
});
