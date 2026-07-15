import { Files, ListTree, Search, X } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useUiStore } from "../../stores/uiStore";
import { OutlineSidebar } from "./OutlineSidebar";
import { SearchSidebar } from "./SearchSidebar";
import { ThumbnailSidebar } from "./ThumbnailSidebar";

export function ReaderSidebar({ document, pageNumber, onNavigate }: { document: PDFDocumentProxy; pageNumber: number; onNavigate: (page: number) => void }) {
  const { sidebarMode, setSidebarMode } = useUiStore();
  if (sidebarMode === "none") return null;
  return (
    <aside className="reader-sidebar panel">
      <div className="reader-sidebar__tabs">
        <button type="button" className={sidebarMode === "thumbnails" ? "active" : ""} onClick={() => setSidebarMode("thumbnails")}><Files size={14} />页面</button>
        <button type="button" className={sidebarMode === "outline" ? "active" : ""} onClick={() => setSidebarMode("outline")}><ListTree size={14} />目录</button>
        <button type="button" className={sidebarMode === "search" ? "active" : ""} onClick={() => setSidebarMode("search")}><Search size={14} />搜索</button>
        <button type="button" className="reader-sidebar__close" aria-label="关闭侧栏" onClick={() => setSidebarMode("none")}><X size={15} /></button>
      </div>
      <div className="reader-sidebar__content">
        {sidebarMode === "thumbnails" ? <ThumbnailSidebar document={document} pageNumber={pageNumber} onNavigate={onNavigate} /> : null}
        {sidebarMode === "outline" ? <OutlineSidebar document={document} onNavigate={onNavigate} /> : null}
        {sidebarMode === "search" ? <SearchSidebar document={document} onNavigate={onNavigate} /> : null}
      </div>
    </aside>
  );
}
