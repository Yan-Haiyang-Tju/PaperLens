import { ChevronLeft, ChevronRight, Minus, PanelLeft, Plus, RotateCw, Scan, Search } from "lucide-react";
import { useRef } from "react";
import { useReaderStore } from "../../stores/readerStore";
import { useUiStore } from "../../stores/uiStore";
import { Tooltip } from "../ui/Tooltip";

export function ReaderControls({ onNavigate, onFitWidth, onFitPage }: { onNavigate: (page: number) => void; onFitWidth: () => void; onFitPage: () => void }) {
  const { pageNumber, pageCount, zoom, setZoom, rotation, setRotation } = useReaderStore();
  const { sidebarMode, setSidebarMode } = useUiStore();
  const pageInputRef = useRef<HTMLInputElement>(null);
  const commitPage = () => {
    const page = Number.parseInt(pageInputRef.current?.value ?? "", 10);
    if (Number.isFinite(page)) onNavigate(Math.min(pageCount, Math.max(1, page)));
    else if (pageInputRef.current) pageInputRef.current.value = String(pageNumber);
  };
  return (
    <div className="reader-controls" role="toolbar" aria-label="阅读控制">
      <Tooltip label="缩略图"><button className={`icon-button ${sidebarMode === "thumbnails" ? "reader-controls__active" : ""}`} type="button" aria-label="缩略图" onClick={() => setSidebarMode(sidebarMode === "thumbnails" ? "none" : "thumbnails")}><PanelLeft size={16} /></button></Tooltip>
      <Tooltip label="搜索"><button className={`icon-button ${sidebarMode === "search" ? "reader-controls__active" : ""}`} type="button" aria-label="搜索" onClick={() => setSidebarMode(sidebarMode === "search" ? "none" : "search")}><Search size={16} /></button></Tooltip>
      <span className="reader-controls__separator" />
      <button className="icon-button" type="button" aria-label="上一页" disabled={pageNumber <= 1} onClick={() => onNavigate(pageNumber - 1)}><ChevronLeft size={16} /></button>
      <label className="page-input"><input key={pageNumber} ref={pageInputRef} defaultValue={pageNumber} aria-label="页码" inputMode="numeric" onInput={(event) => { event.currentTarget.value = event.currentTarget.value.replace(/\D/g, ""); }} onBlur={commitPage} onKeyDown={(event) => { if (event.key === "Enter") { commitPage(); event.currentTarget.blur(); } }} /><span>/ {pageCount}</span></label>
      <button className="icon-button" type="button" aria-label="下一页" disabled={pageNumber >= pageCount} onClick={() => onNavigate(pageNumber + 1)}><ChevronRight size={16} /></button>
      <span className="reader-controls__separator" />
      <button className="icon-button" type="button" aria-label="缩小" onClick={() => setZoom(zoom - .1)}><Minus size={15} /></button>
      <button className="zoom-value" type="button" title="恢复 100%" onClick={() => setZoom(1, "actual")}>{Math.round(zoom * 100)}%</button>
      <button className="icon-button" type="button" aria-label="放大" onClick={() => setZoom(zoom + .1)}><Plus size={15} /></button>
      <div className="fit-menu">
        <button type="button" onClick={onFitWidth}>适合宽度</button><button type="button" onClick={onFitPage}>适合页面</button>
      </div>
      <span className="reader-controls__separator" />
      <Tooltip label="旋转"><button className="icon-button" type="button" aria-label="顺时针旋转" onClick={() => setRotation(((rotation + 90) % 360) as 0 | 90 | 180 | 270)}><RotateCw size={16} /></button></Tooltip>
      <Tooltip label="100%"><button className="icon-button" type="button" aria-label="实际大小" onClick={() => setZoom(1, "actual")}><Scan size={16} /></button></Tooltip>
    </div>
  );
}
