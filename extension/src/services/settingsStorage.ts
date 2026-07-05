import { DEFAULT_SETTINGS, getDefaultSummaryPrompt, isDefaultSummaryPrompt, type ExtensionSettings, type Locale } from "../types/settings";
import { getLocalStorage, setLocalStorage } from "./chromeStorage";

const SETTINGS_KEY = "meetingTranscriber.settings";

export async function getSettings(): Promise<ExtensionSettings> {
  const result = await getLocalStorage(SETTINGS_KEY);
  const savedSettings = result[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined;

  const locale = savedSettings?.locale ?? DEFAULT_SETTINGS.locale;
  const summaryPrompt = normalizeSummaryPrompt(savedSettings?.summaryPrompt, locale);
  const openWebuiKnowledgeBaseName = normalizeKnowledgeBaseName(savedSettings?.openWebuiKnowledgeBaseName);

  return {
    ...DEFAULT_SETTINGS,
    ...savedSettings,
    summaryPrompt,
    openWebuiKnowledgeBaseName
  };
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await setLocalStorage({ [SETTINGS_KEY]: settings });
}

function normalizeSummaryPrompt(prompt: string | undefined, locale: Locale): string {
  if (isDefaultSummaryPrompt(prompt)) {
    return getDefaultSummaryPrompt(locale);
  }

  return prompt!;
}

function normalizeKnowledgeBaseName(value: string | undefined): string {
  return value?.trim() || DEFAULT_SETTINGS.openWebuiKnowledgeBaseName;
}
