import { create } from "zustand";
import type { Paper } from "../types/paper";

export type AppView = "library" | "reader" | "vocabulary" | "settings";
export type SidebarMode = "thumbnails" | "outline" | "search" | "none";
export type RightPanelMode = "ai" | "notes" | "vocabulary" | "none";

type UiState = {
  view: AppView;
  sidebarMode: SidebarMode;
  rightPanelMode: RightPanelMode;
  rightPanelWidth: number;
  openPapers: Paper[];
  activePaperId: string | null;
  navigate: (view: AppView) => void;
  setSidebarMode: (mode: SidebarMode) => void;
  setRightPanelMode: (mode: RightPanelMode) => void;
  setRightPanelWidth: (width: number) => void;
  openPaper: (paper: Paper) => void;
  activatePaper: (paperId: string) => void;
  closePaper: (paperId: string) => void;
};

export const useUiStore = create<UiState>((set) => ({
  view: "library",
  sidebarMode: "thumbnails",
  rightPanelMode: "none",
  rightPanelWidth: 360,
  openPapers: [],
  activePaperId: null,
  navigate: (view) => set({ view }),
  setSidebarMode: (sidebarMode) => set({ sidebarMode }),
  setRightPanelMode: (rightPanelMode) => set({ rightPanelMode }),
  setRightPanelWidth: (rightPanelWidth) => set({ rightPanelWidth: Math.min(560, Math.max(288, rightPanelWidth)) }),
  openPaper: (paper) => set((state) => ({
    openPapers: state.openPapers.some((item) => item.id === paper.id) ? state.openPapers : [...state.openPapers, paper],
    activePaperId: paper.id,
    view: "reader",
  })),
  activatePaper: (activePaperId) => set({ activePaperId, view: "reader" }),
  closePaper: (paperId) => set((state) => {
    const index = state.openPapers.findIndex((paper) => paper.id === paperId);
    const openPapers = state.openPapers.filter((paper) => paper.id !== paperId);
    if (state.activePaperId !== paperId) return { openPapers };
    const nextPaper = openPapers[Math.max(0, Math.min(index, openPapers.length - 1))];
    return {
      openPapers,
      activePaperId: nextPaper?.id ?? null,
      view: nextPaper ? "reader" : "library",
    };
  }),
}));
