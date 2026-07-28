"use client";

import {
  getClientCopy,
  isClientCopyFallback,
  type ClientCopyKey,
} from "@/lib/i18n/client-copy";
import { useI18n } from "@/lib/i18n/I18nProvider";

type ClientCopyTextProps = {
  copyKey: ClientCopyKey;
};

export default function ClientCopyText({ copyKey }: ClientCopyTextProps) {
  const { locale } = useI18n();
  const fallsBackToFrench = isClientCopyFallback(copyKey, locale);

  return (
    <span lang={fallsBackToFrench ? "fr" : locale}>
      {getClientCopy(copyKey, locale)}
    </span>
  );
}
