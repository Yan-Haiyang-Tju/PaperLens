import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { BookOpenText, Minus, Square, X } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";

async function runWindowAction(action: "minimize" | "maximize" | "close"): Promise<void> {
  if (!isTauri()) return;
  try {
    const window = getCurrentWindow();
    if (action === "minimize") await window.minimize();
    if (action === "maximize") await window.toggleMaximize();
    if (action === "close") await window.close();
  } catch (reason) {
    console.error(`[PaperLens] Window action "${action}" failed.`, reason);
  }
}

export function TitleBar() {
  const activePaper = useUiStore((state) => state.openPapers.find((paper) => paper.id === state.activePaperId));

  return (
    <header className="titlebar">
      <div className="titlebar__brand" data-tauri-drag-region>
        <span className="titlebar__mark"><BookOpenText size={15} strokeWidth={2.2} /></span>
        <span>PaperLens</span>
      </div>
      <div className="titlebar__document" data-tauri-drag-region>{activePaper?.title ?? "专注阅读，理解更深"}</div>
      <div className="titlebar__drag" data-tauri-drag-region />
      <div className="window-controls" aria-label="窗口控制">
        <button className="window-control" type="button" aria-label="最小化" onClick={() => void runWindowAction("minimize")}><Minus size={16} /></button>
        <button className="window-control" type="button" aria-label="最大化或还原" onClick={() => void runWindowAction("maximize")}><Square size={13} /></button>
        <button className="window-control window-control--close" type="button" aria-label="关闭" onClick={() => void runWindowAction("close")}><X size={16} /></button>
      </div>
    </header>
  );
}
