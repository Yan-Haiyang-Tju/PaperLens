import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { Archive, BookOpen, BrainCircuit, Database, Eraser, FolderOpen, Keyboard, Palette, Save, Settings2, Upload, Volume2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { clearDictionaryMemoryCache } from "../../services/dictionary/dictionaryService";
import { clearDictionaryCache } from "../../services/database/dictionaryRepository";
import { useSettingsStore } from "../../stores/settingsStore";
import type { AccentId, AppSettings } from "../../types/settings";
import { AiProviderSettings } from "./AiProviderSettings";
import { ThemePicker } from "./ThemePicker";
import { useToast } from "../ui/ToastProvider";

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description?: string }) {
  return <label className="toggle-row"><span><strong>{label}</strong>{description ? <small>{description}</small> : null}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} /><i aria-hidden /></label>;
}

function Section({ icon, title, description, children }: { icon: ReactNode; title: string; description: string; children: ReactNode }) {
  return <section className="settings-section"><div className="settings-section__heading">{icon}<div><h2>{title}</h2><p>{description}</p></div></div>{children}</section>;
}

const shortcutLabels: Record<string, string> = { open: "打开论文", search: "论文内搜索", dictionary: "即时释义", ai: "AI 解释", highlight: "高亮", note: "笔记", favorite: "收藏", toggleSidebar: "显示/隐藏侧栏" };

export function SettingsPage() {
  const { settings, patchSettings } = useSettingsStore();
  const [dataDirectory, setDataDirectory] = useState("桌面应用启动后可查看");
  const { showToast } = useToast();
  useEffect(() => { if (isTauri()) void invoke<{ path: string }>("get_data_directory").then((result) => setDataDirectory(result.path)); }, []);
  const conflicts = useMemo(() => Object.entries(settings.shortcuts).filter(([, value], index, all) => value && all.findIndex(([, candidate]) => candidate.toLocaleLowerCase() === value.toLocaleLowerCase()) !== index).map(([key]) => key), [settings.shortcuts]);

  const importDictionary = async () => {
    if (!isTauri()) { showToast({ kind: "info", title: "请在桌面版导入词典" }); return; }
    const path = await open({ multiple: false, filters: [{ name: "词典 JSON", extensions: ["json"] }] });
    if (typeof path !== "string") return;
    try { const count = await invoke<number>("import_local_dictionary", { path, sourceName: path.split(/[\\/]/).pop() ?? "user-dictionary" }); clearDictionaryMemoryCache(); showToast({ kind: "success", title: `已导入 ${count} 个词条` }); }
    catch (reason) { showToast({ kind: "error", title: "词典导入失败", description: reason instanceof Error ? reason.message : String(reason) }); }
  };
  const clearDict = async () => { try { await clearDictionaryCache(); if (isTauri()) await invoke("clear_dictionary_cache"); clearDictionaryMemoryCache(); showToast({ kind: "success", title: "词典缓存已清除" }); } catch (reason) { showToast({ kind: "error", title: "清除失败", description: String(reason) }); } };
  const dataAction = async (action: "export" | "import" | "backup" | "clear") => {
    if (!isTauri()) { showToast({ kind: "info", title: "该操作仅在桌面版可用" }); return; }
    try {
      if (action === "export") { const destination = await saveDialog({ defaultPath: "paperlens-export.paperlens", filters: [{ name: "PaperLens 数据", extensions: ["paperlens"] }] }); if (destination) await invoke("export_data", { destination }); }
      if (action === "import") { const source = await open({ multiple: false, filters: [{ name: "PaperLens 数据", extensions: ["paperlens", "db"] }] }); if (typeof source === "string") await invoke("import_data", { source }); }
      if (action === "backup") { const destination = await saveDialog({ defaultPath: "paperlens-backup.db", filters: [{ name: "SQLite 数据库", extensions: ["db"] }] }); if (destination) await invoke("backup_database", { destination }); }
      if (action === "clear") { const count = await invoke<number>("clear_extracted_text_cache"); showToast({ kind: "success", title: `已清除 ${count} 页文本缓存` }); return; }
      showToast({ kind: "success", title: action === "import" ? "数据已导入，请重启应用" : action === "backup" ? "数据库备份完成" : "数据导出完成" });
    } catch (reason) { showToast({ kind: "error", title: "数据操作失败", description: reason instanceof Error ? reason.message : String(reason) }); }
  };

  return <section className="settings-page">
    <header className="settings-header"><div className="settings-header__icon"><Settings2 size={20} /></div><div><h1>设置</h1><p>阅读、外观、AI、数据与快捷键。</p></div></header>
    <Section icon={<Palette size={17} />} title="外观" description="主题切换即时生效，并持久化在本地数据库。">
      <ThemePicker value={settings.theme} onChange={(theme) => patchSettings({ theme })} />
      <div className="settings-inline-grid"><div className="field"><label>强调色</label><div className="accent-options">{(["violet", "indigo", "blue", "teal"] as AccentId[]).map((accent) => <button key={accent} className={`accent-dot accent-dot--${accent}`} aria-label={accent} aria-pressed={settings.accent === accent} type="button" onClick={() => patchSettings({ accent })} />)}</div></div><div className="field"><label>UI 缩放 · {Math.round(settings.uiScale * 100)}%</label><input type="range" min="0.8" max="1.3" step="0.05" value={settings.uiScale} onChange={(event) => patchSettings({ uiScale: Number(event.currentTarget.value) })} /></div><div className="field"><label>页面间距 · {settings.pageGap}px</label><input type="range" min="8" max="40" step="4" value={settings.pageGap} onChange={(event) => patchSettings({ pageGap: Number(event.currentTarget.value) })} /></div></div>
      <div className="toggle-grid"><Toggle checked={settings.pdfDarkFilter} onChange={(pdfDarkFilter) => patchSettings({ pdfDarkFilter })} label="Midnight PDF 深色滤镜" /><Toggle checked={settings.showThumbnails} onChange={(showThumbnails) => patchSettings({ showThumbnails })} label="默认显示缩略图" /><Toggle checked={settings.rightPanelDefaultOpen} onChange={(rightPanelDefaultOpen) => patchSettings({ rightPanelDefaultOpen })} label="默认打开右侧面板" /></div>
    </Section>
    <Section icon={<BookOpen size={17} />} title="阅读" description="控制 PDF 导航、恢复位置与划词行为。">
      <div className="settings-form-grid"><div className="field"><label>默认缩放</label><select className="select-input" value={settings.defaultZoomMode} onChange={(event) => patchSettings({ defaultZoomMode: event.currentTarget.value as AppSettings["defaultZoomMode"] })}><option value="actual">100%</option><option value="fit-width">适合宽度</option><option value="fit-page">适合页面</option></select></div><div className="field"><label>默认高亮颜色</label><select className="select-input" value={settings.defaultHighlightColor} onChange={(event) => patchSettings({ defaultHighlightColor: event.currentTarget.value as AppSettings["defaultHighlightColor"] })}><option value="yellow">黄色</option><option value="green">绿色</option><option value="blue">蓝色</option><option value="pink">粉色</option><option value="purple">紫色</option></select></div></div>
      <div className="toggle-grid"><Toggle checked={settings.continuousScroll} onChange={(continuousScroll) => patchSettings({ continuousScroll })} label="连续滚动" /><Toggle checked={settings.smoothScroll} onChange={(smoothScroll) => patchSettings({ smoothScroll })} label="平滑滚动" /><Toggle checked={settings.restoreReadingPosition} onChange={(restoreReadingPosition) => patchSettings({ restoreReadingPosition })} label="自动恢复阅读位置" /><Toggle checked={settings.showSelectionToolbar} onChange={(showSelectionToolbar) => patchSettings({ showSelectionToolbar })} label="选择文字后显示操作栏" /></div>
    </Section>
    <Section icon={<Volume2 size={17} />} title="即时释义" description="内置 ECDICT 离线英汉词典，开箱即用；也可导入自定义词典覆盖内置释义。"><div className="settings-actions"><button className="secondary-button" type="button" onClick={() => void importDictionary()}><Upload size={15} />导入自定义词典</button><button className="secondary-button" type="button" onClick={() => void clearDict()}><Eraser size={15} />清除词典缓存</button></div><div className="field settings-remote-url"><label>可选远程词典 URL 模板（可含 {'{term}'}）</label><input className="text-input" value={settings.dictionaryRemoteUrl} placeholder="https://example.com/dictionary?term={term}" onChange={(event) => patchSettings({ dictionaryRemoteUrl: event.currentTarget.value })} /></div></Section>
    <Section icon={<BrainCircuit size={17} />} title="AI 解释" description="模型请求只从 Rust 后端发出，完整 API Key 不会返回 Renderer。"><AiProviderSettings /><div className="toggle-grid"><Toggle checked={settings.stream} onChange={(stream) => patchSettings({ stream })} label="流式输出" /><Toggle checked={settings.sendAbstract} onChange={(sendAbstract) => patchSettings({ sendAbstract })} label="发送论文摘要" /><Toggle checked={settings.sendAdjacentSentences} onChange={(sendAdjacentSentences) => patchSettings({ sendAdjacentSentences })} label="发送前后句" /><Toggle checked={settings.saveAiRequestContext} onChange={(saveAiRequestContext) => patchSettings({ saveAiRequestContext })} label="保存完整请求上下文" description="默认关闭；开启会增加本地隐私数据。" /></div></Section>
    <Section icon={<Database size={17} />} title="数据" description="论文内容不复制进数据库；这里管理标注与索引数据。"><div className="data-directory"><FolderOpen size={15} /><code>{dataDirectory}</code><button type="button" disabled={!isTauri()} onClick={() => void invoke("reveal_data_directory")}>打开目录</button></div><div className="settings-actions"><button className="secondary-button" type="button" onClick={() => void dataAction("export")}><Archive size={15} />导出数据</button><button className="secondary-button" type="button" onClick={() => void dataAction("import")}><Upload size={15} />导入数据</button><button className="secondary-button" type="button" onClick={() => void dataAction("backup")}><Save size={15} />备份数据库</button><button className="secondary-button" type="button" onClick={() => void dataAction("clear")}><Eraser size={15} />清除文本缓存</button></div></Section>
    <Section icon={<Keyboard size={17} />} title="快捷键" description="在输入框中不会误触；重复快捷键会标红。"><div className="shortcut-list">{Object.entries(settings.shortcuts).map(([key, value]) => <label key={key} className={conflicts.includes(key) ? "shortcut-conflict" : ""}><span>{shortcutLabels[key] ?? key}</span><input value={value} aria-label={`${shortcutLabels[key] ?? key}快捷键`} onChange={(event) => patchSettings({ shortcuts: { ...settings.shortcuts, [key]: event.currentTarget.value } })} />{conflicts.includes(key) ? <small>冲突</small> : null}</label>)}</div></Section>
  </section>;
}
