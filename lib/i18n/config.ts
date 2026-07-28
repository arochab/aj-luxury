import manifest from "./manifest.json";
import type { LocaleMetadata, SupportedLocale } from "./types";

export const defaultLocale = manifest.defaultLocale as SupportedLocale;

export const supportedLocales =
  manifest.supportedLocales as readonly SupportedLocale[];

export const localeStorageKey = manifest.storageKey;

export const localeMetadata: Record<SupportedLocale, LocaleMetadata> = {
  fr: { label: "Français", nativeLabel: "Français", htmlLang: "fr" },
  en: { label: "Anglais", nativeLabel: "English", htmlLang: "en" },
  es: { label: "Espagnol", nativeLabel: "Español", htmlLang: "es" },
  de: { label: "Allemand", nativeLabel: "Deutsch", htmlLang: "de" },
  it: { label: "Italien", nativeLabel: "Italiano", htmlLang: "it" },
};

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === "string" &&
    supportedLocales.includes(value as SupportedLocale)
  );
}

export function localeFromLanguageTag(
  languageTag: string | null | undefined,
): SupportedLocale | null {
  if (!languageTag) return null;

  const baseLocale = languageTag.trim().toLowerCase().split(/[-_]/)[0];
  return isSupportedLocale(baseLocale) ? baseLocale : null;
}
