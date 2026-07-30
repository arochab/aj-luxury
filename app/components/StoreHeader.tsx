"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import SiteLanguageSwitcher from "./SiteLanguageSwitcher";
import styles from "./StoreChrome.module.css";

type StoreHeaderProps = {
  variant?: "default" | "minimal" | "light";
};

const navigation = [
  { href: "/shop", labelKey: "nav.shop" },
  { href: "/notre-histoire", labelKey: "nav.story" },
] satisfies Array<{ href: string; labelKey: TranslationKey }>;

const accountLinks = [
  { href: "/account", labelKey: "nav.account" },
  { href: "/cart", labelKey: "nav.cart" },
] satisfies Array<{ href: string; labelKey: TranslationKey }>;

export default function StoreHeader({
  variant = "default",
}: StoreHeaderProps) {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <header
      className={`${styles.header} ${
        variant === "minimal"
          ? styles.headerMinimal
          : variant === "light"
            ? styles.headerLight
            : ""
      }`}
    >
      <Link className={styles.brand} href="/" aria-label="AJ Luxury, accueil">
        <Image
          className={styles.brandImage}
          src="/images/aj-luxury-logo.webp"
          alt=""
          width={180}
          height={92}
          priority
          unoptimized
        />
      </Link>

      {variant === "default" ? (
        <nav className={styles.desktopNav} aria-label={t("nav.mainLabel")}>
          {navigation.map((item) => (
            <Link
              className={styles.navLink}
              href={item.href}
              key={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>
      ) : null}

      <div className={styles.actions}>
        <SiteLanguageSwitcher placement="header" />
        {accountLinks.map((item) => (
          <Link className={styles.actionLink} href={item.href} key={item.href}>
            {t(item.labelKey)}
          </Link>
        ))}
      </div>
    </header>
  );
}
