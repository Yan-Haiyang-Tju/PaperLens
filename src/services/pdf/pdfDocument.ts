import { getDocument, GlobalWorkerOptions, InvalidPDFException, PasswordException, type PDFDocumentLoadingTask, type PDFDocumentProxy } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export type PdfLoadErrorCode = "encrypted" | "invalid" | "network" | "unknown";

export class PdfLoadError extends Error {
  constructor(public readonly code: PdfLoadErrorCode, message: string) { super(message); }
}

const loadingTasks = new WeakMap<PDFDocumentProxy, PDFDocumentLoadingTask>();

export async function loadPdfDocument(data: Uint8Array): Promise<PDFDocumentProxy> {
  try {
    const task = getDocument({
      data,
      useWorkerFetch: true,
      cMapUrl: "/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdfjs/standard_fonts/",
      wasmUrl: "/pdfjs/wasm/",
    });
    const document = await task.promise;
    loadingTasks.set(document, task);
    return document;
  } catch (error) {
    if (error instanceof PasswordException) throw new PdfLoadError("encrypted", "该 PDF 已加密，需要密码才能打开。");
    if (error instanceof InvalidPDFException) throw new PdfLoadError("invalid", "PDF 文件已损坏或格式无效。");
    throw new PdfLoadError("unknown", error instanceof Error ? error.message : "PDF 加载失败。");
  }
}

export async function destroyPdfDocument(document: PDFDocumentProxy): Promise<void> {
  const task = loadingTasks.get(document);
  loadingTasks.delete(document);
  await (task?.destroy() ?? document.cleanup());
}

export async function readPdfMetadata(document: PDFDocumentProxy, fallbackTitle: string): Promise<{ title: string; authors: string[]; abstractText: string | null }> {
  const { info, metadata } = await document.getMetadata();
  const record = info as Record<string, unknown>;
  const title = typeof record.Title === "string" && record.Title.trim() ? record.Title.trim() : fallbackTitle;
  const authors = typeof record.Author === "string" ? record.Author.split(/[,;]/).map((item) => item.trim()).filter(Boolean) : [];
  const description = metadata?.get("dc:description") as unknown;
  return { title, authors, abstractText: typeof description === "string" ? description.trim() || null : null };
}
