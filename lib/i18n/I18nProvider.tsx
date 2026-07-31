"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { defaultLocale, localeMetadata } from "./config";
import {
  persistLocale,
  resolvePreferredLocale,
} from "./client";
import { translate, type TranslationKey } from "./dictionaries";
import type { SupportedLocale } from "./types";

const PAGE_TITLE_KEYS: Record<string, TranslationKey> = {
  "/shop": "nav.shop",
  "/notre-histoire": "nav.story",
  "/account": "nav.account",
  "/cart": "cart.title",
  "/checkout": "checkout.demoLabel",
  "/contact": "nav.contact",
  "/shipping-returns": "info.shipping.title",
  "/privacy": "info.privacy.title",
  "/terms": "info.terms.title",
  "/legal-notice": "info.legal.title",
  "/cookies": "info.cookies.title",
  "/withdrawal": "info.withdrawal.title",
};

type I18nContextValue = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: (key: TranslationKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

type I18nProviderProps = {
  children: ReactNode;
  initialLocale?: SupportedLocale;
};

export function I18nProvider({
  children,
  initialLocale = defaultLocale,
}: I18nProviderProps) {
  const pathname = usePathname();
  const [locale, setLocaleState] =
    useState<SupportedLocale>(initialLocale);

  useEffect(() => {
    const preferredLocale = resolvePreferredLocale();

    if (preferredLocale === initialLocale) return;

    const updateId = window.setTimeout(() => {
      setLocaleState(preferredLocale);
    }, 0);

    return () => window.clearTimeout(updateId);
  }, [initialLocale]);

  useEffect(() => {
    document.documentElement.lang = localeMetadata[locale].htmlLang;
  }, [locale]);

  useEffect(() => {
    if (!pathname) return;

    const titleKey = PAGE_TITLE_KEYS[pathname];
    if (!titleKey) return;

    const localizedTitle = translate(locale, titleKey).replace(/\.$/, "");
    document.title = `${localizedTitle} | AJ Luxury`;
  }, [locale, pathname]);

  const setLocale = useCallback((nextLocale: SupportedLocale) => {
    persistLocale(nextLocale);
    setLocaleState(nextLocale);
  }, []);

  const t = useCallback(
    (key: TranslationKey) => translate(locale, key),
    [locale],
  );

  const contextValue = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <I18nContext.Provider value={contextValue}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }

  return context;
}
