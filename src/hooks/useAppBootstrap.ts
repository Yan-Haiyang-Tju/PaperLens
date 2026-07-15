import { useEffect } from "react";
import { verifyForeignKeys } from "../services/database/client";
import { listRecentPapers } from "../services/database/paperRepository";
import { loadSettings, saveSettings } from "../services/database/settingsRepository";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";

export function useAppBootstrap(onError: (message: string) => void): void {
  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    let saveTimer: number | undefined;
    const bootstrap = async () => {
      try {
        const [settings, papers, foreignKeysEnabled] = await Promise.all([loadSettings(), listRecentPapers(), verifyForeignKeys()]);
        if (disposed) return;
        useSettingsStore.getState().setSettings(settings);
        useSettingsStore.getState().setHydrated(true);
        useUiStore.getState().setLibraryPapers(papers);
        if (!foreignKeysEnabled) onError("数据库外键保护未启用，请重启 PaperLens。");
        unsubscribe = useSettingsStore.subscribe((state, previous) => {
          if (!state.hydrated || state.settings === previous.settings) return;
          window.clearTimeout(saveTimer);
          state.setSaving(true);
          saveTimer = window.setTimeout(() => {
            void saveSettings(useSettingsStore.getState().settings)
              .catch((reason: unknown) => onError(reason instanceof Error ? reason.message : "设置保存失败"))
              .finally(() => useSettingsStore.getState().setSaving(false));
          }, 350);
        });
      } catch (reason) {
        if (!disposed) { useSettingsStore.getState().setHydrated(true); onError(reason instanceof Error ? reason.message : "本地数据库初始化失败"); }
      }
    };
    void bootstrap();
    return () => { disposed = true; window.clearTimeout(saveTimer); unsubscribe?.(); };
  }, [onError]);
}
