import { ja } from "./ja";
import { en } from "./en";

export type Locale = "ja" | "en";
export type Translations = typeof ja;

const dictionaries: Record<Locale, Translations> = { ja, en };

/**
 * Obsidian's `getLanguage()` returns an arbitrary ISO code (or "en" when the
 * user left it as "system default"). Only Japanese has a maintained
 * translation here, so every other language falls back to English rather
 * than showing a half-supported locale.
 */
export const resolveLocale = (rawLanguageCode: string | undefined | null): Locale =>
  rawLanguageCode === "ja" ? "ja" : "en";

export const translationsFor = (locale: Locale): Translations => dictionaries[locale];
