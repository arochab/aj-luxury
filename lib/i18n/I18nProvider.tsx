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
import fr from "./dictionaries/fr.json";
import type { Dictionary, TranslationKey } from "./dictionaries";
import type { SupportedLocale } from "./types";

const dictionaryCache = new Map<SupportedLocale, Dictionary>([["fr", fr]]);

async function loadDictionary(
  locale: SupportedLocale,
): Promise<Dictionary | null> {
  const cached = dictionaryCache.get(locale);
  if (cached) return cached;

  try {
    const response = await fetch(`/media/i18n/${locale}.json?v=v3`, {
      cache: "force-cache",
    });
    if (!response.ok) return null;

    const candidate = (await response.json()) as Partial<Dictionary>;
    const complete = (Object.keys(fr) as TranslationKey[]).every(
      (key) => typeof candidate[key] === "string",
    );
    if (!complete) return null;

    const dictionary = candidate as Dictionary;
    dictionaryCache.set(locale, dictionary);
    return dictionary;
  } catch {
    return null;
  }
}

function translateFrom(
  dictionary: Dictionary,
  key: TranslationKey,
): string {
  return dictionary[key] ?? fr[key];
}

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
  const [dictionary, setDictionary] = useState<Dictionary>(fr);

  useEffect(() => {
    const preferredLocale = resolvePreferredLocale();

    if (preferredLocale === initialLocale) return;

    let active = true;
    const updateId = window.setTimeout(() => {
      void loadDictionary(preferredLocale).then((preferredDictionary) => {
        if (!active || !preferredDictionary) return;
        setDictionary(preferredDictionary);
        setLocaleState(preferredLocale);
      });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(updateId);
    };
  }, [initialLocale]);

  useEffect(() => {
    document.documentElement.lang = localeMetadata[locale].htmlLang;
  }, [locale]);

  useEffect(() => {
    if (!pathname) return;

    const titleKey = PAGE_TITLE_KEYS[pathname];
    if (!titleKey) return;

    const localizedTitle = translateFrom(dictionary, titleKey).replace(/\.$/, "");
    document.title = `${localizedTitle} | AJ Luxury`;
  }, [dictionary, pathname]);

  const setLocale = useCallback((nextLocale: SupportedLocale) => {
    void loadDictionary(nextLocale).then((nextDictionary) => {
      if (!nextDictionary) return;
      persistLocale(nextLocale);
      setDictionary(nextDictionary);
      setLocaleState(nextLocale);
    });
  }, []);

  const t = useCallback(
    (key: TranslationKey) => translateFrom(dictionary, key),
    [dictionary],
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
