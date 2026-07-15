import { isTauri } from "@tauri-apps/api/core";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Bookmark, ChevronDown, Copy, Highlighter, Languages, NotebookPen, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useAnnotationStore } from "../../stores/annotationStore";
import { useSelectionStore } from "../../stores/selectionStore";
import { useSettingsStore } from "../../stores/settingsStore";
import type { HighlightColor } from "../../types/annotation";
import { calculateToolbarPosition } from "../../utils/selectionGeometry";
import { HighlightColorMenu } from "../annotations/HighlightColorMenu";
import { saveHighlight, saveSelection } from "../../services/database/annotationRepository";

export function SelectionToolbar({ onDictionary, onAi, onNote, onFavorite, onHighlighted, onPersistenceError }: {
  onDictionary: () => void;
  onAi: () => void;
  onNote: () => void;
  onFavorite: () => void;
  onHighlighted?: () => void;
  onPersistenceError?: (message: string) => void;
}) {
  const { selection, anchor, toolbarOpen, closeToolbar } = useSelectionStore();
  const addHighlight = useAnnotationStore((state) => state.addHighlight);
  const deleteHighlight = useAnnotationStore((state) => state.deleteHighlight);
  const defaultColor = useSettingsStore((state) => state.settings.defaultHighlightColor);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const position = useMemo(() => anchor ? calculateToolbarPosition(anchor, { width: 462, height: colorMenuOpen ? 88 : 40 }, { width: window.innerWidth, height: window.innerHeight }) : null, [anchor, colorMenuOpen]);

  useEffect(() => {
    if (!toolbarOpen) return;
    const onPointerDown = (event: PointerEvent) => { if (!(event.target instanceof Node && toolbarRef.current?.contains(event.target))) closeToolbar(); };
    const onKeyDown = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { closeToolbar(); setColorMenuOpen(false); } };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("pointerdown", onPointerDown); window.removeEventListener("keydown", onKeyDown); };
  }, [closeToolbar, toolbarOpen]);

  if (!toolbarOpen || !selection || !position) return null;

  const runHighlight = (color: HighlightColor) => {
    const highlight = addHighlight(selection, color);
    setColorMenuOpen(false);
    closeToolbar();
    window.getSelection()?.removeAllRanges();
    void saveSelection(selection).then(() => saveHighlight(highlight)).then(() => onHighlighted?.()).catch((reason: unknown) => {
      deleteHighlight(highlight.id);
      onPersistenceError?.(reason instanceof Error ? reason.message : "高亮保存失败");
    });
  };
  const copy = async () => {
    if (isTauri()) await writeText(selection.selectedText);
    else await navigator.clipboard.writeText(selection.selectedText);
    closeToolbar();
  };
  const handleKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(toolbarRef.current?.querySelectorAll<HTMLButtonElement>(":scope > button:not(:disabled)") ?? []);
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next = current;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = buttons.length - 1;
    if (event.key === "ArrowRight") next = (current + 1 + buttons.length) % buttons.length;
    if (event.key === "ArrowLeft") next = (current - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus(); event.preventDefault();
  };

  return (
    <div ref={toolbarRef} className="selection-toolbar" role="toolbar" aria-label="选中文字操作" style={{ left: position.left, top: position.top }} onPointerDown={(event) => event.preventDefault()} onKeyDown={handleKeyboard}>
      <button type="button" onClick={onDictionary}><Languages size={15} /><span>即时释义</span></button>
      <button type="button" onClick={onAi}><Sparkles size={15} /><span>AI 解释</span></button>
      <button type="button" aria-expanded={colorMenuOpen} onClick={() => setColorMenuOpen((value) => !value)}><Highlighter size={15} /><i className={`highlight-swatch highlight-swatch--${defaultColor}`} /><ChevronDown size={12} /></button>
      <button type="button" onClick={onNote}><NotebookPen size={15} /><span>笔记</span></button>
      <button type="button" onClick={onFavorite}><Bookmark size={15} /><span>收藏</span></button>
      <button type="button" onClick={() => void copy()}><Copy size={15} /><span>复制</span></button>
      {colorMenuOpen ? <HighlightColorMenu value={defaultColor} onSelect={runHighlight} /> : null}
    </div>
  );
}
