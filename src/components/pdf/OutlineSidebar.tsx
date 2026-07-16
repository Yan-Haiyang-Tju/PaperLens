import { ChevronDown, ChevronRight, ListTree } from "lucide-react";
import { useCallback, useState, useSyncExternalStore } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  getOutlineSnapshot,
  resolveOutlinePage,
  subscribeOutline,
  type OutlineItem,
} from "../../services/pdf/outlineCache";

function OutlineNode({ item, document, pages, onNavigate }: { item: OutlineItem; document: PDFDocumentProxy; pages: ReadonlyMap<string, number | null>; onNavigate: (page: number) => void }) {
  const [open, setOpen] = useState(false);
  const page = pages.get(item.id);
  const pageResolved = pages.has(item.id);
  const navigate = async () => {
    const targetPage = pageResolved ? page : await resolveOutlinePage(document, item.id);
    if (targetPage) onNavigate(targetPage);
  };
  return (
    <li>
      <div className="outline-row">
        {item.children.length ? <button className="outline-toggle" type="button" aria-label={open ? "折叠" : "展开"} onClick={() => setOpen((value) => !value)}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button> : <span className="outline-toggle" />}
        <button type="button" disabled={pageResolved && page === null} title={item.title} onClick={() => { void navigate(); }}>{item.title}</button>
        {pageResolved ? (page ? <span>{page}</span> : null) : <span aria-label="正在解析页码">…</span>}
      </div>
      {open && item.children.length ? <ul>{item.children.map((child) => <OutlineNode key={child.id} item={child} document={document} pages={pages} onNavigate={onNavigate} />)}</ul> : null}
    </li>
  );
}

export function OutlineSidebar({ document, onNavigate }: { document: PDFDocumentProxy; onNavigate: (page: number) => void }) {
  const subscribe = useCallback((listener: () => void) => subscribeOutline(document, listener), [document]);
  const getSnapshot = useCallback(() => getOutlineSnapshot(document), [document]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  if (snapshot.status === "loading") return <div className="sidebar-loading">正在读取目录…</div>;
  if (snapshot.status === "error") return <div className="sidebar-empty"><ListTree size={22} /><span>无法读取这篇 PDF 的目录</span></div>;
  if (!snapshot.items.length) return <div className="sidebar-empty"><ListTree size={22} /><span>这篇 PDF 没有目录</span></div>;
  return <ul className="outline-tree">{snapshot.items.map((item) => <OutlineNode key={item.id} item={item} document={document} pages={snapshot.pages} onNavigate={onNavigate} />)}</ul>;
}
