"use client";

import Image from "next/image";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/I18nProvider";
import SiteLanguageSwitcher from "./SiteLanguageSwitcher";
import styles from "./StoreChrome.module.css";

export default function StoreFooter() {
  const { t } = useI18n();

  return (
    <footer className={styles.footer}>
      <div className={styles.footerTop}>
        <section className={styles.footerIdentity} aria-labelledby="footer-title">
          <Image
            className={styles.footerLogo}
            src="/images/aj-luxury-logo.webp"
            alt="AJ Luxury"
            width={180}
            height={92}
            unoptimized
          />
          <h2 className={styles.footerTitle} id="footer-title" lang="en">
            Reveal Your Inner Beauty
          </h2>
          <p className={styles.footerCopy} lang="fr">
            Sous-vêtements masculins conçus autour du confort, de la qualité et
            de la confiance en soi.
          </p>
          <SiteLanguageSwitcher placement="footer" />
        </section>

        <div className={styles.footerColumns}>
          <section aria-labelledby="footer-boutique">
            <h3 className={styles.footerHeading} id="footer-boutique">
              {t("footer.shop")}
            </h3>
            <nav className={styles.footerLinks} aria-label="Liens boutique">
              <Link className={styles.footerLink} href="/shop">
                {t("footer.collection")}
              </Link>
              <Link className={styles.footerLink} href="/account">
                {t("footer.account")}
              </Link>
              <Link className={styles.footerLink} href="/shipping-returns">
                {t("footer.shippingReturns")}
              </Link>
            </nav>
          </section>

          <section aria-labelledby="footer-informations">
            <h3 className={styles.footerHeading} id="footer-informations">
              {t("footer.information")}
            </h3>
            <nav className={styles.footerLinks} aria-label="Liens informations">
              <Link className={styles.footerLink} href="/notre-histoire">
                {t("footer.story")}
              </Link>
              <Link className={styles.footerLink} href="/contact">
                {t("footer.contact")}
              </Link>
              <a
                className={styles.footerLink}
                href="mailto:contact@ajluxurystore.com"
              >
                contact@ajluxurystore.com
              </a>
              <Link className={styles.footerLink} href="/privacy">
                {t("footer.privacy")}
              </Link>
              <Link className={styles.footerLink} href="/terms">
                {t("footer.terms")}
              </Link>
              <Link className={styles.footerLink} href="/legal-notice">
                {t("footer.legal")}
              </Link>
              <Link className={styles.footerLink} href="/cookies">
                {t("footer.cookies")}
              </Link>
            </nav>
          </section>
        </div>
      </div>

      <div className={styles.footerBottom}>
        <span>© {new Date().getFullYear()} AJ Luxury</span>
        <span lang="en">Reveal Your Inner Beauty</span>
      </div>
    </footer>
  );
}
