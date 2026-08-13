"use client";

import { useId } from "react";
import {
  localeMetadata,
  supportedLocales,
  type SupportedLocale,
} from "@/lib/i18n";

type LanguageSwitcherProps = {
  locale: SupportedLocale;
  onLocaleChange: (locale: SupportedLocale) => void;
  className?: string;
  id?: string;
  label?: string;
  compact?: boolean;
};

export function LanguageSwitcher({
  locale,
  onLocaleChange,
  className,
  id,
  label = "Langue",
  compact = false,
}: LanguageSwitcherProps) {
  const generatedId = useId();
  const selectId = id ?? `language-switcher-${generatedId}`;

  return (
    <div className={className}>
      <label htmlFor={selectId}>{label}</label>
      <select
        id={selectId}
        value={locale}
        onChange={(event) => {
          const nextLocale = event.target.value as SupportedLocale;
          onLocaleChange(nextLocale);
        }}
      >
        {supportedLocales.map((supportedLocale) => (
          <option
            key={supportedLocale}
            value={supportedLocale}
            aria-label={localeMetadata[supportedLocale].nativeLabel}
          >
            {compact
              ? supportedLocale.toUpperCase()
              : localeMetadata[supportedLocale].nativeLabel}
          </option>
        ))}
      </select>
    </div>
  );
}
