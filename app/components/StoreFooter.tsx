"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/I18nProvider";
import SiteLanguageSwitcher from "./SiteLanguageSwitcher";
import { useAjMotion } from "./useAjMotion";
import styles from "./StoreChrome.module.css";

/* ==========================================================================
   StoreFooter — la clôture, sur les quinze routes
   --------------------------------------------------------------------------
   Le pied pesait 1,38 écran cumulé. Il en fait moins d'un demi, sans qu'une
   seule information ait disparu. Ce qui a été retiré n'était pas de
   l'information :
     • le logo, déjà présent en haut de la MÊME page — il redevient un
       mot-marque en métal, qui dit la même chose en une ligne ;
     • la signature « Reveal Your Inner Beauty », écrite deux fois — elle ne
       vit plus que dans la ligne de bas de page, au traitement exact du h1 de
       la maquette : 15px, 600, .24em de chasse ;
     • l'adresse e-mail, qui était perdue au milieu d'une colonne de liens —
       elle remonte dans le bloc d'identité, où on la cherche.

   Les onze destinations sont toutes là. Le plancher de 15px est tenu partout.
   ========================================================================== */

export default function StoreFooter() {
  const { t } = useI18n();

  const racine = useAjMotion<HTMLElement>(({ gsap, mm, racine: pied }) => {
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      // Interrogation directe du DOM plutôt qu'un sélecteur passé à GSAP : la
      // portée est alors explicite et ne dépend d'aucun comportement de
      // gsap.context() — on ne peut pas déborder sur l'écran d'un autre agent.
      const blocs = Array.from(
        pied.querySelectorAll<HTMLElement>("[data-aj-pied-bloc]"),
      );
      if (!blocs.length) return;

      // Sur une page courte, le pied est déjà à l'écran au montage. Le masquer
      // pour le révéler aussitôt produirait un clignotement — on le laisse
      // simplement en place. Rien n'est jamais masqué en CSS ici : sans JS, le
      // pied est complet et lisible.
      const deja =
        pied.getBoundingClientRect().top < window.innerHeight * 0.88;
      if (deja) return;

      gsap.from(blocs, {
        yPercent: 6,
        opacity: 0,
        duration: 0.75,
        ease: "expo.out",
        stagger: 0.08,
        scrollTrigger: {
          trigger: pied,
          start: "top 88%",
          once: true,
          invalidateOnRefresh: true,
        },
      });
    });
  });

  return (
    <footer className={styles.footer} ref={racine}>
      <div className={styles.footerTop}>
        <section
          className={styles.footerIdentity}
          aria-labelledby="footer-title"
          data-aj-pied-bloc
        >
          <h2 className={`${styles.footerWordmark} aj-metal`} id="footer-title">
            AJ Luxury
          </h2>
          <p className={styles.footerCopy}>{t("footer.description")}</p>
          <a
            className={styles.footerMail}
            href="mailto:contact@ajluxurystore.com"
          >
            contact@ajluxurystore.com
          </a>
          <SiteLanguageSwitcher placement="footer" />
        </section>

        <section aria-labelledby="footer-boutique" data-aj-pied-bloc>
          <h3 className={styles.footerHeading} id="footer-boutique">
            {t("footer.shop")}
          </h3>
          <nav
            className={styles.footerLinks}
            aria-label={t("footer.shopLinksLabel")}
          >
            <Link className={styles.footerLink} href="/shop">
              {t("footer.collection")}
            </Link>
            <Link className={styles.footerLink} href="/account">
              {t("footer.account")}
            </Link>
            <Link className={styles.footerLink} href="/shipping-returns">
              {t("footer.shippingReturns")}
            </Link>
            <Link className={styles.footerLink} href="/withdrawal">
              {t("footer.withdrawal")}
            </Link>
          </nav>
        </section>

        <section aria-labelledby="footer-informations" data-aj-pied-bloc>
          <h3 className={styles.footerHeading} id="footer-informations">
            {t("footer.information")}
          </h3>
          <nav
            className={styles.footerLinks}
            aria-label={t("footer.informationLinksLabel")}
          >
            <Link className={styles.footerLink} href="/notre-histoire">
              {t("footer.story")}
            </Link>
            <Link className={styles.footerLink} href="/contact">
              {t("footer.contact")}
            </Link>
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

      <div className={styles.footerBottom}>
        <span>© {new Date().getFullYear()} AJ Luxury</span>
        <span className={styles.footerSignature} lang="en">
          Reveal Your Inner Beauty
        </span>
      </div>
    </footer>
  );
}
