export const MIN_PDF_ZOOM = 0.25;
export const MAX_PDF_ZOOM = 4;

const WHEEL_ZOOM_SENSITIVITY = 0.0015;

export function clampPdfZoom(zoom: number): number {
  return Math.min(MAX_PDF_ZOOM, Math.max(MIN_PDF_ZOOM, zoom));
}

export function wheelDeltaInPixels(deltaY: number, deltaMode: number, viewportHeight: number): number {
  if (deltaMode === 1) return deltaY * 16;
  if (deltaMode === 2) return deltaY * viewportHeight;
  return deltaY;
}

export function zoomFromWheel(currentZoom: number, deltaY: number, deltaMode = 0, viewportHeight = 800): number {
  const pixels = wheelDeltaInPixels(deltaY, deltaMode, viewportHeight);
  return clampPdfZoom(currentZoom * Math.exp(-pixels * WHEEL_ZOOM_SENSITIVITY));
}

export type PageZoomAnchor = {
  clientX: number;
  clientY: number;
  xRatio: number;
  yRatio: number;
};

type Rect = Pick<DOMRect, "left" | "top" | "width" | "height">;

export function capturePageZoomAnchor(rect: Rect, clientX: number, clientY: number): PageZoomAnchor {
  return {
    clientX,
    clientY,
    xRatio: rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5,
    yRatio: rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5,
  };
}

export function anchoredScrollDelta(anchor: PageZoomAnchor, rect: Rect): { left: number; top: number } {
  return {
    left: rect.left + rect.width * anchor.xRatio - anchor.clientX,
    top: rect.top + rect.height * anchor.yRatio - anchor.clientY,
  };
}
