import { describe, expect, it } from "vitest";
import { isEditableTarget, matchesShortcut } from "./shortcuts";

describe("keyboard shortcuts", () => {
  it("matches platform modifier combinations without accepting missing modifiers", () => {
    const matching = new KeyboardEvent("keydown", { key: "f", ctrlKey: true });
    const missingModifier = new KeyboardEvent("keydown", { key: "f" });
    expect(matchesShortcut(matching, "Mod+F")).toBe(true);
    expect(matchesShortcut(missingModifier, "Mod+F")).toBe(false);
  });

  it("supports shifted shortcuts and ignores extra modifiers", () => {
    expect(matchesShortcut(new KeyboardEvent("keydown", { key: "B", ctrlKey: true, shiftKey: true }), "Mod+Shift+B")).toBe(true);
    expect(matchesShortcut(new KeyboardEvent("keydown", { key: "b", ctrlKey: true, shiftKey: true, altKey: true }), "Mod+Shift+B")).toBe(false);
  });

  it("recognizes editable targets", () => {
    expect(isEditableTarget(document.createElement("input"))).toBe(true);
    expect(isEditableTarget(document.createElement("textarea"))).toBe(true);
    expect(isEditableTarget(document.createElement("div"))).toBe(false);
  });
});
