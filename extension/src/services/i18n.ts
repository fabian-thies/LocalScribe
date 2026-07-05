import type { Locale } from "../types/settings";
import en from "../locales/en.json";
import de from "../locales/de.json";

const dictionaries: Record<Locale, Record<string, string>> = { en, de };
let currentLocale: Locale = detectDefaultLocale();
let currentDict: Record<string, string> = dictionaries[currentLocale];

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  currentDict = dictionaries[locale] || dictionaries.en;
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: string, params?: Record<string, string>): string {
  let text = currentDict[key];
  if (text === undefined) {
    text = key;
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
  }
  return text;
}

function detectDefaultLocale(): Locale {
  if (typeof navigator !== "undefined" && navigator.language?.startsWith("de")) {
    return "de";
  }
  return "en";
}
