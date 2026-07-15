import { FileWarning, LoaderCircle, ScanText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { destroyPdfDocument, loadPdfDocument, readPdfMetadata } from "../../services/pdf/pdfDocument";
import { clearPageTextCache, getPageText } from "../../services/pdf/pageTextCache";
import { readPaperBytes, updatePaperMetadata } from "../../services/tauri/paperService";
import { useReaderStore } from "../../stores/readerStore";
import { useUiStore } from "../../stores/uiStore";
import type { Paper } from "../../types/paper";
import { PdfPage } from "./PdfPage";
import { ReaderControls } from "./ReaderControls";
import { ReaderSidebar } from "./ReaderSidebar";

export function PdfViewport({ paper }: { paper: Paper }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const { document, loadingState, error, pageNumber, zoom, rotation, setDocument, setLoadingState, setPageNumber, setZoom, reset } = useReaderStore();
  const updatePaper = useUiStore((state) => state.updatePaper);
  const [noTextLayer, setNoTextLayer] = useState(false);
  const { id: paperId, contentHash, filePath, fileName } = paper;

  useEffect(() => {
    let disposed = false;
    let loadedDocument: PDFDocumentProxy | null = null;
    reset();
    setLoadingState("loading");
    const load = async () => {
      try {
        const bytes = await readPaperBytes({ id: paperId, filePath });
        if (disposed) return;
        loadedDocument = await loadPdfDocument(bytes);
        if (disposed) { await destroyPdfDocument(loadedDocument); return; }
        setDocument(loadedDocument);
        const metadata = await readPdfMetadata(loadedDocument, fileName.replace(/\.pdf$/i, ""));
        const next = { ...metadata, pageCount: loadedDocument.numPages };
        updatePaper(paperId, next);
        void updatePaperMetadata(paperId, next).catch(() => undefined);
        setLoadingState("ready");
        let characters = 0;
        const samplePages = Math.min(3, loadedDocument.numPages);
        for (let page = 1; page <= samplePages; page += 1) characters += (await getPageText(loadedDocument, page)).plainText.length;
        if (!disposed) setNoTextLayer(characters < 8);
      } catch (reason) {
        if (!disposed) setLoadingState("error", reason instanceof Error ? reason.message : "PDF 加载失败");
      }
    };
    void load();
    return () => {
      disposed = true;
      if (loadedDocument) { clearPageTextCache(loadedDocument); void destroyPdfDocument(loadedDocument); }
      reset();
    };
  }, [contentHash, fileName, filePath, paperId, reset, setDocument, setLoadingState, updatePaper]);

  const navigate = useCallback((page: number) => {
    setPageNumber(page);
    globalThis.document.getElementById(`pdf-page-${page}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [setPageNumber]);

  const onPageVisible = useCallback((page: number) => setPageNumber(page), [setPageNumber]);

  const fit = useCallback(async (mode: "fit-width" | "fit-page") => {
    if (!document || !viewportRef.current) return;
    const page = await document.getPage(pageNumber);
    const base = page.getViewport({ scale: 1, rotation });
    const bounds = viewportRef.current.getBoundingClientRect();
    const widthScale = Math.max(.25, (bounds.width - 72) / base.width);
    const heightScale = Math.max(.25, (bounds.height - 84) / base.height);
    setZoom(mode === "fit-width" ? widthScale : Math.min(widthScale, heightScale), mode);
  }, [document, pageNumber, rotation, setZoom]);

  if (loadingState === "loading" || loadingState === "opening") {
    return <div className="pdf-loading"><LoaderCircle className="spin" size={25} /><strong>正在打开 {paper.fileName}</strong><span>解析页面结构与字体…</span><div className="pdf-loading__skeleton"><i /><i /><i /></div></div>;
  }
  if (loadingState === "error" || !document) {
    return <div className="empty-state"><div className="empty-state__content"><div className="empty-state__icon"><FileWarning size={25} /></div><h2>无法打开 PDF</h2><p>{error ?? "没有可用的 PDF 文档。"}</p></div></div>;
  }

  return (
    <div className="reader-layout">
      <ReaderSidebar document={document} pageNumber={pageNumber} onNavigate={navigate} />
      <div className="pdf-viewport" ref={viewportRef}>
        {noTextLayer ? <div className="scan-notice"><ScanText size={16} /><span>该 PDF 可能是扫描件，不支持直接划词。OCR 将在后续版本提供。</span></div> : null}
        <div className="pdf-page-list" style={{ gap: "var(--pdf-page-gap, 16px)" }}>
          {Array.from({ length: document.numPages }, (_, index) => index + 1).map((page) => <PdfPage key={page} document={document} pageNumber={page} zoom={zoom} rotation={rotation} onPageVisible={onPageVisible} />)}
        </div>
        <ReaderControls onNavigate={navigate} onFitWidth={() => void fit("fit-width")} onFitPage={() => void fit("fit-page")} />
      </div>
    </div>
  );
}
