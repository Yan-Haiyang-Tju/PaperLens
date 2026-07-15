import { House, X } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";

export function DocumentTabs() {
  const { activePaperId, openPapers, activatePaper, closePaper, navigate, view } = useUiStore();
  return (
    <nav className="document-tabs" aria-label="已打开论文">
      <button className={`document-tabs__home ${view === "library" ? "document-tab--active" : ""}`} type="button" onClick={() => navigate("library")}>
        <House size={14} /><span>论文库</span>
      </button>
      {openPapers.map((paper) => (
        <button
          className={`document-tab ${view === "reader" && paper.id === activePaperId ? "document-tab--active" : ""}`}
          key={paper.id}
          type="button"
          onClick={() => activatePaper(paper.id)}
        >
          <span className="document-tab__title">{paper.title}</span>
          <span
            className="document-tab__close"
            role="button"
            tabIndex={0}
            aria-label={`关闭 ${paper.title}`}
            onClick={(event) => { event.stopPropagation(); closePaper(paper.id); }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); closePaper(paper.id); }
            }}
          ><X size={13} /></span>
        </button>
      ))}
    </nav>
  );
}
