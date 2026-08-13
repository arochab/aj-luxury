import de from "./dictionaries/de.json";
import en from "./dictionaries/en.json";
import es from "./dictionaries/es.json";
import fr from "./dictionaries/fr.json";
import it from "./dictionaries/it.json";
import { defaultLocale } from "./config";
import type { SupportedLocale } from "./types";

export type TranslationKey = keyof typeof fr;
export type Dictionary = Record<TranslationKey, string>;

export const dictionaries: Record<SupportedLocale, Dictionary> = {
  fr,
  en,
  es,
  de,
  it,
};

export function getDictionary(
  locale: SupportedLocale = defaultLocale,
): Dictionary {
  return dictionaries[locale] ?? dictionaries[defaultLocale];
}

export function translate(
  locale: SupportedLocale,
  key: TranslationKey,
): string {
  return dictionaries[locale]?.[key] ?? dictionaries[defaultLocale][key];
}
