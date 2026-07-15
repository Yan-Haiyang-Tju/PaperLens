import { Bot, NotebookPen, PanelRightClose, TextSearch } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useUiStore } from "../../stores/uiStore";
import type { Paper } from "../../types/paper";
import { NotesPanel } from "../notes/NotesPanel";
import { VocabularyPanel } from "../vocabulary/VocabularyPanel";

export function ReaderRightPanel({ paper, onNavigate }: { paper: Paper; onNavigate: (page: number) => void }) {
  const { rightPanelMode, rightPanelWidth, setRightPanelMode, setRightPanelWidth } = useUiStore();
  if (rightPanelMode === "none") return null;
  const title = rightPanelMode === "ai" ? "AI 语境解释" : rightPanelMode === "notes" ? "笔记" : "本篇词汇";
  const Icon = rightPanelMode === "ai" ? Bot : rightPanelMode === "notes" ? NotebookPen : TextSearch;
  const startResize = (event: ReactPointerEvent) => {
    const startX = event.clientX;
    const startWidth = rightPanelWidth;
    const move = (moveEvent: PointerEvent) => setRightPanelWidth(startWidth + startX - moveEvent.clientX);
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop, { once: true });
  };
  return (
    <aside className="reader-right-panel panel" style={{ width: rightPanelWidth }}>
      <div className="panel-resizer" role="separator" aria-label="调整面板宽度" aria-orientation="vertical" tabIndex={0} onPointerDown={startResize} onKeyDown={(event) => { if (event.key === "ArrowLeft") setRightPanelWidth(rightPanelWidth + 16); if (event.key === "ArrowRight") setRightPanelWidth(rightPanelWidth - 16); }} />
      <header className="panel-header"><Icon size={16} /><h2 className="panel-title">{title}</h2><button className="icon-button" type="button" aria-label="关闭右侧面板" onClick={() => setRightPanelMode("none")}><PanelRightClose size={16} /></button></header>
      <div className="reader-right-panel__content">
        {rightPanelMode === "notes" ? <NotesPanel paperId={paper.id} onNavigate={onNavigate} /> : null}
        {rightPanelMode === "vocabulary" ? <VocabularyPanel paperId={paper.id} onNavigate={(_, page) => onNavigate(page)} /> : null}
        {rightPanelMode === "ai" ? <div className="panel-hint"><Bot size={20} /><span>选中文字后点击“AI 解释”。只有此时才会发送所示上下文。</span></div> : null}
      </div>
    </aside>
  );
}
