import { useEffect, type RefObject } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { getPageText } from "../services/pdf/pageTextCache";
import { useSelectionStore } from "../stores/selectionStore";
import type { NormalizedRect, SelectionContext, ToolbarAnchor } from "../types/selection";
import { toCanonicalRect } from "../utils/selectionGeometry";
import { cleanSelectedText, extractSelectionContext, normalizeSelectedText } from "../utils/selectionText";

function closestElement(node: Node): Element | null { return node instanceof Element ? node : node.parentElement; }

function rangeAnchor(rects: DOMRect[]): ToolbarAnchor {
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

export function usePdfSelection(container: RefObject<HTMLElement | null>, document: PDFDocumentProxy | null, paperId: string, rotation: 0 | 90 | 180 | 270, enabled: boolean): void {
  useEffect(() => {
    const element = container.current;
    if (!element || !document || !enabled) return;
    let request = 0;
    const capture = () => {
      const requestId = ++request;
      window.setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        const start = closestElement(range.startContainer);
        const pageElement = start?.closest<HTMLElement>(".pdf-page");
        const shell = start?.closest<HTMLElement>(".pdf-page-shell");
        const pageNumber = Number.parseInt(shell?.dataset.pageNumber ?? "", 10);
        if (!pageElement || !shell || !Number.isFinite(pageNumber) || !element.contains(pageElement)) return;
        const selectedText = cleanSelectedText(selection.toString());
        if (!selectedText) return;
        const pageBounds = pageElement.getBoundingClientRect();
        const clientRects = Array.from(range.getClientRects()).filter((rect) => rect.width > .5 && rect.height > .5 && rect.bottom > pageBounds.top && rect.top < pageBounds.bottom);
        if (!clientRects.length || pageBounds.width <= 0 || pageBounds.height <= 0) return;
        const boundingRects = clientRects.map<NormalizedRect>((rect) => toCanonicalRect({
          x: Math.max(0, rect.left - pageBounds.left) / pageBounds.width,
          y: Math.max(0, rect.top - pageBounds.top) / pageBounds.height,
          width: Math.min(rect.width, pageBounds.right - Math.max(rect.left, pageBounds.left)) / pageBounds.width,
          height: Math.min(rect.height, pageBounds.bottom - Math.max(rect.top, pageBounds.top)) / pageBounds.height,
        }, rotation)).filter((rect) => rect.width > 0 && rect.height > 0);
        if (!boundingRects.length) return;
        const anchor = rangeAnchor(clientRects);
        void getPageText(document, pageNumber).then(({ plainText }) => {
          if (requestId !== request) return;
          const extracted = extractSelectionContext(plainText, selectedText);
          const context: SelectionContext = {
            id: crypto.randomUUID(), paperId, selectedText, normalizedText: normalizeSelectedText(selectedText), pageNumber,
            sentence: extracted.sentence, previousSentence: extracted.previousSentence, nextSentence: extracted.nextSentence,
            paragraph: extracted.paragraph, sectionTitle: null, boundingRects, extractionConfidence: extracted.extractionConfidence,
          };
          useSelectionStore.getState().setSelection(context, anchor);
        });
      }, 0);
    };
    element.addEventListener("pointerup", capture);
    element.addEventListener("keyup", capture);
    return () => { request += 1; element.removeEventListener("pointerup", capture); element.removeEventListener("keyup", capture); };
  }, [container, document, enabled, paperId, rotation]);
}
