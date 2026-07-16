import { BookOpenText, Library, NotebookPen, Settings, Sparkles, TextSearch } from "lucide-react";
import { useUiStore, type AppView } from "../../stores/uiStore";
import { Tooltip } from "../ui/Tooltip";
import { useToast } from "../ui/ToastProvider";

const primaryItems: Array<{ view: AppView; label: string; icon: typeof Library }> = [
  { view: "library", label: "论文库", icon: Library },
  { view: "reader", label: "阅读器", icon: BookOpenText },
  { view: "vocabulary", label: "收藏词汇", icon: TextSearch },
];

export function NavigationRail() {
  const { view, activePaperId, navigate, rightPanelMode, setRightPanelMode } = useUiStore();
  const { showToast } = useToast();
  const openReaderPanel = (mode: "notes" | "ai") => {
    if (!activePaperId) {
      showToast({ kind: "info", title: "请先打开一篇论文", description: mode === "notes" ? "打开论文后可以记录划词或自由笔记。" : "打开论文并选择文字后可以请求 AI 解释。" });
      navigate("library");
      return;
    }
    navigate("reader");
    setRightPanelMode(mode);
  };
  return (
    <aside className="navigation-rail" aria-label="主导航">
      {primaryItems.map((item) => {
        const Icon = item.icon;
        const disabled = item.view === "reader" && !activePaperId;
        return (
          <Tooltip label={item.label} key={item.view}>
            <button className={`rail-button ${view === item.view ? "rail-button--active" : ""}`} type="button" aria-label={item.label} disabled={disabled} onClick={() => navigate(item.view)}><Icon size={18} /></button>
          </Tooltip>
        );
      })}
      <Tooltip label={activePaperId ? "笔记" : "笔记 · 请先打开论文"}><button className={`rail-button ${view === "reader" && rightPanelMode === "notes" ? "rail-button--active" : ""}`} type="button" aria-label="笔记" aria-disabled={!activePaperId} onClick={() => openReaderPanel("notes")}><NotebookPen size={18} /></button></Tooltip>
      <Tooltip label={activePaperId ? "AI 解释" : "AI 解释 · 请先打开论文"}><button className={`rail-button ${view === "reader" && rightPanelMode === "ai" ? "rail-button--active" : ""}`} type="button" aria-label="AI 解释" aria-disabled={!activePaperId} onClick={() => openReaderPanel("ai")}><Sparkles size={18} /></button></Tooltip>
      <div className="navigation-rail__spacer" />
      <Tooltip label="设置"><button className={`rail-button ${view === "settings" ? "rail-button--active" : ""}`} type="button" aria-label="设置" onClick={() => navigate("settings")}><Settings size={18} /></button></Tooltip>
    </aside>
  );
}
