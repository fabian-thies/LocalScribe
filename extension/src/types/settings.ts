export type Locale = "en" | "de";
export type SummaryNoteType = "auto" | "meeting" | "discussion";
export type SummaryLength = "short" | "balanced" | "detailed";
export type SummaryLanguage = "auto" | "de" | "en";
export type SummaryStrictness = "strict" | "cautious";

export interface ExtensionSettings {
  openWebuiBaseUrl: string;
  apiToken: string;
  model: string;
  openWebuiKnowledgeSyncEnabled: boolean;
  openWebuiKnowledgeBaseName: string;
  summaryPrompt: string;
  summaryNoteType: SummaryNoteType;
  summaryLength: SummaryLength;
  summaryLanguage: SummaryLanguage;
  summaryStrictness: SummaryStrictness;
  sttEndpointPath: string;
  chatEndpointPath: string;
  locale: Locale;
  liveTranscriptionEnabled: boolean;
}

export const DEFAULT_SUMMARY_PROMPTS: Record<Locale, string> = {
  en: [
    "Use only information from the transcript.",
    "Summarize factually what was discussed, which positions were represented, and where uncertainties or conflicts are visible.",
    "Correct obvious transcription errors only when the intended term is clear from context.",
    "Keep names, domain terms, political terms, and technical terms as precise as possible.",
    "Do not add evaluations, conclusions, or information from outside the transcript."
  ].join("\n"),
  de: [
    "Nutze ausschließlich Informationen aus dem Transkript.",
    "Fasse sachlich zusammen, worum es ging, welche Positionen vertreten wurden und wo Unsicherheiten oder Konfliktpunkte erkennbar sind.",
    "Korrigiere offensichtliche Transkriptionsfehler nur, wenn der gemeinte Begriff aus dem Kontext eindeutig ist.",
    "Behalte Namen, Fachbegriffe, politische Begriffe und technische Begriffe möglichst genau bei.",
    "Füge keine Bewertung, kein Fazit und keine Informationen außerhalb des Transkripts hinzu."
  ].join("\n")
};

const LEGACY_SUMMARY_PROMPT_MARKERS = [
  "nutze exakt dieses markdown-format",
  "## kurzfassung",
  "## aufgaben",
  "wenn das transkript eher eine diskussion",
  "die kurzfassung soll"
];

export function getDefaultSummaryPrompt(locale: Locale): string {
  return DEFAULT_SUMMARY_PROMPTS[locale];
}

export function isDefaultSummaryPrompt(prompt: string | undefined): boolean {
  if (!prompt?.trim()) {
    return true;
  }

  const normalized = normalizePrompt(prompt);
  return Object.values(DEFAULT_SUMMARY_PROMPTS).some((defaultPrompt) => normalizePrompt(defaultPrompt) === normalized)
    || LEGACY_SUMMARY_PROMPT_MARKERS.some((marker) => normalized.includes(marker));
}

function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase();
}

function detectDefaultLocale(): Locale {
  if (typeof navigator !== "undefined" && navigator.language?.startsWith("de")) {
    return "de";
  }
  return "en";
}

const DEFAULT_LOCALE = detectDefaultLocale();

export const DEFAULT_SETTINGS: ExtensionSettings = {
  openWebuiBaseUrl: "http://localhost:3000",
  apiToken: "",
  model: "gemma4:latest",
  openWebuiKnowledgeSyncEnabled: false,
  openWebuiKnowledgeBaseName: "LocalScribe Meetings",
  summaryPrompt: getDefaultSummaryPrompt(DEFAULT_LOCALE),
  summaryNoteType: "auto",
  summaryLength: "short",
  summaryLanguage: "auto",
  summaryStrictness: "strict",
  sttEndpointPath: "/api/v1/audio/transcriptions",
  chatEndpointPath: "/api/chat/completions",
  locale: DEFAULT_LOCALE,
  liveTranscriptionEnabled: false
};
