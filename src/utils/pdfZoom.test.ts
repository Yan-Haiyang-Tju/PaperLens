import { describe, expect, it } from "vitest";
import {
  anchoredScrollDelta,
  capturePageZoomAnchor,
  clampPdfZoom,
  MAX_PDF_ZOOM,
  MIN_PDF_ZOOM,
  wheelDeltaInPixels,
  zoomFromWheel,
} from "./pdfZoom";

describe("PDF wheel zoom", () => {
  it("zooms in on wheel-up and out on wheel-down", () => {
    expect(zoomFromWheel(1, -100)).toBeGreaterThan(1);
    expect(zoomFromWheel(1, 100)).toBeLessThan(1);
  });

  it("clamps every zoom path to 25%-400%", () => {
    expect(clampPdfZoom(0.01)).toBe(MIN_PDF_ZOOM);
    expect(clampPdfZoom(20)).toBe(MAX_PDF_ZOOM);
    expect(zoomFromWheel(MIN_PDF_ZOOM, 10_000)).toBe(MIN_PDF_ZOOM);
    expect(zoomFromWheel(MAX_PDF_ZOOM, -10_000)).toBe(MAX_PDF_ZOOM);
  });

  it("normalizes line and page wheel deltas", () => {
    expect(wheelDeltaInPixels(2, 1, 900)).toBe(32);
    expect(wheelDeltaInPixels(1, 2, 900)).toBe(900);
    expect(wheelDeltaInPixels(12, 0, 900)).toBe(12);
  });

  it("keeps the point under the pointer stable after a page resize", () => {
    const anchor = capturePageZoomAnchor({ left: 100, top: 60, width: 600, height: 800 }, 250, 260);
    expect(anchor).toMatchObject({ xRatio: 0.25, yRatio: 0.25 });
    expect(anchoredScrollDelta(anchor, { left: 100, top: 60, width: 1200, height: 1600 })).toEqual({
      left: 150,
      top: 200,
    });
  });
});
