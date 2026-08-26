"use client";

import { useI18n } from "../../lib/i18n/I18nProvider";
import { formatPrice } from "../../lib/products";

type PackSavingProps = {
  amountCents: number;
  percent: string;
};

export default function PackSaving({
  amountCents,
  percent,
}: PackSavingProps) {
  const { locale, t } = useI18n();

  return (
    <>
      {t("product.packSaving")
        .replace("{amount}", formatPrice(amountCents, locale))
        .replace("{percent}", percent)}
    </>
  );
}
