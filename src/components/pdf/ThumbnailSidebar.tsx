import { memo, useEffect, useRef, useState } from "react";
import { RenderingCancelledException, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";

const Thumbnail = memo(function Thumbnail({ document, pageNumber, active, onSelect }: { document: PDFDocumentProxy; pageNumber: number; active: boolean; onSelect: () => void }) {
  const rootRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 5);
  const [ratio, setRatio] = useState(1.294);

  useEffect(() => {
    const element = rootRef.current;
    if (!element || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) setVisible(true); }, { rootMargin: "500px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    void document.getPage(pageNumber).then((page) => {
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const scale = 112 / base.width;
      const viewport = page.getViewport({ scale });
      setRatio(viewport.height / viewport.width);
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvas, viewport });
      return task.promise;
    }).catch((reason: unknown) => { if (!cancelled && !(reason instanceof RenderingCancelledException)) console.warn("Thumbnail render failed", pageNumber); });
    return () => { cancelled = true; task?.cancel(); };
  }, [document, pageNumber, visible]);

  return (
    <button ref={rootRef} className={`thumbnail ${active ? "thumbnail--active" : ""}`} type="button" onClick={onSelect} aria-label={`转到第 ${pageNumber} 页`}>
      <span className="thumbnail__page" style={{ aspectRatio: `1 / ${ratio}` }}><canvas ref={canvasRef} /></span>
      <span>{pageNumber}</span>
    </button>
  );
});

export function ThumbnailSidebar({ document, pageNumber, onNavigate }: { document: PDFDocumentProxy; pageNumber: number; onNavigate: (page: number) => void }) {
  return (
    <div className="thumbnail-list" aria-label="页面缩略图">
      {Array.from({ length: document.numPages }, (_, index) => index + 1).map((page) => (
        <Thumbnail key={page} document={document} pageNumber={page} active={page === pageNumber} onSelect={() => onNavigate(page)} />
      ))}
    </div>
  );
}
