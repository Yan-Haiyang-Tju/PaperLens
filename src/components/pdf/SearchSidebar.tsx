import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { getPageText } from "../../services/pdf/pageTextCache";

type SearchResult = { page: number; index: number; before: string; match: string; after: string };

export function SearchSidebar({ document, onNavigate }: { document: PDFDocumentProxy; onNavigate: (page: number) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => () => { requestRef.current += 1; }, []);

  const runSearch = async () => {
    const term = query.trim();
    const requestId = ++requestRef.current;
    if (!term) { setResults([]); return; }
    setSearching(true);
    setResults([]);
    const found: SearchResult[] = [];
    for (let page = 1; page <= document.numPages; page += 1) {
      if (requestRef.current !== requestId) return;
      const { plainText } = await getPageText(document, page);
      const lower = plainText.toLocaleLowerCase();
      const needle = term.toLocaleLowerCase();
      let index = lower.indexOf(needle);
      while (index >= 0 && found.length < 500) {
        found.push({
          page,
          index,
          before: plainText.slice(Math.max(0, index - 54), index),
          match: plainText.slice(index, index + term.length),
          after: plainText.slice(index + term.length, index + term.length + 72),
        });
        index = lower.indexOf(needle, index + Math.max(1, needle.length));
      }
      setProgress(page / document.numPages);
      if (page % 8 === 0) setResults([...found]);
    }
    if (requestRef.current === requestId) { setResults(found); setSearching(false); }
  };

  return (
    <div className="search-sidebar">
      <form className="search-box" onSubmit={(event) => { event.preventDefault(); void runSearch(); }}>
        <Search size={15} />
        <input value={query} autoFocus aria-label="搜索 PDF" placeholder="在论文中搜索" onChange={(event) => setQuery(event.currentTarget.value)} />
        {query ? <button type="button" aria-label="清除搜索" onClick={() => { setQuery(""); setResults([]); requestRef.current += 1; setSearching(false); }}><X size={14} /></button> : null}
      </form>
      {searching ? <div className="search-progress"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div> : null}
      <div className="search-summary">{searching ? `正在搜索第 ${Math.max(1, Math.ceil(progress * document.numPages))} 页…` : query ? `${results.length} 个结果` : "输入关键词并按 Enter"}</div>
      <div className="search-results">
        {results.map((result) => (
          <button type="button" key={`${result.page}-${result.index}`} onClick={() => onNavigate(result.page)}>
            <span>第 {result.page} 页</span>
            <p>{result.before}<mark>{result.match}</mark>{result.after}</p>
          </button>
        ))}
        {!searching && query && !results.length ? <div className="sidebar-empty"><Search size={22} /><span>没有找到“{query}”</span></div> : null}
      </div>
    </div>
  );
}
