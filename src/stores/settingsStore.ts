import { create } from "zustand";
import { appSettingsSchema, defaultSettings, type AppSettings, type ThemeId } from "../types/settings";

function resolveTheme(theme: ThemeId): Exclude<ThemeId, "system"> {
  if (theme !== "system") return theme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "midnight" : "paper-light";
}

export function applySettingsToDocument(settings: AppSettings): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(settings.theme);
  root.dataset.accent = settings.accent;
  root.dataset.pdfFilter = String(settings.pdfDarkFilter);
  root.style.setProperty("--ui-scale", String(settings.uiScale));
  root.style.setProperty("--pdf-page-gap", `${settings.pageGap}px`);
}

type SettingsState = {
  settings: AppSettings;
  hydrated: boolean;
  saving: boolean;
  setSettings: (settings: AppSettings) => void;
  patchSettings: (patch: Partial<AppSettings>) => void;
  setHydrated: (hydrated: boolean) => void;
  setSaving: (saving: boolean) => void;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: defaultSettings,
  hydrated: false,
  saving: false,
  setSettings: (value) => {
    const settings = appSettingsSchema.parse(value);
    applySettingsToDocument(settings);
    set({ settings });
  },
  patchSettings: (patch) => set((state) => {
    const settings = appSettingsSchema.parse({ ...state.settings, ...patch });
    applySettingsToDocument(settings);
    return { settings };
  }),
  setHydrated: (hydrated) => set({ hydrated }),
  setSaving: (saving) => set({ saving }),
}));

applySettingsToDocument(defaultSettings);
