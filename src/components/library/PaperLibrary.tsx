import { FileText, FolderOpen, Search } from "lucide-react";
import type { Paper } from "../../types/paper";

export function PaperLibrary({ papers, onOpen, onOpenRecent }: { papers: Paper[]; onOpen: () => void; onOpenRecent: (paper: Paper) => void }) {
  return (
    <section className="library-page">
      <header className="library-header">
        <div><p className="eyebrow">LOCAL LIBRARY</p><h1>论文库</h1><p>论文、阅读进度和标注都保存在这台设备上。</p></div>
        <button className="primary-button" type="button" onClick={onOpen}><FolderOpen size={16} />打开 PDF</button>
      </header>
      {papers.length ? (
        <>
          <div className="library-toolbar"><h2>最近阅读</h2><label className="library-search"><Search size={15} /><input aria-label="搜索论文库" placeholder="搜索标题或作者" /></label></div>
          <div className="paper-grid">
            {papers.map((paper) => (
              <button className="paper-row" type="button" key={paper.id} onClick={() => onOpenRecent(paper)}>
                <span className="paper-row__icon"><FileText size={20} /></span>
                <span className="paper-row__meta"><strong>{paper.title}</strong><span>{paper.authors.join(", ") || paper.fileName}</span></span>
                <span className="paper-row__pages">{paper.pageCount ? `${paper.pageCount} 页` : "PDF"}</span>
                <time dateTime={paper.lastOpenedAt}>{new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(paper.lastOpenedAt))}</time>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="library-empty" onDoubleClick={onOpen}>
          <div className="empty-state__icon"><FileText size={25} /></div>
          <h2>开始阅读第一篇论文</h2>
          <p>打开本地 PDF，或直接把文件拖到窗口中。PaperLens 不会上传论文。</p>
          <button className="secondary-button" type="button" onClick={onOpen}><FolderOpen size={16} />选择 PDF</button>
          <span>支持带文本层的 PDF 文件</span>
        </div>
      )}
    </section>
  );
}
