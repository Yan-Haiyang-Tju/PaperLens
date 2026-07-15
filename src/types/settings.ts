import { z } from "zod";
import { highlightColorSchema } from "./annotation";

export const themeIdSchema = z.enum(["graphite", "paper-light", "sepia", "midnight", "system"]);
export const accentIdSchema = z.enum(["violet", "indigo", "blue", "teal"]);

export const appSettingsSchema = z.object({
  theme: themeIdSchema,
  accent: accentIdSchema,
  uiScale: z.number().min(0.8).max(1.3),
  pageGap: z.number().int().min(8).max(40),
  pdfDarkFilter: z.boolean(),
  showThumbnails: z.boolean(),
  rightPanelDefaultOpen: z.boolean(),
  defaultZoomMode: z.enum(["actual", "fit-width", "fit-page"]),
  continuousScroll: z.boolean(),
  smoothScroll: z.boolean(),
  restoreReadingPosition: z.boolean(),
  showSelectionToolbar: z.boolean(),
  defaultHighlightColor: highlightColorSchema,
  dictionaryProvider: z.enum(["cache", "imported", "remote"]),
  dictionaryRemoteUrl: z.string(),
  aiProvider: z.enum(["openai", "openai-compatible", "mock"]),
  aiBaseUrl: z.string(),
  aiModel: z.string(),
  apiKeyConfigured: z.boolean(),
  temperature: z.number().min(0).max(2),
  maxOutputTokens: z.number().int().min(128).max(32768),
  stream: z.boolean(),
  outputLanguage: z.string(),
  detailLevel: z.enum(["concise", "balanced", "detailed"]),
  sendAbstract: z.boolean(),
  sendAdjacentSentences: z.boolean(),
  saveAiRequestContext: z.boolean(),
  aiPrivacyAcknowledged: z.boolean(),
  shortcuts: z.record(z.string(), z.string()),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;
export type ThemeId = z.infer<typeof themeIdSchema>;
export type AccentId = z.infer<typeof accentIdSchema>;

export const defaultSettings: AppSettings = {
  theme: "graphite",
  accent: "violet",
  uiScale: 1,
  pageGap: 16,
  pdfDarkFilter: false,
  showThumbnails: true,
  rightPanelDefaultOpen: false,
  defaultZoomMode: "fit-width",
  continuousScroll: true,
  smoothScroll: true,
  restoreReadingPosition: true,
  showSelectionToolbar: true,
  defaultHighlightColor: "yellow",
  dictionaryProvider: "cache",
  dictionaryRemoteUrl: "",
  aiProvider: "openai",
  aiBaseUrl: "https://api.openai.com/v1",
  aiModel: "",
  apiKeyConfigured: false,
  temperature: 0.2,
  maxOutputTokens: 1600,
  stream: true,
  outputLanguage: "zh-CN",
  detailLevel: "concise",
  sendAbstract: true,
  sendAdjacentSentences: true,
  saveAiRequestContext: false,
  aiPrivacyAcknowledged: false,
  shortcuts: {
    open: "Mod+O",
    search: "Mod+F",
    dictionary: "Alt+D",
    ai: "Alt+A",
    highlight: "Alt+H",
    note: "Alt+N",
    favorite: "Alt+S",
    toggleSidebar: "Mod+Shift+B",
  },
};
