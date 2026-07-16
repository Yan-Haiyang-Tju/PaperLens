import * as Dialog from "@radix-ui/react-dialog";
import {
  BookOpen, ChevronDown, ChevronRight, FileText, Folder, FolderInput, FolderOpen,
  FolderPlus, Library, MoreHorizontal, Pencil, Search, Trash2, X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  createCollection, deleteCollection, listCollections, listPaperCollectionLinks,
  renameCollection, setPaperInCollection,
} from "../../services/database/collectionRepository";
import type { Collection, PaperCollectionLink } from "../../types/collection";
import type { Paper } from "../../types/paper";
import { buildCollectionTree, getCollectionDescendantIds, type CollectionNode } from "../../utils/collectionTree";
import { useToast } from "../ui/ToastProvider";

type Scope = string;
type FolderEditor = { mode: "create"; parentId: string | null } | { mode: "rename"; collection: Collection };

function FolderTree({
  nodes, selected, counts, onSelect, onCreateChild, onRename, onDelete, onDropPaper,
}: {
  nodes: CollectionNode[];
  selected: Scope;
  counts: Map<string, number>;
  onSelect: (id: string) => void;
  onCreateChild: (id: string) => void;
  onRename: (collection: Collection) => void;
  onDelete: (collection: Collection) => void;
  onDropPaper: (paperId: string, collectionId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const renderNode = (node: CollectionNode, depth: number) => {
    const open = !collapsed.has(node.id);
    return <li key={node.id}>
      <div
        className={`collection-row ${selected === node.id ? "collection-row--active" : ""}`}
        style={{ paddingLeft: 8 + depth * 15 }}
        onDragOver={(event) => { if (event.dataTransfer.types.includes("application/x-paperlens-paper")) event.preventDefault(); }}
        onDrop={(event) => {
          event.preventDefault();
          const paperId = event.dataTransfer.getData("application/x-paperlens-paper");
          if (paperId) onDropPaper(paperId, node.id);
        }}
      >
        <button className="collection-toggle" type="button" aria-label={open ? "折叠文件夹" : "展开文件夹"} disabled={!node.children.length} onClick={() => setCollapsed((current) => {
          const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next;
        })}>{node.children.length ? open ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}</button>
        <button className="collection-name" type="button" onClick={() => onSelect(node.id)} title={node.name}><Folder size={15} /><span>{node.name}</span><small>{counts.get(node.id) ?? 0}</small></button>
        <div className="collection-actions">
          <button type="button" aria-label={`在 ${node.name} 中新建子文件夹`} onClick={() => onCreateChild(node.id)}><FolderPlus size={13} /></button>
          <button type="button" aria-label={`重命名 ${node.name}`} onClick={() => onRename(node)}><Pencil size={12} /></button>
          <button type="button" aria-label={`删除 ${node.name}`} onClick={() => onDelete(node)}><Trash2 size={12} /></button>
        </div>
      </div>
      {open && node.children.length ? <ul>{node.children.map((child) => renderNode(child, depth + 1))}</ul> : null}
    </li>;
  };
  return <ul className="collection-tree">{nodes.map((node) => renderNode(node, 0))}</ul>;
}

export function PaperLibrary({ papers, onOpen, onOpenRecent }: { papers: Paper[]; onOpen: () => void; onOpenRecent: (paper: Paper) => void }) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [links, setLinks] = useState<PaperCollectionLink[]>([]);
  const [scope, setScope] = useState<Scope>("all");
  const [query, setQuery] = useState("");
  const [folderEditor, setFolderEditor] = useState<FolderEditor | null>(null);
  const [folderName, setFolderName] = useState("");
  const { showToast } = useToast();

  useEffect(() => {
    let disposed = false;
    void Promise.all([listCollections(), listPaperCollectionLinks()]).then(([nextCollections, nextLinks]) => {
      if (!disposed) { setCollections(nextCollections); setLinks(nextLinks); }
    }).catch((reason: unknown) => showToast({ kind: "error", title: "论文分类读取失败", description: String(reason) }));
    return () => { disposed = true; };
  }, [showToast]);

  const tree = useMemo(() => buildCollectionTree(collections), [collections]);
  const paperFolders = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of links) {
      const values = map.get(link.paperId) ?? new Set<string>(); values.add(link.collectionId); map.set(link.paperId, values);
    }
    return map;
  }, [links]);
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const collection of collections) {
      const descendants = getCollectionDescendantIds(collections, collection.id);
      result.set(collection.id, papers.filter((paper) => [...(paperFolders.get(paper.id) ?? [])].some((id) => descendants.has(id))).length);
    }
    return result;
  }, [collections, paperFolders, papers]);
  const visiblePapers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const selectedIds = !["all", "recent", "unfiled"].includes(scope) ? getCollectionDescendantIds(collections, scope) : null;
    const candidates = scope === "recent" ? papers.slice(0, 20) : papers;
    return candidates.filter((paper) => {
      const folders = paperFolders.get(paper.id) ?? new Set();
      if (scope === "unfiled" && folders.size) return false;
      if (selectedIds && ![...folders].some((id) => selectedIds.has(id))) return false;
      if (!normalizedQuery) return true;
      return [paper.title, paper.fileName, ...paper.authors].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [collections, paperFolders, papers, query, scope]);

  const openEditor = (editor: FolderEditor) => {
    setFolderEditor(editor);
    setFolderName(editor.mode === "rename" ? editor.collection.name : "");
  };
  const submitFolder = async () => {
    if (!folderEditor || !folderName.trim()) return;
    try {
      if (folderEditor.mode === "create") {
        const created = await createCollection(folderName, folderEditor.parentId);
        setCollections((items) => [...items, created]);
        setScope(created.id);
      } else {
        await renameCollection(folderEditor.collection.id, folderName);
        setCollections((items) => items.map((item) => item.id === folderEditor.collection.id ? { ...item, name: folderName.trim(), updatedAt: new Date().toISOString() } : item));
      }
      setFolderEditor(null);
    } catch (reason) {
      showToast({ kind: "error", title: "无法保存文件夹", description: reason instanceof Error ? reason.message : String(reason) });
    }
  };
  const removeFolder = async (collection: Collection) => {
    if (!window.confirm(`删除“${collection.name}”及其子文件夹？论文文件不会被删除。`)) return;
    try {
      const removed = getCollectionDescendantIds(collections, collection.id);
      await deleteCollection(collection.id);
      setCollections((items) => items.filter((item) => !removed.has(item.id)));
      setLinks((items) => items.filter((link) => !removed.has(link.collectionId)));
      if (removed.has(scope)) setScope("all");
    } catch (reason) { showToast({ kind: "error", title: "无法删除文件夹", description: String(reason) }); }
  };
  const assignPaper = async (paperId: string, collectionId: string, included = true) => {
    try {
      await setPaperInCollection(paperId, collectionId, included);
      setLinks((items) => included
        ? items.some((item) => item.paperId === paperId && item.collectionId === collectionId) ? items : [...items, { paperId, collectionId }]
        : items.filter((item) => item.paperId !== paperId || item.collectionId !== collectionId));
      if (included) showToast({ kind: "success", title: "论文已加入文件夹" });
    } catch (reason) { showToast({ kind: "error", title: "分类保存失败", description: String(reason) }); }
  };

  return <section className="library-page library-page--organized">
    <aside className="collection-sidebar">
      <div className="collection-sidebar__heading"><div><span>LIBRARY</span><strong>论文分类</strong></div><button type="button" aria-label="新建根文件夹" onClick={() => openEditor({ mode: "create", parentId: null })}><FolderPlus size={16} /></button></div>
      <nav className="smart-collections" aria-label="智能分类">
        <button className={scope === "all" ? "active" : ""} type="button" onClick={() => setScope("all")}><Library size={15} /><span>全部论文</span><small>{papers.length}</small></button>
        <button className={scope === "recent" ? "active" : ""} type="button" onClick={() => setScope("recent")}><BookOpen size={15} /><span>最近阅读</span><small>{Math.min(20, papers.length)}</small></button>
        <button className={scope === "unfiled" ? "active" : ""} type="button" onClick={() => setScope("unfiled")}><FolderInput size={15} /><span>未分类</span><small>{papers.filter((paper) => !(paperFolders.get(paper.id)?.size)).length}</small></button>
      </nav>
      <div className="collection-sidebar__label"><span>文件夹</span><button type="button" onClick={() => openEditor({ mode: "create", parentId: null })}>新建</button></div>
      {tree.length ? <FolderTree nodes={tree} selected={scope} counts={counts} onSelect={setScope} onCreateChild={(parentId) => openEditor({ mode: "create", parentId })} onRename={(collection) => openEditor({ mode: "rename", collection })} onDelete={(collection) => void removeFolder(collection)} onDropPaper={(paperId, collectionId) => void assignPaper(paperId, collectionId)} /> : <div className="collection-sidebar__empty"><Folder size={20} /><span>新建文件夹整理研究主题</span></div>}
    </aside>
    <div className="library-content">
      <header className="library-header"><div><p className="eyebrow">PAPERLENS LIBRARY</p><h1>{collections.find((item) => item.id === scope)?.name ?? (scope === "unfiled" ? "未分类" : scope === "recent" ? "最近阅读" : "全部论文")}</h1><p>{visiblePapers.length} 篇论文 · 本地保存，随时继续阅读</p></div><button className="primary-button" type="button" onClick={onOpen}><FolderOpen size={16} />添加 PDF</button></header>
      <div className="library-toolbar"><label className="library-search"><Search size={15} /><input value={query} aria-label="搜索论文库" placeholder="搜索标题、作者或文件名" onChange={(event) => setQuery(event.currentTarget.value)} />{query ? <button type="button" aria-label="清除搜索" onClick={() => setQuery("")}><X size={13} /></button> : null}</label><span>{visiblePapers.length} / {papers.length}</span></div>
      {visiblePapers.length ? <div className="paper-grid">
        {visiblePapers.map((paper) => <article className="paper-row" key={paper.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-paperlens-paper", paper.id); }}>
          <button className="paper-row__open" type="button" onClick={() => onOpenRecent(paper)}>
            <span className="paper-row__icon"><FileText size={20} /></span>
            <span className="paper-row__meta"><strong>{paper.title}</strong><span>{paper.authors.join(", ") || paper.fileName}</span></span>
            <span className="paper-row__pages">{paper.pageCount ? `${paper.pageCount} 页` : "PDF"}</span>
            <time dateTime={paper.lastOpenedAt}>{new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(paper.lastOpenedAt))}</time>
          </button>
          <details className="paper-folder-menu"><summary aria-label={`整理 ${paper.title}`}><MoreHorizontal size={16} /></summary><div><strong>加入文件夹</strong>{collections.length ? collections.map((collection) => <label key={collection.id}><input type="checkbox" checked={paperFolders.get(paper.id)?.has(collection.id) ?? false} onChange={(event) => void assignPaper(paper.id, collection.id, event.currentTarget.checked)} /><Folder size={13} /><span>{collection.name}</span></label>) : <button type="button" onClick={() => openEditor({ mode: "create", parentId: null })}><FolderPlus size={14} />新建第一个文件夹</button>}</div></details>
        </article>)}
      </div> : papers.length ? <div className="library-empty library-empty--compact"><Search size={24} /><h2>没有匹配的论文</h2><p>换一个搜索词或选择其他文件夹。</p></div> : <div className="library-empty" onDoubleClick={onOpen}><div className="empty-state__icon"><FileText size={25} /></div><h2>从第一篇论文开始</h2><p>打开本地 PDF，或直接把文件拖到窗口中。PaperLens 不会上传论文。</p><button className="secondary-button" type="button" onClick={onOpen}><FolderOpen size={16} />选择 PDF</button><span>支持带文本层的 PDF 文件</span></div>}
    </div>
    <Dialog.Root open={Boolean(folderEditor)} onOpenChange={(open) => { if (!open) setFolderEditor(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content folder-dialog"><header><div><Dialog.Title>{folderEditor?.mode === "rename" ? "重命名文件夹" : "新建文件夹"}</Dialog.Title><Dialog.Description>{folderEditor?.mode === "create" && folderEditor.parentId ? "创建嵌套分类" : "用研究主题、项目或阅读计划整理论文"}</Dialog.Description></div><Dialog.Close asChild><button className="icon-button" type="button" aria-label="关闭"><X size={16} /></button></Dialog.Close></header><label>名称<input autoFocus className="text-input" value={folderName} maxLength={120} placeholder="例如：具身智能" onChange={(event) => setFolderName(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitFolder(); }} /></label><footer><Dialog.Close asChild><button className="secondary-button" type="button">取消</button></Dialog.Close><button className="primary-button" type="button" disabled={!folderName.trim()} onClick={() => void submitFolder()}>保存</button></footer></Dialog.Content></Dialog.Portal></Dialog.Root>
  </section>;
}
