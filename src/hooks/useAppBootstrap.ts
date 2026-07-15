import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { verifyForeignKeys } from "../services/database/client";
import { listRecentPapers } from "../services/database/paperRepository";
import { loadSettings, saveSettings } from "../services/database/settingsRepository";
import { useSettingsStore } from "../stores/settingsStore";
import { useUiStore } from "../stores/uiStore";
import type { AppSettings } from "../types/settings";

type BackendAiSettings = {
  provider: AppSettings["aiProvider"];
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  temperature: number;
  maxOutputTokens: number;
  stream: boolean;
  saveRequestContext: boolean;
};

function toBackendAiSettings(settings: AppSettings): BackendAiSettings {
  return { provider: settings.aiProvider, baseUrl: settings.aiBaseUrl, model: settings.aiModel, apiKeyConfigured: settings.apiKeyConfigured, temperature: settings.temperature, maxOutputTokens: settings.maxOutputTokens, stream: settings.stream, saveRequestContext: settings.saveAiRequestContext };
}

export function useAppBootstrap(onError: (message: string) => void): void {
  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    let saveTimer: number | undefined;
    const bootstrap = async () => {
      try {
        const [storedSettings, papers, foreignKeysEnabled, backendAi] = await Promise.all([
          loadSettings(),
          listRecentPapers(),
          verifyForeignKeys(),
          isTauri() ? invoke<BackendAiSettings>("get_ai_settings").catch(() => null) : Promise.resolve(null),
        ]);
        if (disposed) return;
        const settings = backendAi ? { ...storedSettings, aiProvider: backendAi.provider, aiBaseUrl: backendAi.baseUrl, aiModel: backendAi.model, apiKeyConfigured: backendAi.apiKeyConfigured, temperature: backendAi.temperature, maxOutputTokens: backendAi.maxOutputTokens, stream: backendAi.stream, saveAiRequestContext: backendAi.saveRequestContext } : storedSettings;
        useSettingsStore.getState().setSettings(settings);
        useSettingsStore.getState().setHydrated(true);
        useUiStore.getState().setLibraryPapers(papers);
        if (!foreignKeysEnabled) onError("数据库外键保护未启用，请重启 PaperLens。");
        unsubscribe = useSettingsStore.subscribe((state, previous) => {
          if (!state.hydrated || state.settings === previous.settings) return;
          window.clearTimeout(saveTimer);
          state.setSaving(true);
          saveTimer = window.setTimeout(() => {
            const current = useSettingsStore.getState().settings;
            const persistence = [saveSettings(current)];
            if (isTauri() && current.aiModel.trim()) persistence.push(invoke("update_ai_settings", { settings: toBackendAiSettings(current) }));
            void Promise.all(persistence)
              .catch((reason: unknown) => onError(reason instanceof Error ? reason.message : "设置保存失败"))
              .finally(() => useSettingsStore.getState().setSaving(false));
          }, 350);
        });
      } catch (reason) {
        if (!disposed) { useSettingsStore.getState().setHydrated(true); onError(reason instanceof Error ? reason.message : "本地数据库初始化失败"); }
      }
    };
    void bootstrap();
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const reapplySystemTheme = () => {
      const current = useSettingsStore.getState().settings;
      if (current.theme === "system") useSettingsStore.getState().setSettings(current);
    };
    media?.addEventListener("change", reapplySystemTheme);
    return () => { disposed = true; window.clearTimeout(saveTimer); unsubscribe?.(); media?.removeEventListener("change", reapplySystemTheme); };
  }, [onError]);
}
