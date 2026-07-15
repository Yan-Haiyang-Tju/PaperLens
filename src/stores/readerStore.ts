import { create } from "zustand";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { ReadingState } from "../types/paper";

type LoadingState = "idle" | "opening" | "loading" | "ready" | "error";

type ReaderState = {
  document: PDFDocumentProxy | null;
  loadingState: LoadingState;
  error: string | null;
  pageCount: number;
  pageNumber: number;
  zoom: number;
  zoomMode: ReadingState["zoomMode"];
  rotation: ReadingState["rotation"];
  viewMode: ReadingState["viewMode"];
  parsingProgress: number;
  setDocument: (document: PDFDocumentProxy | null) => void;
  setLoadingState: (state: LoadingState, error?: string | null) => void;
  setPageNumber: (page: number) => void;
  setZoom: (zoom: number, mode?: ReadingState["zoomMode"]) => void;
  setRotation: (rotation: ReadingState["rotation"]) => void;
  setViewMode: (mode: ReadingState["viewMode"]) => void;
  setParsingProgress: (progress: number) => void;
  hydrate: (state: ReadingState) => void;
  reset: () => void;
};

const initialState = {
  document: null,
  loadingState: "idle" as const,
  error: null,
  pageCount: 0,
  pageNumber: 1,
  zoom: 1,
  zoomMode: "fit-width" as const,
  rotation: 0 as const,
  viewMode: "continuous" as const,
  parsingProgress: 0,
};

export const useReaderStore = create<ReaderState>((set, get) => ({
  ...initialState,
  setDocument: (document) => set({ document, pageCount: document?.numPages ?? 0 }),
  setLoadingState: (loadingState, error = null) => set({ loadingState, error }),
  setPageNumber: (pageNumber) => set({ pageNumber: Math.min(Math.max(1, pageNumber), Math.max(1, get().pageCount)) }),
  setZoom: (zoom, zoomMode = "custom") => set({ zoom: Math.min(4, Math.max(0.25, zoom)), zoomMode }),
  setRotation: (rotation) => set({ rotation }),
  setViewMode: (viewMode) => set({ viewMode }),
  setParsingProgress: (parsingProgress) => set({ parsingProgress: Math.min(1, Math.max(0, parsingProgress)) }),
  hydrate: (state) => set({
    pageNumber: state.pageNumber,
    zoom: state.zoom,
    zoomMode: state.zoomMode,
    rotation: state.rotation,
    viewMode: state.viewMode,
  }),
  reset: () => set(initialState),
}));
