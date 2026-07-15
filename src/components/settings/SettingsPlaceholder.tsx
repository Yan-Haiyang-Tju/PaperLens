import { Palette, Settings2 } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import type { ThemeId } from "../../types/settings";

const themes: Array<{ id: ThemeId; name: string }> = [
  { id: "graphite", name: "Graphite" },
  { id: "paper-light", name: "Paper Light" },
  { id: "sepia", name: "Sepia" },
  { id: "midnight", name: "Midnight" },
  { id: "system", name: "跟随系统" },
];

export function SettingsPlaceholder() {
  const { settings, patchSettings } = useSettingsStore();
  return (
    <section className="settings-page">
      <header className="settings-header"><div className="settings-header__icon"><Settings2 size={20} /></div><div><h1>设置</h1><p>PaperLens 的阅读、外观、AI 和数据选项。</p></div></header>
      <div className="settings-section">
        <div className="settings-section__heading"><Palette size={17} /><div><h2>外观</h2><p>切换后立即应用；完整设置会保存到本地数据库。</p></div></div>
        <div className="theme-grid">
          {themes.map((theme) => (
            <button className={`theme-preview ${settings.theme === theme.id ? "theme-preview--active" : ""}`} key={theme.id} type="button" onClick={() => patchSettings({ theme: theme.id })}>
              <span className={`theme-preview__canvas theme-preview__canvas--${theme.id}`}><i /><b /><em /></span>
              <span>{theme.name}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
