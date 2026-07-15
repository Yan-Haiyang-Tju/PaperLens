import type { NormalizedRect, ToolbarAnchor } from "../types/selection";

function clamp(value: number, min = 0, max = 1): number { return Math.min(max, Math.max(min, value)); }

export function toCanonicalRect(rect: NormalizedRect, rotation: 0 | 90 | 180 | 270): NormalizedRect {
  if (rotation === 90) return { x: clamp(rect.y), y: clamp(1 - rect.x - rect.width), width: clamp(rect.height, .0001), height: clamp(rect.width, .0001) };
  if (rotation === 180) return { x: clamp(1 - rect.x - rect.width), y: clamp(1 - rect.y - rect.height), width: rect.width, height: rect.height };
  if (rotation === 270) return { x: clamp(1 - rect.y - rect.height), y: clamp(rect.x), width: clamp(rect.height, .0001), height: clamp(rect.width, .0001) };
  return rect;
}

export function fromCanonicalRect(rect: NormalizedRect, rotation: 0 | 90 | 180 | 270): NormalizedRect {
  if (rotation === 90) return { x: clamp(1 - rect.y - rect.height), y: clamp(rect.x), width: clamp(rect.height, .0001), height: clamp(rect.width, .0001) };
  if (rotation === 180) return { x: clamp(1 - rect.x - rect.width), y: clamp(1 - rect.y - rect.height), width: rect.width, height: rect.height };
  if (rotation === 270) return { x: clamp(rect.y), y: clamp(1 - rect.x - rect.width), width: clamp(rect.height, .0001), height: clamp(rect.width, .0001) };
  return rect;
}

export function calculateToolbarPosition(anchor: ToolbarAnchor, toolbar: { width: number; height: number }, viewport: { width: number; height: number }, margin = 8): { left: number; top: number } {
  const desiredLeft = anchor.left + anchor.width / 2 - toolbar.width / 2;
  const left = Math.min(viewport.width - toolbar.width - margin, Math.max(margin, desiredLeft));
  const above = anchor.top - toolbar.height - 8;
  const below = anchor.top + anchor.height + 8;
  const top = above >= margin ? above : Math.min(viewport.height - toolbar.height - margin, below);
  return { left, top: Math.max(margin, top) };
}
