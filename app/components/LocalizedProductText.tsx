"use client";

import { getLocalizedProductCopy } from "@/lib/i18n/product-copy";
import { useI18n } from "@/lib/i18n/I18nProvider";

type LocalizedProductTextProps = {
  slug: string;
  field: "tone";
};

export default function LocalizedProductText({
  slug,
  field,
}: LocalizedProductTextProps) {
  const { t } = useI18n();
  return <>{getLocalizedProductCopy(t, slug)[field]}</>;
}
