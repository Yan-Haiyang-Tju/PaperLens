import { useMemo } from "react";
import { useAnnotationStore } from "../../stores/annotationStore";
import { fromCanonicalRect } from "../../utils/selectionGeometry";

export function AnnotationOverlay({ paperId, pageNumber, rotation }: { paperId: string; pageNumber: number; rotation: 0 | 90 | 180 | 270 }) {
  const highlights = useAnnotationStore((state) => state.highlights);
  const pageHighlights = useMemo(() => highlights.filter((item) => item.paperId === paperId && item.pageNumber === pageNumber), [highlights, pageNumber, paperId]);
  return (
    <div className="annotation-overlay" aria-label="高亮标注">
      {pageHighlights.flatMap((highlight) => highlight.normalizedRects.map((canonical, index) => {
        const rect = fromCanonicalRect(canonical, rotation);
        return <span className={`highlight-rect highlight-rect--${highlight.color}`} key={`${highlight.id}-${index}`} style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} />;
      }))}
    </div>
  );
}
