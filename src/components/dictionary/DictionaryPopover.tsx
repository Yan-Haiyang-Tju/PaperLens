import { Bookmark, BookOpen, LoaderCircle, Sparkles, Volume2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { lookupDictionary } from "../../services/dictionary/dictionaryService";
import { useSettingsStore } from "../../stores/settingsStore";
import type { DictionaryResult } from "../../types/dictionary";
import type { SelectionContext, ToolbarAnchor } from "../../types/selection";
import { calculateToolbarPosition } from "../../utils/selectionGeometry";

export function DictionaryPopover({ selection, anchor, onClose, onAi, onFavorite }: { selection: SelectionContext; anchor: ToolbarAnchor; onClose: () => void; onAi: () => void; onFavorite: () => void }) {
  const remoteUrl = useSettingsStore((state) => state.settings.dictionaryRemoteUrl);
  const [state, setState] = useState<{ result: DictionaryResult | null; loading: boolean; error: string | null }>({ result: null, loading: true, error: null });
  const rootRef = useRef<HTMLDivElement>(null);
  const position = useMemo(() => calculateToolbarPosition(anchor, { width: 330, height: 270 }, { width: window.innerWidth, height: window.innerHeight }), [anchor]);

  useEffect(() => {
    let cancelled = false;
    void lookupDictionary(selection.normalizedText, remoteUrl).then((result) => { if (!cancelled) setState({ result, loading: false, error: null }); }).catch((reason: unknown) => { if (!cancelled) setState({ result: null, loading: false, error: reason instanceof Error ? reason.message : "词典查询失败" }); });
    return () => { cancelled = true; };
  }, [remoteUrl, selection.normalizedText]);

  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!(event.target instanceof Node && rootRef.current?.contains(event.target))) onClose(); };
    const keyboard = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", outside); window.addEventListener("keydown", keyboard);
    return () => { window.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", keyboard); };
  }, [onClose]);

  return (
    <div ref={rootRef} className="dictionary-popover" role="dialog" aria-label={`${selection.selectedText} 即时释义`} style={{ left: position.left, top: position.top }}>
      <header><div className="dictionary-popover__icon"><BookOpen size={16} /></div><div><strong>{selection.selectedText}</strong>{state.result?.phonetic ? <span>{state.result.phonetic}</span> : null}</div><button className="icon-button" type="button" aria-label="关闭释义" onClick={onClose}><X size={15} /></button></header>
      <div className="dictionary-popover__body">
        {state.loading ? <div className="dictionary-loading"><LoaderCircle className="spin" size={18} />正在查询本地缓存与词典…</div> : null}
        {state.error ? <div className="dictionary-empty">{state.error}</div> : null}
        {!state.loading && !state.error && state.result ? <>
          <div className="dictionary-meta">{state.result.partOfSpeech ? <span>{state.result.partOfSpeech}</span> : null}{state.result.lemma ? <span>原形 {state.result.lemma}</span> : null}</div>
          <ol>{state.result.meaningsZh.map((meaning) => <li key={meaning}>{meaning}</li>)}</ol>
          <small>来源：{state.result.provider}</small>
        </> : null}
        {!state.loading && !state.error && !state.result ? <div className="dictionary-empty">未找到基础释义。你仍可以请求 AI 结合论文语境解释。</div> : null}
      </div>
      <footer>
        {state.result?.phonetic ? <button type="button" aria-label="发音" disabled><Volume2 size={14} /></button> : null}
        <button type="button" onClick={onFavorite}><Bookmark size={14} />加入收藏</button>
        <button className="dictionary-ai-button" type="button" onClick={onAi}><Sparkles size={14} />转为 AI 解释</button>
      </footer>
    </div>
  );
}
