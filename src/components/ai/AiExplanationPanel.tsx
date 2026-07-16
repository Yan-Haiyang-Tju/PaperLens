import * as Dialog from "@radix-ui/react-dialog";
import { isTauri } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Bookmark, ChevronDown, ChevronUp, CircleAlert, Copy, Eye, LoaderCircle, MousePointer2, NotebookPen, RefreshCw, Settings, Square, X } from "lucide-react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import { cancelAiRequest } from "../../services/ai/aiClient";
import { requestContextPreview } from "../../services/ai/contextBuilder";
import { saveSelection } from "../../services/database/annotationRepository";
import { saveNote } from "../../services/database/noteRepository";
import { toggleTermOccurrence } from "../../services/database/vocabularyRepository";
import { useAiStore } from "../../stores/aiStore";
import type { AiExplanation } from "../../types/ai";
import type { Note } from "../../types/annotation";
import { parsePartialAiPreview } from "../../utils/partialAi";
import { useToast } from "../ui/ToastProvider";
import { useSettingsStore } from "../../stores/settingsStore";
import { useUiStore } from "../../stores/uiStore";

function Markdown({ children }: { children: string }) { return <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeKatex]}>{children}</ReactMarkdown>; }

function ExplanationSections({ explanation, detailed }: { explanation: AiExplanation; detailed: boolean }) {
  return <div className="ai-sections">
    <section><h3>基础释义</h3><Markdown>{explanation.basicMeaningZh}</Markdown></section>
    <section className="ai-section--accent"><h3>本文中的含义</h3><Markdown>{explanation.contextualMeaningZh}</Markdown></section>
    {explanation.sentenceTranslationZh ? <section><h3>原句翻译</h3><Markdown>{explanation.sentenceTranslationZh}</Markdown></section> : null}
    {detailed && explanation.technicalExplanationZh ? <section><h3>技术解释</h3><Markdown>{explanation.technicalExplanationZh}</Markdown></section> : null}
    {detailed && explanation.roleInPaperZh ? <section><h3>在本文中的作用</h3><Markdown>{explanation.roleInPaperZh}</Markdown></section> : null}
    {detailed && explanation.collocations.length ? <section><h3>常见搭配</h3><div className="term-chips">{explanation.collocations.map((item) => <span key={item}>{item}</span>)}</div></section> : null}
    {detailed && explanation.relatedTerms.length ? <section><h3>相关术语</h3>{explanation.relatedTerms.map((item) => <p key={item.term}><strong>{item.term}</strong> — {item.relationZh}</p>)}</section> : null}
    {detailed && explanation.ambiguityNoteZh ? <section><h3>可能的歧义</h3><Markdown>{explanation.ambiguityNoteZh}</Markdown></section> : null}
    <div className="ai-confidence"><span style={{ width: `${explanation.confidence * 100}%` }} /><small>语境判断置信度 {Math.round(explanation.confidence * 100)}%</small></div>
  </div>;
}

export function AiExplanationPanel({ onRetry, onOpenNotes }: { onRetry: () => void; onOpenNotes: () => void }) {
  const { request, status, partial, explanation, error, cached, markCancelled } = useAiStore();
  const [detailed, setDetailed] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const { showToast } = useToast();
  const settings = useSettingsStore((state) => state.settings);
  const navigate = useUiStore((state) => state.navigate);
  const preview = useMemo(() => parsePartialAiPreview(partial), [partial]);

  const stop = () => {
    if (!request) return;
    void cancelAiRequest(request.requestId).finally(markCancelled);
  };
  const copy = async () => {
    if (!explanation) return;
    const text = `${explanation.selectedText}\n\n基础释义：${explanation.basicMeaningZh}\n本文含义：${explanation.contextualMeaningZh}\n${explanation.sentenceTranslationZh ? `原句翻译：${explanation.sentenceTranslationZh}` : ""}`;
    if (isTauri()) await writeText(text); else await navigator.clipboard.writeText(text);
    showToast({ kind: "success", title: "解释已复制" });
  };
  const saveAsNote = async () => {
    if (!request || !explanation) return;
    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(), paperId: request.paper.id, pageNumber: request.selection.pageNumber, selectionId: request.selectionId,
      highlightId: null, selectedText: request.selection.selectedText,
      contentMarkdown: `### AI 语境解释\n\n**基础释义**：${explanation.basicMeaningZh}\n\n**本文含义**：${explanation.contextualMeaningZh}${explanation.sentenceTranslationZh ? `\n\n**原句翻译**：${explanation.sentenceTranslationZh}` : ""}`,
      tags: ["AI 解释"], createdAt: now, updatedAt: now,
    };
    await saveSelection(request.selection); await saveNote(note, request.selection.sentence); onOpenNotes(); showToast({ kind: "success", title: "已保存到笔记" });
  };
  const favorite = async () => {
    if (!request) return;
    const added = await toggleTermOccurrence(request.selection);
    showToast({ kind: "success", title: added ? "已收藏术语" : "已取消本次收藏" });
  };

  if (!request) {
    const needsConfiguration = settings.aiProvider !== "mock" && (!settings.aiModel.trim() || !settings.apiKeyConfigured);
    return <div className="panel-hint panel-hint--action">{needsConfiguration ? <Settings size={20} /> : <MousePointer2 size={20} />}<strong>{needsConfiguration ? "先连接你的 AI Provider" : "选择一段论文文字"}</strong><span>{needsConfiguration ? "配置模型和 API Key 后，PaperLens 才能生成语境解释。" : "选中文字，再点击浮动工具栏中的“AI 解释”。"}</span>{needsConfiguration ? <button className="secondary-button" type="button" onClick={() => navigate("settings")}><Settings size={14} />打开 AI 设置</button> : null}</div>;
  }
  return (
    <div className="ai-panel">
      <div className="ai-selection"><q>{request.selection.selectedText}</q><span>第 {request.selection.pageNumber} 页{request.selection.sectionTitle ? ` · ${request.selection.sectionTitle}` : ""}</span></div>
      <div className="ai-panel__content">
        {status === "loading" ? <div className="ai-loading"><LoaderCircle className="spin" size={20} /><strong>正在理解论文语境…</strong><span>请求已由 Rust 后端安全发送</span></div> : null}
        {status === "streaming" ? <div className="ai-streaming"><div className="ai-streaming__status"><span className="stream-dot" />正在生成结构化解释 · 已接收 {partial.length} 字符</div>{Object.entries(preview).map(([field, value]) => <section key={field}><h3>{field === "basicMeaningZh" ? "基础释义" : field === "contextualMeaningZh" ? "本文中的含义" : field === "sentenceTranslationZh" ? "原句翻译" : field === "technicalExplanationZh" ? "技术解释" : "在本文中的作用"}</h3><Markdown>{value}</Markdown></section>)}</div> : null}
        {status === "repairing" ? <div className="ai-loading"><RefreshCw className="spin" size={20} /><strong>正在修复响应格式…</strong><span>未经验证的内容不会保存</span></div> : null}
        {status === "failed" && error ? <div className="ai-error"><CircleAlert size={24} /><strong>{error.message}</strong><span>错误类型：{error.code}</span><button className="secondary-button" type="button" onClick={onRetry}><RefreshCw size={14} />重试</button></div> : null}
        {status === "cancelled" ? <div className="ai-error"><Square size={22} /><strong>生成已停止</strong><button className="secondary-button" type="button" onClick={onRetry}><RefreshCw size={14} />重新生成</button></div> : null}
        {status === "completed" && explanation ? <><ExplanationSections explanation={explanation} detailed={detailed} /><button className="ai-detail-toggle" type="button" onClick={() => setDetailed((value) => !value)}>{detailed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{detailed ? "收起详细解释" : "展开详细解释"}</button>{cached ? <span className="ai-cached">来自本地解释缓存</span> : null}</> : null}
      </div>
      <footer className="ai-actions">
        {(status === "loading" || status === "streaming" || status === "repairing") ? <button type="button" onClick={stop}><Square size={14} />停止</button> : <button type="button" onClick={onRetry}><RefreshCw size={14} />重试</button>}
        <button type="button" disabled={!explanation} onClick={() => void copy()}><Copy size={14} />复制</button>
        <button type="button" disabled={!explanation} onClick={() => void saveAsNote()}><NotebookPen size={14} />存为笔记</button>
        <button type="button" onClick={() => void favorite()}><Bookmark size={14} />收藏</button>
        <button type="button" onClick={() => setContextOpen(true)}><Eye size={14} />请求上下文</button>
      </footer>
      <Dialog.Root open={contextOpen} onOpenChange={setContextOpen}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content context-dialog"><header><Dialog.Title>本次发送的上下文</Dialog.Title><Dialog.Close asChild><button className="icon-button" type="button" aria-label="关闭"><X size={16} /></button></Dialog.Close></header><pre>{requestContextPreview(request)}</pre></Dialog.Content></Dialog.Portal></Dialog.Root>
    </div>
  );
}
