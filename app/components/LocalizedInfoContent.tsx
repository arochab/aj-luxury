"use client";

import type { ReactNode } from "react";
import { LEGAL_CONTACT } from "@/lib/legal";
import { useI18n } from "@/lib/i18n/I18nProvider";

type LocalizedInfoContentProps = {
  children: ReactNode;
  status: ReactNode | false;
  officialFrenchOnly: boolean;
};

export default function LocalizedInfoContent({
  children,
  status,
  officialFrenchOnly,
}: LocalizedInfoContentProps) {
  const { locale, t } = useI18n();

  if (officialFrenchOnly && locale !== "fr") {
    return (
      <>
        <section>
          <h2>{t("info.localizedNoticeTitle")}</h2>
          <p>{t("info.localizedNoticeBody")}</p>
          <p>
            {t("info.localizedNoticeContact")} {" "}
            <a href={`mailto:${LEGAL_CONTACT.email}`}>
              {LEGAL_CONTACT.email}
            </a>
            .
          </p>
        </section>
        {status}
      </>
    );
  }

  return (
    <>
      {children}
      {status}
    </>
  );
}
