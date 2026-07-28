import clientCopyData from "./client-copy.json";
import type {
  LocalizedClientCopy,
  SupportedLocale,
} from "./types";

export type ClientCopyKey = keyof typeof clientCopyData;

export const clientCopy =
  clientCopyData as Record<ClientCopyKey, LocalizedClientCopy>;

export function getClientCopy(
  key: ClientCopyKey,
  locale: SupportedLocale,
): string {
  const entry = clientCopy[key];

  if (locale === entry.sourceLocale) return entry.source;
  return entry.translations[locale] ?? entry.source;
}

export function isClientCopyFallback(
  key: ClientCopyKey,
  locale: SupportedLocale,
): boolean {
  const entry = clientCopy[key];
  return locale !== entry.sourceLocale && !entry.translations[locale];
}
