import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useCallback, useEffect } from "react";
import { AppShell } from "../components/layout/AppShell";
import { PaperLibrary } from "../components/library/PaperLibrary";
import { SettingsPlaceholder } from "../components/settings/SettingsPlaceholder";
import { PdfViewport } from "../components/pdf/PdfViewport";
import { chooseAndImportPaper, listenForPdfDrops } from "../services/tauri/paperService";
import { useUiStore } from "../stores/uiStore";
import { useToast } from "../components/ui/ToastProvider";

export default function App() {
  const { view, openPapers, openPaper, activePaperId } = useUiStore();
  const activePaper = openPapers.find((paper) => paper.id === activePaperId) ?? null;
  const { showToast } = useToast();
  const handleOpen = useCallback(async () => {
    try {
      const paper = await chooseAndImportPaper();
      if (paper) openPaper(paper);
    } catch (reason) {
      showToast({ kind: "error", title: "无法打开论文", description: reason instanceof Error ? reason.message : String(reason) });
    }
  }, [openPaper, showToast]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void listenForPdfDrops(openPaper, (error) => showToast({ kind: "error", title: "无法导入 PDF", description: error.message })).then((unlisten) => { cleanup = unlisten; });
    return () => cleanup?.();
  }, [openPaper, showToast]);
  return (
    <TooltipPrimitive.Provider>
      <AppShell>
        {view === "settings" ? <SettingsPlaceholder /> : view === "library" ? (
          <PaperLibrary papers={openPapers} onOpen={() => void handleOpen()} onOpenRecent={openPaper} />
        ) : view === "vocabulary" ? (
          <div className="empty-state"><div className="empty-state__content"><h2>还没有收藏词汇</h2><p>阅读论文时选中术语并点击“收藏”，上下文会显示在这里。</p></div></div>
        ) : activePaper ? <PdfViewport paper={activePaper} /> : <div className="empty-state"><div className="empty-state__content"><h2>尚未打开论文</h2><p>从论文库打开 PDF 后会在这里显示正文、缩略图和标注。</p><button className="primary-button" type="button" onClick={() => void handleOpen()}>打开 PDF</button></div></div>}
      </AppShell>
    </TooltipPrimitive.Provider>
  );
}
