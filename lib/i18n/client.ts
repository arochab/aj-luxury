import {
  defaultLocale,
  localeFromLanguageTag,
  localeStorageKey,
} from "./config";
import type { SupportedLocale } from "./types";

export function readStoredLocale(): SupportedLocale | null {
  if (typeof window === "undefined") return null;

  try {
    return localeFromLanguageTag(window.localStorage.getItem(localeStorageKey));
  } catch {
    return null;
  }
}

export function detectBrowserLocale(): SupportedLocale | null {
  if (typeof navigator === "undefined") return null;

  const candidates =
    navigator.languages?.length > 0
      ? navigator.languages
      : [navigator.language];

  for (const candidate of candidates) {
    const locale = localeFromLanguageTag(candidate);
    if (locale) return locale;
  }

  return null;
}

export function resolvePreferredLocale(): SupportedLocale {
  return readStoredLocale() ?? detectBrowserLocale() ?? defaultLocale;
}

export function persistLocale(locale: SupportedLocale): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(localeStorageKey, locale);
  } catch {
    // The selector remains usable when storage is blocked or unavailable.
  }
}
