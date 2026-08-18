"use client";

/* eslint-disable @next/next/no-img-element -- the fixed local logo needs no image-loader runtime */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/I18nProvider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import SiteLanguageSwitcher from "./SiteLanguageSwitcher";
import { useAjMotion } from "./useAjMotion";
import styles from "./StoreChrome.module.css";

/* ==========================================================================
   StoreHeader — la barre vue sur les quinze routes
   --------------------------------------------------------------------------
   Elle est COLLANTE, pas fixe. La différence n'est pas cosmétique : `sticky`
   reste dans le flux, donc toutes les pages qui déduisent leur hauteur de la
   sienne (Recit.module.css le fait explicitement) continuent de tomber juste.
   Un `fixed` les aurait toutes décalées d'une hauteur d'en-tête.

   Comportement au scroll : elle se dérobe vers le haut quand on descend, elle
   revient dès qu'on remonte. On rend l'écran au produit sans jamais éloigner
   le panier de plus d'un geste.
   ========================================================================== */

type StoreHeaderProps = {
  variant?: "default" | "minimal" | "light";
};

const navigation = [
  { href: "/", labelKey: "nav.home" },
  { href: "/shop", labelKey: "nav.shop" },
  { href: "/notre-histoire", labelKey: "nav.story" },
] satisfies Array<{ href: string; labelKey: TranslationKey }>;

const accountLinks = [
  { href: "/account", labelKey: "nav.account" },
  { href: "/cart", labelKey: "nav.cart" },
] satisfies Array<{ href: string; labelKey: TranslationKey }>;

function isCurrentNavigationItem(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/shop") {
    return pathname === "/shop" || pathname.startsWith("/products/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Vrai si un ancêtre crée un conteneur de défilement.
 *
 * Sur l'accueil, l'en-tête est DANS `.aj-film`, qui porte `overflow: hidden`.
 * Un tel ancêtre annule `position: sticky` : la barre se comporte comme un
 * bloc ordinaire et disparaît avec le film. La traduire hors champ ferait donc
 * disparaître la navigation pendant tout le premier écran, sans qu'aucun
 * scroll ne puisse la ramener. On ne câble la dérobade que si le collage est
 * réellement effectif.
 *
 * `clip` et `visible` ne créent PAS de conteneur de défilement — `.aj-home`
 * porte `overflow-x: clip` et doit rester éligible.
 */
function estDansUnConteneurDeDefilement(noeud: HTMLElement): boolean {
  const clippant = /^(auto|scroll|hidden)$/;
  let parent = noeud.parentElement;
  while (parent && parent !== document.body) {
    const style = getComputedStyle(parent);
    if (clippant.test(style.overflowX) || clippant.test(style.overflowY)) {
      return true;
    }
    parent = parent.parentElement;
  }
  return false;
}

export default function StoreHeader({
  variant = "default",
}: StoreHeaderProps) {
  const pathname = usePathname();
  const { t } = useI18n();

  const racine = useAjMotion<HTMLElement>(
    ({ gsap, ScrollTrigger, racine: tete, mm }) => {
      if (estDansUnConteneurDeDefilement(tete)) return;

      // Deux conditions, pour que la branche soit exécutée dans les deux cas :
      // avec une seule, matchMedia ne rappellerait rien sous mouvement réduit
      // et l'état « posé » serait perdu avec la dérobade.
      mm.add(
        {
          anime: "(prefers-reduced-motion: no-preference)",
          reduit: "(prefers-reduced-motion: reduce)",
        },
        (contexte) => {
          const { anime } = contexte.conditions as {
            anime: boolean;
            reduit: boolean;
          };

          // Sous ce seuil on ne se dérobe jamais : un micro-scroll en haut de
          // page ne doit pas faire clignoter la barre.
          const SEUIL = 140;
          let cachee = false;

          const montrer = () => {
            if (!cachee) return;
            cachee = false;
            gsap.to(tete, {
              yPercent: 0,
              duration: 0.42,
              ease: "power2.out",
              overwrite: true,
            });
          };

          const cacher = () => {
            if (cachee) return;
            cachee = true;
            gsap.to(tete, {
              yPercent: -100,
              duration: 0.36,
              ease: "power2.in",
              overwrite: true,
            });
          };

          // Le scroll est la seule horloge : pas de trigger, pas de durée
          // pilotée par un minuteur — on lit la position et la direction.
          ScrollTrigger.create({
            id: "aj-chrome-tete",
            start: 0,
            end: "max",
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              const y = self.scroll();
              tete.classList.toggle(styles.headerPose, y > 8);
              if (!anime) return;
              if (y <= SEUIL) {
                montrer();
                return;
              }
              if (self.direction === 1) cacher();
              else montrer();
            },
          });

          // Une barre dérobée qui reçoit le focus au clavier doit revenir :
          // sans ça, la tabulation part sur une cible invisible.
          const auFocus = () => montrer();
          tete.addEventListener("focusin", auFocus);

          return () => {
            tete.removeEventListener("focusin", auFocus);
            tete.classList.remove(styles.headerPose);
            gsap.set(tete, { clearProps: "transform" });
          };
        },
      );
    },
    // Une navigation client remonte la page en haut : on reconstruit la scène
    // pour repartir d'un en-tête visible et de mesures fraîches.
    [pathname],
  );

  return (
    <header
      ref={racine}
      className={`${styles.header} ${
        variant === "minimal"
          ? styles.headerMinimal
          : variant === "light"
            ? styles.headerLight
            : ""
      }`}
    >
      <Link
        className={styles.brand}
        href="/"
        aria-label={`AJ Luxury · ${t("nav.home")}`}
      >
        <img
          className={styles.brandImage}
          src="/images/aj-luxury-logo.webp"
          alt=""
          width={180}
          height={92}
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />
      </Link>

      {variant !== "minimal" ? (
        <nav className={styles.desktopNav} aria-label={t("nav.mainLabel")}>
          {navigation.map((item) => (
            <Link
              className={styles.navLink}
              href={item.href}
              key={item.href}
              aria-current={
                isCurrentNavigationItem(pathname, item.href)
                  ? "page"
                  : undefined
              }
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
