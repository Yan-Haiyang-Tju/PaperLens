import type { ThemeId } from "../../types/settings";

const themes: Array<{ id: ThemeId; name: string; description: string }> = [
  { id: "graphite", name: "Graphite", description: "深色框架与中性工作区" },
  { id: "paper-light", name: "Paper Light", description: "明亮、干净" },
  { id: "sepia", name: "Sepia", description: "适合长时间阅读" },
  { id: "midnight", name: "Midnight", description: "低亮度深色界面" },
  { id: "system", name: "跟随系统", description: "自动匹配系统外观" },
];

export function ThemePicker({ value, onChange }: { value: ThemeId; onChange: (theme: ThemeId) => void }) {
  return <div className="theme-grid">{themes.map((theme) => (
    <button className={`theme-preview ${value === theme.id ? "theme-preview--active" : ""}`} key={theme.id} type="button" onClick={() => onChange(theme.id)} aria-pressed={value === theme.id}>
      <span className={`theme-preview__canvas theme-preview__canvas--${theme.id}`}><i /><b /><em /></span>
      <strong>{theme.name}</strong><small>{theme.description}</small>
    </button>
  ))}</div>;
}
