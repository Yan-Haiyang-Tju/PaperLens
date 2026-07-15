import { ChevronDown, ChevronRight, ListTree } from "lucide-react";
import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

type OutlineItem = { id: string; title: string; page: number | null; children: OutlineItem[] };
type RawOutlineItem = { title: string; dest: string | unknown[] | null; items: RawOutlineItem[] };

async function resolveOutline(document: PDFDocumentProxy): Promise<OutlineItem[]> {
  const outline = await document.getOutline() as unknown as RawOutlineItem[];
  async function visit(items: RawOutlineItem[], parentId: string): Promise<OutlineItem[]> {
    return Promise.all(items.map(async (item, index) => {
      let page: number | null = null;
      try {
        const destination = typeof item.dest === "string" ? await document.getDestination(item.dest) as unknown as unknown[] | null : item.dest;
        const reference = destination?.[0];
        if (reference) page = await document.getPageIndex(reference as Parameters<PDFDocumentProxy["getPageIndex"]>[0]) + 1;
      } catch { page = null; }
      const id = `${parentId}-${index}`;
      return { id, title: item.title, page, children: await visit(item.items, id) };
    }));
  }
  return visit(outline, "outline");
}

function OutlineNode({ item, onNavigate }: { item: OutlineItem; onNavigate: (page: number) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <li>
      <div className="outline-row">
        {item.children.length ? <button className="outline-toggle" type="button" aria-label={open ? "折叠" : "展开"} onClick={() => setOpen((value) => !value)}>{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button> : <span className="outline-toggle" />}
        <button type="button" disabled={!item.page} title={item.title} onClick={() => { if (item.page) onNavigate(item.page); }}>{item.title}</button>
        {item.page ? <span>{item.page}</span> : null}
      </div>
      {open && item.children.length ? <ul>{item.children.map((child) => <OutlineNode key={child.id} item={child} onNavigate={onNavigate} />)}</ul> : null}
    </li>
  );
}

export function OutlineSidebar({ document, onNavigate }: { document: PDFDocumentProxy; onNavigate: (page: number) => void }) {
  const [items, setItems] = useState<OutlineItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void resolveOutline(document).then((value) => { if (!cancelled) setItems(value); });
    return () => { cancelled = true; };
  }, [document]);
  if (!items) return <div className="sidebar-loading">正在读取目录…</div>;
  if (!items.length) return <div className="sidebar-empty"><ListTree size={22} /><span>这篇 PDF 没有目录</span></div>;
  return <ul className="outline-tree">{items.map((item) => <OutlineNode key={item.id} item={item} onNavigate={onNavigate} />)}</ul>;
}
