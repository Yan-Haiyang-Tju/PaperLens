import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { AppShell } from "../components/layout/AppShell";
import { PaperLibrary } from "../components/library/PaperLibrary";
import { SettingsPlaceholder } from "../components/settings/SettingsPlaceholder";
import { useUiStore } from "../stores/uiStore";

export default function App() {
  const { view, openPapers, openPaper } = useUiStore();
  return (
    <TooltipPrimitive.Provider>
      <AppShell>
        {view === "settings" ? <SettingsPlaceholder /> : view === "library" ? (
          <PaperLibrary papers={openPapers} onOpen={() => undefined} onOpenRecent={openPaper} />
        ) : view === "vocabulary" ? (
          <div className="empty-state"><div className="empty-state__content"><h2>还没有收藏词汇</h2><p>阅读论文时选中术语并点击“收藏”，上下文会显示在这里。</p></div></div>
        ) : (
          <div className="empty-state"><div className="empty-state__content"><h2>正在准备阅读器</h2><p>打开一篇 PDF 后会在这里显示正文、缩略图和标注。</p></div></div>
        )}
      </AppShell>
    </TooltipPrimitive.Provider>
  );
}
