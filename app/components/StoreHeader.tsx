"use client";

/* eslint-disable @next/next/no-img-element -- the fixed local logo needs no image-loader runtime */

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
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

  /* ── LE MENU DU TÉLÉPHONE ────────────────────────────────────────────
     Sous 560px, la barre passait sur DEUX rangées — marque + actions, puis
     les trois liens de nav sous un filet — soit 110,4px mesurés à 390x844,
     13,1 % du premier écran pris par du chrome. Elle revient à UNE rangée de
     56px et les six cibles (trois liens de nav, le sélecteur de langue,
     Compte, Panier) passent derrière ce bouton unique.

     Le repli est en CSS seul : au-dessus de 560px le bouton n'est pas rendu
     dans la mise en page (`display: none`) et la nav comme les actions
     reprennent leur place. Rien n'est conditionné au JS pour le bureau, donc
     rien ne peut disparaître si le JS échoue.

     AUCUNE CLÉ DE COPIE N'EST CRÉÉE. Le bouton n'a pas de libellé visible :
     son signe est un double filet, la même ligne incisée que le film. Son nom
     accessible réutilise `nav.mainLabel` fermé et `product.close` ouvert —
     deux clés déjà présentes dans les cinq dictionnaires et leurs jumeaux
     public/i18n. */
  const [menuOuvert, setMenuOuvert] = useState(false);
  /* La timeline du menu, construite une fois GSAP chargé. Elle vit dans un ref
     et non dans l'état : la rejouer ne doit rien re-rendre. */
  const ouvertureMenu = useRef<{ play: () => void; reverse: () => void } | null>(
    null,
  );
  const menuId = useId();

  const basculerMenu = useCallback(() => {
    setMenuOuvert((ouvert) => !ouvert);
  }, []);

  /* Une navigation referme le menu : sans ça, la barre garderait son panneau
     ouvert par-dessus la page d'arrivée.

     L'ajustement se fait PENDANT LE RENDU, pas dans un effet. Un
     `useEffect(() => setMenuOuvert(false), [pathname])` provoque un second
     rendu en cascade — c'est le motif que `react-hooks/set-state-in-effect`
     refuse, et il a raison : la page d'arrivée serait peinte une fois avec le
     panneau encore ouvert. En comparant le chemin rendu au chemin courant on
     obtient le bon état dès le premier rendu. Le retour arrière du navigateur
     est couvert par la même comparaison. */
  const [cheminRendu, setCheminRendu] = useState(pathname);
  if (cheminRendu !== pathname) {
    setCheminRendu(pathname);
    setMenuOuvert(false);
  }

  /* Échap referme, comme partout ailleurs sur le site (AGENTS.md, « Responsive
     et interactions »). Écouté sur le document : la touche doit répondre même
     si le focus est reparti dans la page. */
  /* Le menu joue sa partition à l'endroit, la rembobine à l'envers. Aucun
     re-rendu : on pilote une timeline déjà construite. */
  useEffect(() => {
    const partition = ouvertureMenu.current;
    if (!partition) return;
    if (menuOuvert) partition.play();
    else partition.reverse();
  }, [menuOuvert]);

  useEffect(() => {
    if (!menuOuvert) return;
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key === "Escape") setMenuOuvert(false);
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [menuOuvert]);

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
          // Le menu n'existe qu'ici : c'est la seule taille où le panneau est
          // un panneau et non six cibles alignées dans la barre.
          etroit: "(max-width: 560px)",
        },
        (contexte) => {
          const { anime, etroit } = contexte.conditions as {
            anime: boolean;
            reduit: boolean;
            etroit: boolean;
          };

          /* Sous ce seuil on ne se dérobe jamais : un micro-scroll en haut de
             page ne doit pas faire clignoter la barre.

             UNE PAGE PEUT ALLONGER CE SEUIL. Elle marque l'élément qui doit
             garder la barre posée avec `data-aj-tete-seuil`, et la barre tient
             jusqu'à ce que cet élément soit passé. L'accueil s'en sert pour son
             premier écran : le grand logo y vient atterrir dans la barre au
             défilement, et il ne peut pas se poser sur une barre qui vient de
             partir. Se dérober au-dessus du premier écran n'apporte de toute
             façon rien — il n'y a rien à découvrir au-dessus.

             Mesuré au montage puis à chaque rafraîchissement, jamais dans
             `onUpdate` : lire une hauteur à chaque cran de défilement forcerait
             un calcul de mise en page par image. */
          let seuil = 140;
          const mesurerSeuil = () => {
            const ancrage = document.querySelector("[data-aj-tete-seuil]");
            seuil =
              ancrage instanceof HTMLElement
                ? Math.max(140, ancrage.offsetHeight)
                : 140;
          };
          mesurerSeuil();
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
            onRefresh: mesurerSeuil,
            onUpdate: (self) => {
              const y = self.scroll();
              tete.classList.toggle(styles.headerPose, y > 8);
              if (!anime) return;
              if (y <= seuil) {
                montrer();
                return;
              }
              if (self.direction === 1) cacher();
              else montrer();
            },
          });

          /* ── LE MENU S'OUVRE, IL N'APPARAÎT PLUS ────────────────────
             Le panneau passait de `display: none` à `display: block` : zéro
             image de transition sur le seul geste de navigation du téléphone.

             La partition, dans l'ordre où l'œil la lit :
               • le panneau descend de 14 px et se révèle — c'est la surface
                 qui arrive, pas les liens ;
               • chaque cible monte derrière son propre masque, décalée de
                 45 ms : la liste s'écrit de haut en bas, elle ne s'allume pas
                 d'un bloc ;
               • le filet du panneau se déploie depuis le bord d'attaque.
             `expo.out` partout : sortie longue, arrivée sans rebond, la même
             courbe que le premier écran.

             `autoAlpha` et non `opacity` : GSAP y ajoute `visibility`, donc un
             lien fermé n'est jamais focalisable au clavier. C'est ce qui
             autorise à retirer le `display: none` sans ouvrir un piège de
             tabulation.

             La timeline est construite en PAUSE et pilotée par un effet : la
             rejouer à l'endroit ou à l'envers suffit, et le retour arrière est
             exactement le trajet aller inversé. */
          if (etroit) {
            const panneau = tete.querySelector<HTMLElement>(
              `.${styles.menuPanneau}`,
            );
            if (panneau && anime) {
              const cibles = panneau.querySelectorAll<HTMLElement>(
                "a, select, label",
              );
              const partition = gsap
                .timeline({ paused: true })
                .fromTo(
                  panneau,
                  { autoAlpha: 0, y: -14 },
                  { autoAlpha: 1, y: 0, duration: 0.44, ease: "expo.out" },
                  0,
                )
                .fromTo(
                  cibles,
                  { autoAlpha: 0, y: 18 },
                  {
                    autoAlpha: 1,
                    y: 0,
                    duration: 0.52,
                    ease: "expo.out",
                    stagger: 0.045,
                  },
                  0.08,
                );
              ouvertureMenu.current = partition;
              // La visibilité appartient désormais à GSAP, pas au CSS.
              tete.dataset.menuAnime = "oui";
            }
          }

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
      data-menu={menuOuvert ? "ouvert" : "ferme"}
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
          /* Point d'accroche du vol du mot-marque : sur l'accueil, le grand
             AJ LUXURY du premier ecran vient se poser ICI au defilement. Le
             hero cherche cet attribut, jamais une classe de module CSS —
             celles-ci sont hachees a la compilation. */
          data-aj-marque="entete"
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

      <button
        type="button"
        className={styles.menuBouton}
        aria-controls={menuId}
        aria-expanded={menuOuvert}
        aria-label={menuOuvert ? t("product.close") : t("nav.mainLabel")}
        onClick={basculerMenu}
      >
        <span className={styles.menuSigne} aria-hidden="true" />
      </button>

      <div className={styles.menuPanneau} id={menuId}>
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
      </div>
    </header>
  );
}
