"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";
import { LanguageSwitcher } from "./LanguageSwitcher";
import styles from "./StoreChrome.module.css";

type SiteLanguageSwitcherProps = {
  placement: "header" | "footer";
};

export default function SiteLanguageSwitcher({
  placement,
}: SiteLanguageSwitcherProps) {
  const { locale, setLocale, t } = useI18n();

  return (
    <LanguageSwitcher
      className={`${styles.languageSwitcher} ${
        placement === "footer" ? styles.languageSwitcherFooter : ""
      }`}
      locale={locale}
      onLocaleChange={setLocale}
      label={t("language.label")}
      id={`language-switcher-${placement}`}
      compact
    />
  );
}
