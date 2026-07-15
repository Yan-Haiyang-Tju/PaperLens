import { create } from "zustand";
import type { SelectionContext, ToolbarAnchor } from "../types/selection";

type SelectionState = {
  selection: SelectionContext | null;
  anchor: ToolbarAnchor | null;
  toolbarOpen: boolean;
  setSelection: (selection: SelectionContext, anchor: ToolbarAnchor) => void;
  closeToolbar: () => void;
  clear: () => void;
};

export const useSelectionStore = create<SelectionState>((set) => ({
  selection: null,
  anchor: null,
  toolbarOpen: false,
  setSelection: (selection, anchor) => set({ selection, anchor, toolbarOpen: true }),
  closeToolbar: () => set({ toolbarOpen: false }),
  clear: () => set({ selection: null, anchor: null, toolbarOpen: false }),
}));
