import { Bold, Code2, FunctionSquare, Italic, List, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { saveSelection } from "../../services/database/annotationRepository";
import { saveNote } from "../../services/database/noteRepository";
import type { Note } from "../../types/annotation";
import type { SelectionContext } from "../../types/selection";

type SaveState = "idle" | "saving" | "saved" | "error";

export function NoteEditor({ selection, onSaved }: { selection: SelectionContext; onSaved: (note: Note) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const identityRef = useRef({ id: crypto.randomUUID(), createdAt: new Date().toISOString() });
  const [content, setContent] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => {
    if (!content.trim()) return;
    const timer = window.setTimeout(() => {
      const now = new Date().toISOString();
      const note: Note = {
        id: identityRef.current.id, paperId: selection.paperId, pageNumber: selection.pageNumber, selectionId: selection.id,
        highlightId: null, selectedText: selection.selectedText, contentMarkdown: content.trim(),
        tags: tagsText.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean), createdAt: identityRef.current.createdAt, updatedAt: now,
      };
      void saveSelection(selection).then(() => saveNote(note, selection.sentence)).then(() => { setSaveState("saved"); onSaved(note); }).catch(() => setSaveState("error"));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [content, onSaved, selection, tagsText]);

  const wrap = (before: string, after = before) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = `${content.slice(0, start)}${before}${content.slice(start, end)}${after}${content.slice(end)}`;
    setContent(next); setSaveState("saving");
    window.setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + before.length, end + before.length); }, 0);
  };

  return (
    <div className="note-editor">
      <blockquote title={selection.selectedText}>{selection.selectedText}</blockquote>
      <div className="note-editor__toolbar" role="toolbar" aria-label="Markdown 格式">
        <button type="button" aria-label="粗体" onClick={() => wrap("**")}><Bold size={14} /></button>
        <button type="button" aria-label="斜体" onClick={() => wrap("*")}><Italic size={14} /></button>
        <button type="button" aria-label="列表" onClick={() => wrap("- ", "")}><List size={14} /></button>
        <button type="button" aria-label="行内代码" onClick={() => wrap("`")}><Code2 size={14} /></button>
        <button type="button" aria-label="公式" onClick={() => wrap("$", "$")}><FunctionSquare size={14} /></button>
        <span className={`save-state save-state--${saveState}`}><Save size={12} />{saveState === "saving" ? "保存中" : saveState === "error" ? "保存失败" : saveState === "saved" ? "已保存" : "自动保存"}</span>
      </div>
      <textarea ref={textareaRef} className="textarea-input note-editor__textarea" value={content} autoFocus placeholder="写下理解、疑问或公式…" onChange={(event) => { setContent(event.currentTarget.value); setSaveState(event.currentTarget.value.trim() ? "saving" : "idle"); }} />
      <input className="text-input" value={tagsText} placeholder="标签，用逗号分隔" aria-label="笔记标签" onChange={(event) => { setTagsText(event.currentTarget.value); if (content.trim()) setSaveState("saving"); }} />
    </div>
  );
}
