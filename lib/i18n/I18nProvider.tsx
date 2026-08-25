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
    /*
      Le jeton de version passe à v9 le 25/08. Il n'est pas décoratif : la
      réponse est servie immuable et relue en `force-cache`, et le contrôle
      `complete` juste en dessous exige que TOUTES les clés de fr.json soient
      présentes. Un visiteur revenant avec l'ancien dictionnaire en cache
      obtiendrait donc `null` dès qu'une clé est ajoutée, et tout le site
      repasserait silencieusement en français pour les quatre autres langues.
      La règle est donc : toute clé ajoutée ou retirée des dictionnaires
      incrémente ce jeton. La passe récit en a ajouté huit (story.lead,
      story.movement*, story.founders*, shop.firstModel, shop.intro) et passé
      le jeton à v5. La passe boutique du 19/08 en ajoute cinq de plus —
      shop.saleNotice, shop.notify, product.openingSoon et les deux formes de
      product.availabilityAtOpening — d'où v6. La présentation de recette
      commerce ajoute ensuite les libellés de stock, packs, paiement et
      livraison — d'où v7. Le sélecteur d'offres pack ajoute ses libellés et
      porte le jeton à v8. La passe de précision commerciale ajoute le prix
      par pièce et porte le jeton à v9. Sans cette incrémentation, un
      visiteur revenu avec le dictionnaire v5 en cache verrait le contrôle
      `complete` échouer et la boutique repasser en français dans les quatre
      autres langues.
      Ce jeton est indépendant de celui des médias héro (lib/hero-video.ts).
    */
    const response = await fetch(`/media/i18n/${locale}.json?v=v9`, {
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

/*
  Ce que voient un moteur de recherche, un aperçu de lien partagé ou un onglet
  ouvert en arrière-plan, c'est le titre du RENDU SERVEUR. Ce tableau le
  remplace après hydratation pour le localiser : il ne doit donc jamais dire
  autre chose que lui, sinon le site se présente sous deux noms selon le canal.

  Deux routes en sont retirées le 19/08, parce que leur titre dépend du mode
  d'exécution du commerce — un état que ce provider ne peut pas lire :

  • `/checkout` pointait sur `checkout.preprodLabel` (« Livraison ·
    préproduction ») alors que le serveur calcule « Commerce fermé »,
    « Livraison préproduction » ou « Livraison et paiement » selon le mode. Le
    client annonçait donc « préproduction » y compris boutique fermée, en
    contradiction avec le contenu de la page ;
  • `/account` disait « Compte » là où le serveur dit « Espace client fermé ».

  Ces deux routes sont `noindex` et le serveur y est la bonne autorité : on
  cesse de l'écraser plutôt que d'inventer côté client un état inconnu.

  `/withdrawal` reste localisé ici — le point final de `info.withdrawal.title`
  est déjà retiré plus bas — mais son `metadata.title` serveur, qui disait
  « Renoncer au contrat », a été aligné sur ce même libellé.
*/
const PAGE_TITLE_KEYS: Record<string, TranslationKey> = {
  "/shop": "nav.shop",
  "/notre-histoire": "nav.story",
  "/cart": "cart.title",
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
