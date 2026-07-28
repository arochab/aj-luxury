"use client";

import { useI18n } from "@/lib/i18n/I18nProvider";
import { formatPrice } from "@/lib/products";

type LocalizedPriceProps = {
  amountCents: number | null;
};

export default function LocalizedPrice({ amountCents }: LocalizedPriceProps) {
  const { locale } = useI18n();
  return <>{formatPrice(amountCents, locale)}</>;
}
