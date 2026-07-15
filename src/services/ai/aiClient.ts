import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { aiExplanationSchema, type AiStreamEvent, type ExplainSelectionRequest } from "../../types/ai";

const mockExplanation = (selectedText: string) => aiExplanationSchema.parse({
  selectedText,
  expressionType: "technical_term",
  partOfSpeech: "noun phrase",
  basicMeaningZh: "这是一个用于开发与自动化测试的模拟基础释义。",
  contextualMeaningZh: "在当前论文语境中，该表达需要结合所在句子与章节理解。",
  sentenceTranslationZh: "这是基于当前上下文生成的模拟句子翻译。",
  technicalExplanationZh: "Mock Provider 不访问网络，用于验证流式 UI、结构校验和竞态保护。",
  roleInPaperZh: "用于验证 PaperLens 的解释流程。",
  collocations: ["contextual explanation", "academic reading"],
  relatedTerms: [{ term: "context", relationZh: "决定术语在本文中的具体含义" }],
  ambiguityNoteZh: null,
  confidence: .84,
});

async function runMock(request: ExplainSelectionRequest, onEvent: (event: AiStreamEvent) => void): Promise<void> {
  const base = { paperId: request.paper.id, requestId: request.requestId, selectionId: request.selectionId };
  onEvent({ type: "started", ...base });
  const explanation = mockExplanation(request.selection.selectedText);
  const raw = JSON.stringify(explanation);
  for (let index = 0; index < raw.length; index += 48) {
    await new Promise((resolve) => window.setTimeout(resolve, 18));
    onEvent({ type: "delta", content: raw.slice(index, index + 48), ...base });
  }
  onEvent({ type: "completed", explanation, cached: false, ...base });
}

export async function explainSelection(request: ExplainSelectionRequest, provider: string, onEvent: (event: AiStreamEvent) => void): Promise<void> {
  if (provider === "mock" || !isTauri()) return runMock(request, onEvent);
  const channel = new Channel<AiStreamEvent>();
  channel.onmessage = onEvent;
  await invoke("explain_selection", { request, onEvent: channel });
}

export async function cancelAiRequest(requestId: string): Promise<void> {
  if (isTauri()) await invoke("cancel_ai_request", { requestId });
}
