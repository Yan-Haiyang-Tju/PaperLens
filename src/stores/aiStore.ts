import { create } from "zustand";
import type { AiExplanation, AiStreamEvent, ExplainSelectionRequest } from "../types/ai";

export type AiStatus = "idle" | "loading" | "streaming" | "repairing" | "completed" | "failed" | "cancelled";

type AiState = {
  request: ExplainSelectionRequest | null;
  status: AiStatus;
  partial: string;
  explanation: AiExplanation | null;
  error: { code: string; message: string } | null;
  cached: boolean;
  begin: (request: ExplainSelectionRequest) => void;
  receive: (event: AiStreamEvent) => void;
  markCancelled: () => void;
  reset: () => void;
};

const idle = { request: null, status: "idle" as const, partial: "", explanation: null, error: null, cached: false };

export const useAiStore = create<AiState>((set) => ({
  ...idle,
  begin: (request) => set({ request, status: "loading", partial: "", explanation: null, error: null, cached: false }),
  receive: (event) => set((state) => {
    const request = state.request;
    if (!request || event.paperId !== request.paper.id || event.requestId !== request.requestId || event.selectionId !== request.selectionId) return state;
    if (event.type === "started") return { status: "loading" };
    if (event.type === "delta") return { status: "streaming", partial: `${state.partial}${event.content}` };
    if (event.type === "repairing") return { status: "repairing" };
    if (event.type === "completed") return { status: "completed", explanation: event.explanation, partial: "", cached: event.cached, error: null };
    if (event.type === "failed") return { status: "failed", error: { code: event.code, message: event.message }, partial: "" };
    return { status: "cancelled", partial: "" };
  }),
  markCancelled: () => set({ status: "cancelled", partial: "" }),
  reset: () => set(idle),
}));
