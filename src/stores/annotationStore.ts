import { create } from "zustand";
import type { Highlight, HighlightColor } from "../types/annotation";
import type { SelectionContext } from "../types/selection";

type AnnotationState = {
  highlights: Highlight[];
  setHighlights: (items: Highlight[]) => void;
  addHighlight: (selection: SelectionContext, color: HighlightColor) => Highlight;
  updateHighlightColor: (id: string, color: HighlightColor) => void;
  deleteHighlight: (id: string) => void;
  clearPaper: (paperId: string) => void;
};

export const useAnnotationStore = create<AnnotationState>((set) => ({
  highlights: [],
  setHighlights: (highlights) => set({ highlights }),
  addHighlight: (selection, color) => {
    const now = new Date().toISOString();
    const highlight: Highlight = {
      id: crypto.randomUUID(), paperId: selection.paperId, pageNumber: selection.pageNumber, selectionId: selection.id,
      selectedText: selection.selectedText, normalizedRects: selection.boundingRects, color, createdAt: now, updatedAt: now,
    };
    set((state) => ({ highlights: [...state.highlights, highlight] }));
    return highlight;
  },
  updateHighlightColor: (id, color) => set((state) => ({ highlights: state.highlights.map((item) => item.id === id ? { ...item, color, updatedAt: new Date().toISOString() } : item) })),
  deleteHighlight: (id) => set((state) => ({ highlights: state.highlights.filter((item) => item.id !== id) })),
  clearPaper: (paperId) => set((state) => ({ highlights: state.highlights.filter((item) => item.paperId !== paperId) })),
}));
