import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { lazy, Suspense, useCallback, useEffect } from "react";
import { AppShell } from "../components/layout/AppShell";
import { PaperLibrary } from "../components/library/PaperLibrary";
import { SettingsPage } from "../components/settings/SettingsPage";
import { chooseAndImportPaper, listenForPdfDrops } from "../services/tauri/paperService";
import { useUiStore } from "../stores/uiStore";
import { useToast } from "../components/ui/ToastProvider";
import { useAppBootstrap } from "../hooks/useAppBootstrap";
import { VocabularyPanel } from "../components/vocabulary/VocabularyPanel";
import { useReaderStore } from "../stores/readerStore";
import { useGlobalShortcuts } from "../hooks/useGlobalShortcuts";
import { useSettingsStore } from "../stores/settingsStore";

const PdfViewport = lazy(() => import("../components/pdf/PdfViewport").then((module) => ({ default: module.PdfViewport })));

export default function App() {
  const { view, openPapers, libraryPapers, openPaper, activePaperId } = useUiStore();
  const activePaper = openPapers.find((paper) => paper.id === activePaperId) ?? null;
  const { showToast } = useToast();
  const reportDatabaseError = useCallback((message: string) => showToast({ kind: "error", title: "本地数据错误", description: message }), [showToast]);
  useAppBootstrap(reportDatabaseError);
  const handleOpen = useCallback(async () => {
    try {
      const paper = await chooseAndImportPaper();
      if (paper) openPaper(paper);
    } catch (reason) {
      showToast({ kind: "error", title: "无法打开论文", description: reason instanceof Error ? reason.message : String(reason) });
    }
  }, [openPaper, showToast]);
  const shortcuts = useSettingsStore((state) => state.settings.shortcuts);
  useGlobalShortcuts(shortcuts, () => void handleOpen());

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void listenForPdfDrops(openPaper, (error) => showToast({ kind: "error", title: "无法导入 PDF", description: error.message })).then((unlisten) => { cleanup = unlisten; });
    return () => cleanup?.();
  }, [openPaper, showToast]);
  return (
    <TooltipPrimitive.Provider>
      <AppShell>
        <Suspense fallback={<div className="empty-state"><div className="empty-state__content"><p>正在准备论文阅读器…</p></div></div>}>
        {view === "settings" ? <SettingsPage /> : view === "library" ? (
          <PaperLibrary papers={libraryPapers} onOpen={() => void handleOpen()} onOpenRecent={openPaper} />
        ) : view === "vocabulary" ? (
          <VocabularyPanel onNavigate={(paperId, page) => {
            const target = libraryPapers.find((paper) => paper.id === paperId);
            if (target) { openPaper(target); useReaderStore.getState().setPageNumber(page); window.setTimeout(() => globalThis.document.getElementById(`pdf-page-${page}`)?.scrollIntoView({ block: "start" }), 250); }
          }} />
        ) : activePaper ? <PdfViewport paper={activePaper} /> : <div className="empty-state"><div className="empty-state__content"><h2>尚未打开论文</h2><p>从论文库打开 PDF 后会在这里显示正文、缩略图和标注。</p><button className="primary-button" type="button" onClick={() => void handleOpen()}>打开 PDF</button></div></div>}
        </Suspense>
      </AppShell>
    </TooltipPrimitive.Provider>
  );
}
