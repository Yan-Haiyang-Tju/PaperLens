import { NotebookPen, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { deleteNote, listNotes } from "../../services/database/noteRepository";
import { useSelectionStore } from "../../stores/selectionStore";
import type { Note } from "../../types/annotation";
import { NoteEditor } from "./NoteEditor";

export function NotesPanel({ paperId, onNavigate }: { paperId: string; onNavigate: (page: number) => void }) {
  const selection = useSelectionStore((state) => state.selection?.paperId === paperId ? state.selection : null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState("");
  const reload = useCallback(() => { void listNotes(paperId, query).then(setNotes); }, [paperId, query]);
  useEffect(reload, [reload]);
  const onSaved = useCallback((note: Note) => setNotes((items) => [note, ...items.filter((item) => item.id !== note.id)]), []);
  return (
    <div className="notes-panel">
      {selection ? <NoteEditor key={selection.id} selection={selection} onSaved={onSaved} /> : <div className="panel-hint"><NotebookPen size={18} /><span>选中论文文字并点击“笔记”以创建上下文笔记。</span></div>}
      <label className="panel-search"><Search size={14} /><input value={query} placeholder="搜索本篇笔记" onChange={(event) => setQuery(event.currentTarget.value)} /></label>
      <div className="note-list">
        {notes.map((note) => (
          <article className="note-item" key={note.id}>
            {note.selectedText ? <button className="note-item__quote" type="button" onClick={() => onNavigate(note.pageNumber)}>{note.selectedText}</button> : null}
            <p>{note.contentMarkdown}</p>
            <footer><button type="button" onClick={() => onNavigate(note.pageNumber)}>第 {note.pageNumber} 页</button><time>{new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(note.updatedAt))}</time><button type="button" aria-label="删除笔记" onClick={() => { void deleteNote(note.id).then(() => setNotes((items) => items.filter((item) => item.id !== note.id))); }}><Trash2 size={13} /></button></footer>
          </article>
        ))}
        {!notes.length ? <div className="sidebar-empty"><NotebookPen size={22} /><span>本篇还没有笔记</span></div> : null}
      </div>
    </div>
  );
}
