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
import { usePdfSelection } from "../../hooks/usePdfSelection";
import { useSettingsStore } from "../../stores/settingsStore";
import { SelectionToolbar } from "../selection/SelectionToolbar";
import { useToast } from "../ui/ToastProvider";
import { listHighlights } from "../../services/database/annotationRepository";
import { getReadingState, saveReadingState } from "../../services/database/paperRepository";
import { useAnnotationStore } from "../../stores/annotationStore";
import { ReaderRightPanel } from "../layout/ReaderRightPanel";
import { toggleTermOccurrence } from "../../services/database/vocabularyRepository";
import { useSelectionStore } from "../../stores/selectionStore";
import { DictionaryPopover } from "../dictionary/DictionaryPopover";

export function PdfViewport({ paper }: { paper: Paper }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const { document, loadingState, error, pageNumber, zoom, rotation, setDocument, setLoadingState, setPageNumber, setZoom, reset } = useReaderStore();
  const updatePaper = useUiStore((state) => state.updatePaper);
  const [noTextLayer, setNoTextLayer] = useState(false);
  const [dictionaryOpen, setDictionaryOpen] = useState(false);
  const { id: paperId, contentHash, filePath, fileName } = paper;
  const selectionToolbarEnabled = useSettingsStore((state) => state.settings.showSelectionToolbar);
  const setRightPanelMode = useUiStore((state) => state.setRightPanelMode);
  const { showToast } = useToast();
  const hydrateHighlights = useAnnotationStore((state) => state.hydratePaper);
  usePdfSelection(viewportRef, document, paperId, rotation, selectionToolbarEnabled);
  const selectedContext = useSelectionStore((state) => state.selection);
  const selectionAnchor = useSelectionStore((state) => state.anchor);

  const toggleFavorite = useCallback(() => {
    const selection = useSelectionStore.getState().selection;
    if (!selection) return;
    void toggleTermOccurrence(selection).then((added) => {
      setRightPanelMode("vocabulary");
      setDictionaryOpen(false);
      showToast({ kind: "success", title: added ? "已收藏术语" : "已取消本次收藏" });
      useSelectionStore.getState().closeToolbar();
    }).catch((reason: unknown) => showToast({ kind: "error", title: "术语保存失败", description: reason instanceof Error ? reason.message : String(reason) }));
  }, [setRightPanelMode, showToast]);

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
        const [savedState, highlights] = await Promise.all([getReadingState(paperId), listHighlights(paperId)]);
        if (disposed) return;
        if (savedState) useReaderStore.getState().hydrate(savedState);
        hydrateHighlights(paperId, highlights);
        const metadata = await readPdfMetadata(loadedDocument, fileName.replace(/\.pdf$/i, ""));
        const next = { ...metadata, pageCount: loadedDocument.numPages };
        updatePaper(paperId, next);
        void updatePaperMetadata(paperId, next).catch(() => undefined);
        setLoadingState("ready");
        if (savedState) window.setTimeout(() => {
          const target = globalThis.document.getElementById(`pdf-page-${savedState.pageNumber}`);
          target?.scrollIntoView({ block: "start" });
          if (viewportRef.current) viewportRef.current.scrollTop += savedState.scrollOffset;
        }, 0);
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
  }, [contentHash, fileName, filePath, hydrateHighlights, paperId, reset, setDocument, setLoadingState, updatePaper]);

  useEffect(() => {
    if (loadingState !== "ready") return;
    const timer = window.setTimeout(() => {
      void saveReadingState({
        paperId, pageNumber, scrollOffset: viewportRef.current?.scrollTop ?? 0, zoom, zoomMode: useReaderStore.getState().zoomMode,
        rotation, viewMode: useReaderStore.getState().viewMode, updatedAt: new Date().toISOString(),
      }).catch((reason: unknown) => showToast({ kind: "error", title: "阅读进度保存失败", description: reason instanceof Error ? reason.message : String(reason) }));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [loadingState, pageNumber, paperId, rotation, showToast, zoom]);

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
          {Array.from({ length: document.numPages }, (_, index) => index + 1).map((page) => <PdfPage key={page} document={document} paperId={paperId} pageNumber={page} zoom={zoom} rotation={rotation} onPageVisible={onPageVisible} />)}
        </div>
        <ReaderControls onNavigate={navigate} onFitWidth={() => void fit("fit-width")} onFitPage={() => void fit("fit-page")} />
        <SelectionToolbar
          onDictionary={() => { setDictionaryOpen(true); useSelectionStore.getState().closeToolbar(); }}
          onAi={() => { setDictionaryOpen(false); setRightPanelMode("ai"); }}
          onNote={() => setRightPanelMode("notes")}
          onFavorite={toggleFavorite}
          onHighlighted={() => showToast({ kind: "success", title: "已添加高亮" })}
          onPersistenceError={(message) => showToast({ kind: "error", title: "高亮保存失败", description: message })}
        />
        {dictionaryOpen && selectedContext && selectionAnchor ? <DictionaryPopover selection={selectedContext} anchor={selectionAnchor} onClose={() => setDictionaryOpen(false)} onAi={() => { setDictionaryOpen(false); setRightPanelMode("ai"); }} onFavorite={toggleFavorite} /> : null}
      </div>
      <ReaderRightPanel paper={paper} onNavigate={navigate} />
    </div>
  );
}
