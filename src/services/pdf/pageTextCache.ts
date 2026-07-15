import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

export type CachedPageText = { content: Awaited<ReturnType<PDFPageProxy["getTextContent"]>>; plainText: string };
const cache = new WeakMap<PDFDocumentProxy, Map<number, Promise<CachedPageText>>>();

export function getPageText(document: PDFDocumentProxy, pageNumber: number): Promise<CachedPageText> {
  let pages = cache.get(document);
  if (!pages) { pages = new Map(); cache.set(document, pages); }
  const existing = pages.get(pageNumber);
  if (existing) return existing;
  const pending = document.getPage(pageNumber).then(async (page) => {
    const content = await page.getTextContent({ includeMarkedContent: false });
    const plainText = content.items
      .filter((item): item is Extract<(typeof content.items)[number], { str: string }> => "str" in item)
      .map((item) => `${item.str}${item.hasEOL ? "\n" : " "}`)
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    return { content, plainText };
  });
  pages.set(pageNumber, pending);
  return pending;
}

export function clearPageTextCache(document: PDFDocumentProxy): void { cache.delete(document); }
