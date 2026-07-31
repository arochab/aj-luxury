export type SupportedLocale = "fr" | "en" | "es" | "de" | "it";

export type LocaleMetadata = {
  label: string;
  nativeLabel: string;
  htmlLang: string;
};

export type ClientCopyStatus = "source-only" | "localized" | "client-approved";

export type LocalizedClientCopy = {
  sourceLocale: "fr";
  fallbackLocale: "fr";
  status: ClientCopyStatus;
  source: string;
  translations: Partial<Record<Exclude<SupportedLocale, "fr">, string>>;
};
