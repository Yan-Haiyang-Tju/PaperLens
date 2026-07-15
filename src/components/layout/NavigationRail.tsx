import { BookOpenText, Library, NotebookPen, Settings, Sparkles, TextSearch } from "lucide-react";
import { useUiStore, type AppView } from "../../stores/uiStore";
import { Tooltip } from "../ui/Tooltip";

const primaryItems: Array<{ view: AppView; label: string; icon: typeof Library }> = [
  { view: "library", label: "论文库", icon: Library },
  { view: "reader", label: "阅读器", icon: BookOpenText },
  { view: "vocabulary", label: "收藏词汇", icon: TextSearch },
];

export function NavigationRail() {
  const { view, activePaperId, navigate, setRightPanelMode } = useUiStore();
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
      <Tooltip label="笔记"><button className="rail-button" type="button" aria-label="笔记" disabled={!activePaperId} onClick={() => setRightPanelMode("notes")}><NotebookPen size={18} /></button></Tooltip>
      <Tooltip label="AI 解释"><button className="rail-button" type="button" aria-label="AI 解释" disabled={!activePaperId} onClick={() => setRightPanelMode("ai")}><Sparkles size={18} /></button></Tooltip>
      <div className="navigation-rail__spacer" />
      <Tooltip label="设置"><button className={`rail-button ${view === "settings" ? "rail-button--active" : ""}`} type="button" aria-label="设置" onClick={() => navigate("settings")}><Settings size={18} /></button></Tooltip>
    </aside>
  );
}
