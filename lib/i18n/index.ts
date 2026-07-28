export {
  defaultLocale,
  isSupportedLocale,
  localeFromLanguageTag,
  localeMetadata,
  localeStorageKey,
  supportedLocales,
} from "./config";
export {
  getDictionary,
  translate,
  type Dictionary,
  type TranslationKey,
} from "./dictionaries";
export {
  getClientCopy,
  isClientCopyFallback,
  type ClientCopyKey,
} from "./client-copy";
export {
  detectBrowserLocale,
  persistLocale,
  readStoredLocale,
  resolvePreferredLocale,
} from "./client";
export type {
  ClientCopyStatus,
  LocaleMetadata,
  LocalizedClientCopy,
  SupportedLocale,
} from "./types";
