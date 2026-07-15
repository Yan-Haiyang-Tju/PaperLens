import { BookMarked, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listVocabulary, updateTermFamiliarity } from "../../services/database/vocabularyRepository";
import type { VocabularyEntry } from "../../types/vocabulary";

const familiarityLabels: Record<VocabularyEntry["familiarity"], string> = { new: "新词", learning: "学习中", familiar: "熟悉", mastered: "已掌握" };

export function VocabularyPanel({ paperId, onNavigate }: { paperId?: string; onNavigate?: (paperId: string, page: number) => void }) {
  const [entries, setEntries] = useState<VocabularyEntry[]>([]);
  const [query, setQuery] = useState("");
  const reload = useCallback(() => { void listVocabulary(paperId).then(setEntries); }, [paperId]);
  useEffect(reload, [reload]);
  const filtered = useMemo(() => entries.filter((entry) => `${entry.displayText} ${entry.normalizedText}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [entries, query]);
  return (
    <div className={`vocabulary-panel ${paperId ? "" : "vocabulary-panel--page"}`}>
      {!paperId ? <header className="vocabulary-page-header"><div><p className="eyebrow">CONTEXTUAL VOCABULARY</p><h1>收藏词汇</h1><p>同一个术语在不同论文中的出现会分别保存。</p></div><span>{entries.length} 个术语</span></header> : null}
      <label className="panel-search"><Search size={14} /><input value={query} placeholder="搜索术语" onChange={(event) => setQuery(event.currentTarget.value)} /></label>
      <div className="vocabulary-list">
        {filtered.map((entry) => (
          <article className="term-item" key={entry.id}>
            <header><div><strong>{entry.displayText}</strong>{entry.displayText.toLocaleLowerCase() !== entry.normalizedText ? <span>{entry.normalizedText}</span> : null}</div><select value={entry.familiarity} aria-label={`${entry.displayText} 熟悉度`} onChange={(event) => { const familiarity = event.currentTarget.value as VocabularyEntry["familiarity"]; setEntries((items) => items.map((item) => item.id === entry.id ? { ...item, familiarity } : item)); void updateTermFamiliarity(entry.id, familiarity); }}>{Object.entries(familiarityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></header>
            <div className="occurrence-list">{entry.occurrences.map((occurrence) => <button type="button" key={occurrence.id} onClick={() => onNavigate?.(occurrence.paperId, occurrence.pageNumber)}><span>第 {occurrence.pageNumber} 页</span><q>{occurrence.sentence ?? occurrence.selectedText}</q></button>)}</div>
          </article>
        ))}
        {!filtered.length ? <div className="sidebar-empty"><BookMarked size={24} /><span>{query ? "没有匹配的收藏词汇" : "还没有收藏词汇"}</span></div> : null}
      </div>
    </div>
  );
}
