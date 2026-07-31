"use client";

import type { TranslationKey } from "./dictionaries";
import { useI18n } from "./I18nProvider";

type TranslatedTextProps = {
  id: TranslationKey;
  values?: Record<string, string | number>;
};

export function TranslatedText({ id, values }: TranslatedTextProps) {
  const { t } = useI18n();
  const translated = Object.entries(values ?? {}).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    t(id),
  );

  return <>{translated}</>;
}

export const T = TranslatedText;
