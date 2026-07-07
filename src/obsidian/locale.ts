import { getLanguage } from "obsidian";
import { resolveLocale, type Locale } from "../ui/i18n";

/**
 * Detects the user's configured Obsidian UI language once per modal open.
 * `getLanguage()` is a public Obsidian API (added in 1.8.7 — this plugin's
 * `minAppVersion`) that returns an ISO code and defaults to `"en"` when the
 * language is left as "Default (system)". See AGENTS.md's i18n section for
 * the ja/en fallback policy.
 */
export const detectLocale = (): Locale => resolveLocale(getLanguage());
