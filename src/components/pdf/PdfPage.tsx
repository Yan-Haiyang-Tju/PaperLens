import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import { RenderingCancelledException, TextLayer, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import { getPageText } from "../../services/pdf/pageTextCache";
import { AnnotationOverlay } from "../annotations/AnnotationOverlay";

type PageSize = { width: number; height: number };

export const PdfPage = memo(function PdfPage({ document, paperId, pageNumber, zoom, rotation, onPageVisible }: {
  document: PDFDocumentProxy;
  paperId: string;
  pageNumber: number;
  zoom: number;
  rotation: 0 | 90 | 180 | 270;
  onPageVisible: (page: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(pageNumber <= 2);
  const [size, setSize] = useState<PageSize>({ width: 612 * zoom, height: 792 * zoom });
  const [error, setError] = useState<string | null>(null);
  const pageStyle = {
    width: size.width,
    height: size.height,
    "--scale-factor": zoom,
    "--user-unit": 1,
    "--total-scale-factor": zoom,
    "--scale-round-x": "1px",
    "--scale-round-y": "1px",
  } as CSSProperties;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") { setNearViewport(true); return; }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) setNearViewport(true);
        if (entry.intersectionRatio >= .42) onPageVisible(pageNumber);
      }
    }, { rootMargin: "1100px 0px", threshold: [0, .42] });
    observer.observe(root);
    return () => observer.disconnect();
  }, [onPageVisible, pageNumber]);

  useEffect(() => {
    if (!nearViewport) return;
    let renderTask: RenderTask | null = null;
    let textLayer: TextLayer | null = null;
    let cancelled = false;
    const renderPage = async () => {
      try {
        setError(null);
        const page = await document.getPage(pageNumber);
        const viewport = page.getViewport({ scale: zoom, rotation });
        if (cancelled) return;
        setSize({ width: viewport.width, height: viewport.height });
        const canvas = canvasRef.current;
        const textContainer = textLayerRef.current;
        if (!canvas || !textContainer) return;
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
        canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        renderTask = page.render({
          canvas,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        });
        const { content } = await getPageText(document, pageNumber);
        if (cancelled) return;
        textContainer.replaceChildren();
        textLayer = new TextLayer({ textContentSource: content, container: textContainer, viewport });
        await Promise.all([renderTask.promise, textLayer.render()]);
      } catch (reason) {
        if (cancelled || reason instanceof RenderingCancelledException) return;
        setError(reason instanceof Error ? reason.message : "页面渲染失败");
      }
    };
    void renderPage();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [document, nearViewport, pageNumber, rotation, zoom]);

  return (
    <div className="pdf-page-shell" id={`pdf-page-${pageNumber}`} ref={rootRef} data-page-number={pageNumber}>
      <div className={`pdf-page ${nearViewport ? "" : "pdf-page--placeholder"}`} style={pageStyle}>
        {error ? <div className="pdf-page__error" role="alert">第 {pageNumber} 页渲染失败<br /><small>{error}</small></div> : null}
        <canvas ref={canvasRef} className="pdf-canvas" aria-label={`PDF 第 ${pageNumber} 页`} />
        <div ref={textLayerRef} className="textLayer pdf-text-layer" data-page-number={pageNumber} />
        <AnnotationOverlay paperId={paperId} pageNumber={pageNumber} rotation={rotation} />
      </div>
      <span className="pdf-page-number">{pageNumber}</span>
    </div>
  );
});
