import { invoke, isTauri } from "@tauri-apps/api/core";
import { CheckCircle2, KeyRound, LoaderCircle, PlugZap, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import type { AppSettings } from "../../types/settings";
import { useToast } from "../ui/ToastProvider";

type ConnectionResult = { ok: true; provider: string; model: string; latencyMs: number };

export function AiProviderSettings() {
  const { settings, patchSettings } = useSettingsStore();
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | "delete" | null>(null);
  const { showToast } = useToast();

  const backendSettings = (value: AppSettings) => ({
    provider: value.aiProvider, baseUrl: value.aiBaseUrl, model: value.aiModel, apiKeyConfigured: value.apiKeyConfigured,
    temperature: value.temperature, maxOutputTokens: value.maxOutputTokens, stream: value.stream, saveRequestContext: value.saveAiRequestContext,
  });
  const sync = async () => {
    if (!isTauri()) return;
    await invoke("update_ai_settings", { settings: backendSettings(useSettingsStore.getState().settings) });
  };
  const saveKey = async () => {
    if (!apiKey.trim()) return;
    setBusy("save");
    try { await sync(); await invoke("set_api_key", { provider: settings.aiProvider, apiKey: apiKey.trim() }); setApiKey(""); patchSettings({ apiKeyConfigured: true }); showToast({ kind: "success", title: "API Key 已安全保存" }); }
    catch (reason) { showToast({ kind: "error", title: "API Key 保存失败", description: reason instanceof Error ? reason.message : String(reason) }); }
    finally { setBusy(null); }
  };
  const test = async () => {
    setBusy("test");
    try { await sync(); const result = await invoke<ConnectionResult>("test_ai_connection"); showToast({ kind: "success", title: "连接成功", description: `${result.model} · ${result.latencyMs} ms` }); }
    catch (reason) { showToast({ kind: "error", title: "连接测试失败", description: reason instanceof Error ? reason.message : String(reason) }); }
    finally { setBusy(null); }
  };
  const removeKey = async () => {
    setBusy("delete");
    try { await invoke("delete_api_key", { provider: settings.aiProvider }); patchSettings({ apiKeyConfigured: false }); showToast({ kind: "success", title: "API Key 已删除" }); }
    catch (reason) { showToast({ kind: "error", title: "删除失败", description: reason instanceof Error ? reason.message : String(reason) }); }
    finally { setBusy(null); }
  };

  return <div className="settings-form-grid">
    <div className="field"><label htmlFor="ai-provider">Provider</label><select id="ai-provider" className="select-input" value={settings.aiProvider} onChange={(event) => patchSettings({ aiProvider: event.currentTarget.value as AppSettings["aiProvider"] })}><option value="openai">OpenAI Responses API</option><option value="openai-compatible">OpenAI 兼容接口</option>{import.meta.env.DEV ? <option value="mock">Mock（仅开发）</option> : null}</select></div>
    <div className="field"><label htmlFor="ai-base-url">Base URL</label><input id="ai-base-url" className="text-input" value={settings.aiBaseUrl} placeholder="https://api.openai.com/v1" onChange={(event) => patchSettings({ aiBaseUrl: event.currentTarget.value })} onBlur={() => void sync()} /></div>
    <div className="field"><label htmlFor="ai-model">模型</label><input id="ai-model" className="text-input" value={settings.aiModel} placeholder="输入支持 Responses API 的模型名称" onChange={(event) => patchSettings({ aiModel: event.currentTarget.value })} onBlur={() => void sync()} /></div>
    <div className="field field--wide"><label htmlFor="api-key">API Key <span className={`key-status ${settings.apiKeyConfigured ? "key-status--ok" : ""}`}>{settings.apiKeyConfigured ? <><CheckCircle2 size={11} />已配置</> : "未配置"}</span></label><div className="input-action"><KeyRound size={15} /><input id="api-key" type="password" value={apiKey} autoComplete="off" placeholder="Key 提交后不会返回前端" onChange={(event) => setApiKey(event.currentTarget.value)} /><button type="button" disabled={!isTauri() || !apiKey.trim() || busy !== null} onClick={() => void saveKey()}>{busy === "save" ? <LoaderCircle className="spin" size={14} /> : "安全保存"}</button></div></div>
    <div className="field"><label htmlFor="ai-temperature">Temperature · {settings.temperature.toFixed(1)}</label><input id="ai-temperature" type="range" min="0" max="2" step="0.1" value={settings.temperature} onChange={(event) => patchSettings({ temperature: Number(event.currentTarget.value) })} onPointerUp={() => void sync()} /></div>
    <div className="field"><label htmlFor="ai-tokens">最大输出 Tokens</label><input id="ai-tokens" className="text-input" type="number" min="128" max="32768" value={settings.maxOutputTokens} onChange={(event) => patchSettings({ maxOutputTokens: Number(event.currentTarget.value) })} onBlur={() => void sync()} /></div>
    <div className="settings-actions field--wide"><button className="secondary-button" type="button" disabled={!isTauri() || busy !== null || !settings.aiModel.trim()} onClick={() => void test()}>{busy === "test" ? <LoaderCircle className="spin" size={15} /> : <PlugZap size={15} />}测试连接</button><button className="danger-text-button" type="button" disabled={!isTauri() || !settings.apiKeyConfigured || busy !== null} onClick={() => void removeKey()}><Trash2 size={14} />删除 API Key</button></div>
  </div>;
}
