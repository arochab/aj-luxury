"use client";

import type { TranslationKey } from "./dictionaries";
import { useI18n } from "./I18nProvider";

type TranslatedTextProps = {
  id: TranslationKey;
};

export function TranslatedText({ id }: TranslatedTextProps) {
  const { t } = useI18n();
  return <>{t(id)}</>;
}

export const T = TranslatedText;
