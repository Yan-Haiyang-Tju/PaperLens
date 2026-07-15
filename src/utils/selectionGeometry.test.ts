import { describe, expect, it } from "vitest";
import { calculateToolbarPosition, fromCanonicalRect, toCanonicalRect } from "./selectionGeometry";

describe("selection geometry", () => {
  it.each([0, 90, 180, 270] as const)("round-trips normalized rectangles at %s degrees", (rotation) => {
    const rect = { x: .17, y: .28, width: .31, height: .04 };
    const restored = fromCanonicalRect(toCanonicalRect(rect, rotation), rotation);
    expect(restored.x).toBeCloseTo(rect.x);
    expect(restored.y).toBeCloseTo(rect.y);
    expect(restored.width).toBeCloseTo(rect.width);
    expect(restored.height).toBeCloseTo(rect.height);
  });

  it("keeps the toolbar inside all viewport edges", () => {
    expect(calculateToolbarPosition({ left: 2, top: 2, width: 30, height: 20 }, { width: 200, height: 40 }, { width: 320, height: 200 })).toEqual({ left: 8, top: 30 });
    expect(calculateToolbarPosition({ left: 300, top: 180, width: 18, height: 12 }, { width: 200, height: 40 }, { width: 320, height: 200 })).toEqual({ left: 112, top: 132 });
  });
});
