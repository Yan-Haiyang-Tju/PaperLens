import { ShieldCheck } from "lucide-react";
import { useReaderStore } from "../../stores/readerStore";
import { useSettingsStore } from "../../stores/settingsStore";

export function StatusBar() {
  const { loadingState, parsingProgress, pageCount } = useReaderStore();
  const saving = useSettingsStore((state) => state.saving);
  return (
    <footer className="statusbar">
      <span className="statusbar__privacy"><ShieldCheck size={12} />本地优先</span>
      <span>{loadingState === "ready" ? `${pageCount} 页` : loadingState === "loading" ? "正在载入 PDF…" : "就绪"}</span>
      {parsingProgress > 0 && parsingProgress < 1 ? <span>解析文本 {Math.round(parsingProgress * 100)}%</span> : null}
      <span className="statusbar__spacer" />
      <span>{saving ? "正在保存…" : "更改已保存"}</span>
    </footer>
  );
}
