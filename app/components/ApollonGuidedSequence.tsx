"use client";

/* eslint-disable @next/next/no-img-element -- plaques client-owned, déjà optimisées, aucun runtime d'image nécessaire */

import Link from "next/link";
import { useRef, useState, type CSSProperties } from "react";
import type { TranslationKey } from "../../lib/i18n/dictionaries";
import { useI18n } from "../../lib/i18n/I18nProvider";
import { useAjMotion } from "./useAjMotion";
import styles from "./Accueil.module.css";

/* ==========================================================================
   #plaque — le diptyque Apollon
   --------------------------------------------------------------------------
   Le vêtement seul et le vêtement porté sont deux prises d'un MÊME plateau :
   même mur, même sol de marbre, même lyre, même laurier, même arc. Vérifié à
   l'image : dans les deux prises la lyre occupe ~28,5 % de la hauteur du
   cadre et l'horizon marbre/mur tombe à ~71 %. Les deux plateaux sont donc
   déjà à la même échelle de caméra — il suffit de les rendre à la même
   HAUTEUR pour que la lyre partagée ait la même taille de part et d'autre du
   raccord. C'est pour ça que le duo est fait de deux boîtes rigoureusement
   identiques avec `object-fit: contain` : l'échelle commune est structurelle,
   pas calculée, donc rien ne peut la désynchroniser.

   Le volet entre les deux prises se fait par transforms contra-rotatifs : la
   fenêtre (overflow: hidden) glisse d'un côté, son contenu glisse de l'autre
   de la même quantité. Le plan porté ne bouge donc PAS pendant l'ouverture —
   il reste ancré à son plateau. Ni clip-path ni left/right : sur une couche
   1731x2600, l'un relayoute et l'autre repeint à chaque frame.

   ── Sur le bug de la passe précédente ──────────────────────────────────────
   L'ancienne version animait `--aj-wipe`, une propriété enregistrée par
   @property avec syntax "<percentage>". La cause racine annoncée — « GSAP
   n'interpole pas une @property <percentage> » — est FAUSSE, mesurée sur banc
   avec le GSAP 3.15 du dépôt : la valeur descend bien 100 % → 98,99 % →
   38,31 % → 35,33 % → 34 %. CSSPlugin.js:1385 route toute propriété `--*`
   vers _addComplexStringPropTween avec pt.fp posé et style.setProperty comme
   setter ; les pourcentages s'interpolent.

   Ce qui ne marchait pas, c'est la chorégraphie :
     • --aj-wipe n'apparaissait QUE dans les vars « from » du fromTo, jamais
       dans les vars « to » — donc l'acte 1 ne l'animait pas, il la posait ;
     • l'acte 2 partait à 24 % de la timeline avec un ease power2.inOut, donc
       quasi plat à son entrée : sur les 31 premiers pour cent du scroll
       épinglé, le volet bougeait d'UN point (100 % → 98,99 %) ;
     • l'acte 3 occupait le dernier tiers du scroll pour un trajet de quatre
       points (38 % → 34 %) : visuellement figé ;
     • `scrub: 1` ajoutait jusqu'à une seconde de retard sur la valeur lue.
   Bref : 62 des 66 points de course tenaient dans ~25 % du scroll, le reste
   était mort. C'est ce qu'on lisait comme « figé à 100 % ».

   Le correctif ne rapièce pas ça : il supprime la classe de bug. Plus aucune
   propriété personnalisée n'est animée. Un objet proxy est piloté par le
   scroll et son onUpdate écrit directement deux `transform`. Course linéaire,
   1:1 avec le scroll, compositeur pur. Vérifié sur banc : 100 → 97,7 → 69,3
   → 40,9 → 12,5 → 0, sans plat.
   ========================================================================== */

type Plateau = {
  cle: string;
  numero: string;
  nomKey: TranslationKey;
  still: string;
  worn: string;
  mur: string;
  voile: string;
  /** Copie validée par le client, reprise de la maquette. */
  phrase: string;
};

const PLATEAUX: readonly Plateau[] = [
  {
    cle: "rose",
    numero: "01",
    nomKey: "sequence.color.rose",
    still: "/images/editorial/isabelle-apollon/apollon-rose-lyre-v1.webp",
    worn: "/images/client/apollon-world/apollon-rose-model-world-v1.webp",
    mur: "var(--aj-mur-rose)",
    voile: "var(--aj-voile-rose)",
    phrase:
      "Une pièce qui réinvente le sous-vêtement masculin avec subtilité et sophistication.",
  },
  {
    cle: "lilas",
    numero: "02",
    nomKey: "sequence.color.lilac",
    still: "/images/editorial/isabelle-apollon/apollon-lilas-lyre-v1.webp",
    worn: "/images/client/apollon-world/apollon-lilas-model-world-v1.webp",
    mur: "var(--aj-mur-lilas)",
    voile: "var(--aj-voile-lilas)",
    phrase:
      "Un boxer masculin où la douceur rencontre l’élégance contemporaine.",
  },
  {
    cle: "pourpre",
    numero: "03",
    nomKey: "sequence.color.purple",
    still: "/images/editorial/isabelle-apollon/apollon-pourpre-lyre-v1.webp",
    worn: "/images/client/apollon-world/apollon-pourpre-model-world-v1.webp",
    mur: "var(--aj-mur-pourpre)",
    voile: "var(--aj-voile-pourpre)",
    phrase:
      "Pensé pour ceux qui recherchent l’alliance parfaite entre élégance, confort et raffinement.",
  },
];

/** Les trois mots du récit. Pas de clé de dictionnaire disponible pour eux. */
const ETATS = ["Seul", "Se dévoile", "Porté"] as const;

export type ColorisPlaque = {
  slug: string;
  /** « Doux et raffiné », etc. — source unique : lib/products. */
  tagline: string;
  prix: string;
};

type Props = {
  /** Dans l'ordre de la maquette : rose, lilas, pourpre. */
  coloris: readonly ColorisPlaque[];
};

const borne = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lisse = (t: number) => t * t * (3 - 2 * t);

export default function ApollonGuidedSequence({ coloris }: Props) {
  const { t, locale } = useI18n();
  const [actif, setActif] = useState(0);
  const [etat, setEtat] = useState<string>(ETATS[0]);
  const scene = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const live = useRef<HTMLParagraphElement>(null);
  const amplitude = useRef<() => number>(() => 1);

  const racine = useAjMotion<HTMLElement>(({ gsap, racine: section, mm }) => {
    // Une seule branche, et c'est un choix, pas un oubli. Le mobile n'est pas
    // une amputation : mêmes trois panneaux, même rail horizontal, même volet.
    // Ce qui change relève de la mise en page — copie au-dessus des prises,
    // section plus courte, boîtes dimensionnées sur la largeur plutôt que sur
    // la hauteur — et vit dans les @media du module. Le raccord entre les deux
    // prises reste vertical dans les deux régimes, donc le volet balaie
    // horizontalement dans les deux : `piloter` n'a aucune raison de savoir
    // quelle largeur fait l'écran. Une branche JS de plus serait un mensonge.
    mm.add(
      { anime: "(prefers-reduced-motion: no-preference)" },
      (contexte) => {
        const { anime } = contexte.conditions as { anime: boolean };
        // Mouvement réduit : le CSS déplie déjà le rail en trois panneaux
        // empilés, volets ouverts. Il n'y a rien à piloter, et surtout rien
        // à masquer.
        if (!anime) return;

        const railNoeud = rail.current;
        const sceneNoeud = scene.current;
        if (!railNoeud || !sceneNoeud) return;

        const panneaux = gsap.utils.toArray<HTMLElement>(`.${styles.panneau}`);
        const fenetres = gsap.utils.toArray<HTMLElement>(`.${styles.fenetre}`);
        const contenus = gsap.utils.toArray<HTMLElement>(`.${styles.fenetreContenu}`);
        const murs = [
          sceneNoeud.querySelector<HTMLElement>(`.${styles.murLilas}`),
          sceneNoeud.querySelector<HTMLElement>(`.${styles.murPourpre}`),
        ];
        const remplie = sceneNoeud.querySelector<HTMLElement>(`.${styles.pisteRemplie}`);
        const n = panneaux.length;
        if (!n) return;

        // Les murs par panneau ne servent que de repli sans JS. À partir
        // d'ici ce sont les trois calques croisés en opacity qui portent la
        // couleur, donc les panneaux s'effacent. gsap.matchMedia rétablit
        // cette valeur au démontage.
        gsap.set(panneaux, { backgroundColor: "transparent" });

        // Le seul nombre piloté par le scroll. Tout le reste en dérive.
        const curseur = { p: 0 };
        let vu = -1;
        let motVu = "";

        const piloter = (p: number) => {
          // Le domaine part de −1, pas de 0 : sans cette course d'entrée, le
          // premier panneau serait déjà « porté » avant le moindre scroll et
          // ne se dévoilerait jamais. Le rail, lui, reste borné à [0, n−1].
          const xr = borne(p, 0, 1) * n - 1;
          const x = borne(xr, 0, n - 1);

          railNoeud.style.transform = `translate3d(${(-x * (100 / n)).toFixed(4)}%,0,0)`;

          // Les murs se croisent en opacité — jamais une couleur recalculée
          // et repeinte plein écran à chaque frame.
          if (murs[0]) murs[0].style.opacity = lisse(borne(x, 0, 1)).toFixed(4);
          if (murs[1]) murs[1].style.opacity = lisse(borne(x - 1, 0, 1)).toFixed(4);

          // Le volet de chaque panneau s'ouvre pendant que le rail s'approche
          // de lui : à l'arrêt, le panneau est « porté ».
          for (let i = 0; i < n; i += 1) {
            const ouverture = lisse(borne(xr - i + 1, 0, 1));
            // v : ce qu'il reste à ouvrir, en pourcentage de la boîte. La
            // fenêtre part de −v, le contenu de +v — même quantité, signes
            // opposés, donc l'image reste immobile pendant que le volet passe.
            const v = (1 - ouverture) * 100;
            const negatif = (-v).toFixed(3);
            const positif = v.toFixed(3);
            const fenetre = fenetres[i];
            const contenu = contenus[i];
            if (fenetre) fenetre.style.transform = `translate3d(${negatif}%,0,0)`;
            if (contenu) contenu.style.transform = `translate3d(${positif}%,0,0)`;
          }

          if (remplie) {
            remplie.style.transform = `scaleX(${borne(p, 0, 1).toFixed(4)})`;
          }

          const index = Math.round(x);
          if (index !== vu) {
            vu = index;
            setActif(index);
          }

          const local = borne(xr - index + 1, 0, 1);
          const mot = local < 0.12 ? ETATS[0] : local < 0.88 ? ETATS[1] : ETATS[2];
          if (mot !== motVu) {
            motVu = mot;
            setEtat(mot);
          }
        };

        amplitude.current = () =>
          Math.max(1, section.offsetHeight - window.innerHeight);

        // scrub: true — 1:1 avec le scroll, sans lissage. Un scrub numérique
        // ferait traîner le rail derrière la fenêtre collante et laisserait
        // voir la gouttière du panneau voisin.
        gsap.to(curseur, {
          p: 1,
          ease: "none",
          scrollTrigger: {
            trigger: section,
            start: "top top",
            end: "bottom bottom",
            scrub: true,
            invalidateOnRefresh: true,
            fastScrollEnd: 2500,
            onRefresh: (self) => piloter(self.progress),
          },
          onUpdate: () => piloter(curseur.p),
        });

        // Ces transforms sont écrites en style inline, à la main : elles
        // n'appartiennent pas à GSAP, donc gsap.context() ne les défera pas.
        // Si la branche cesse de correspondre — bascule vers « mouvement
        // réduit », changement de point de rupture, démontage — il faut les
        // rendre nous-mêmes, sans quoi le rail resterait décalé et le volet
        // fermé sur un panneau que plus personne ne pilote.
        return () => {
          railNoeud.style.transform = "";
          fenetres.forEach((noeud) => {
            noeud.style.transform = "";
          });
          contenus.forEach((noeud) => {
            noeud.style.transform = "";
          });
          murs.forEach((noeud) => {
            if (noeud) noeud.style.opacity = "";
          });
          if (remplie) remplie.style.transform = "";
        };
      },
    );
  });

  // Les onglets déplacent le scroll : ils ne prennent jamais la main sur lui.
  const viser = (index: number) => {
    const section = racine.current;
    if (!section) return;
    const nom = t(PLATEAUX[index].nomKey);
    if (live.current) live.current.textContent = nom;
    const haut =
      section.offsetTop +
      ((index + 1) / PLATEAUX.length) * amplitude.current();
    window.scrollTo({ top: haut, behavior: "auto" });
    setActif(index);
  };

  // Les trois mots du récit et les phrases de la maquette n'ont pas de clé de
  // dictionnaire : ils restent en français quelle que soit la langue de
  // l'interface. On le déclare au lecteur d'écran plutôt que de le taire.
  const enFrancais = locale === "fr" ? undefined : "fr";

  return (
    <section
      ref={racine}
      className={styles.plaque}
      id="plaque"
      aria-labelledby="aj-plaque-titre"
    >
      <h2 className="aj-sr-only" id="aj-plaque-titre">
        {t("home.incarnationTitle")}
      </h2>

      <div ref={scene} className={styles.plaqueScene}>
        <span className={`${styles.mur} ${styles.murRose}`} aria-hidden="true" />
        <span className={`${styles.mur} ${styles.murLilas}`} aria-hidden="true" />
        <span className={`${styles.mur} ${styles.murPourpre}`} aria-hidden="true" />

        <div ref={rail} className={styles.rail}>
          {PLATEAUX.map((plateau, index) => {
            const commerce = coloris[index];
            const nom = t(plateau.nomKey);
            return (
              <article
                className={styles.panneau}
                key={plateau.cle}
                style={
                  {
                    "--mur": plateau.mur,
                    "--voile": plateau.voile,
                  } as CSSProperties
                }
              >
                <div className={styles.panneauCopie}>
                  <h3 className={`aj-metal aj-display ${styles.panneauTitre}`}>
                    {nom}
                  </h3>
                  <p className={styles.panneauTexte} lang={enFrancais}>
                    {plateau.phrase}
                  </p>
                  <p className={styles.panneauPrix}>
                    {commerce.tagline} · {commerce.prix}
                  </p>
                  <Link
                    className={styles.panneauLien}
                    href={`/products/${commerce.slug}`}
                  >
                    <span>{t("shop.discover")}</span>
                    <span aria-hidden="true">↗</span>
                  </Link>
                </div>

                <div className={styles.duo}>
                  {/* Prise 1 — le vêtement seul, sur le plateau. */}
                  <div className={styles.demi}>
                    <img
                      className={styles.prise}
                      src={plateau.still}
                      alt={t("sequence.stillAlt").replace("{color}", nom)}
                      width={1024}
                      height={1536}
                      loading={index === 0 ? "eager" : "lazy"}
                      fetchPriority={index === 0 ? "high" : "low"}
                      decoding="async"
                    />
                  </div>

                  {/* Prise 2 — le même plateau, porté. Boîte identique, donc
                      échelle identique : la lyre ne change pas de taille. */}
                  <div className={styles.demi}>
                    <div className={styles.fenetre}>
                      <div className={styles.fenetreContenu}>
                        <img
                          className={styles.prise}
                          src={plateau.worn}
                          alt={t("sequence.bodyAlt").replace("{color}", nom)}
                          width={1731}
                          height={2600}
                          loading={index === 0 ? "eager" : "lazy"}
                          fetchPriority={index === 0 ? "high" : "low"}
                          decoding="async"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Des raccourcis de position, pas des onglets : il n'y a pas trois
            panneaux à afficher tour à tour, il y a un scroll à viser. Le motif
            ARIA tablist promettrait des tabpanels qui n'existent pas. */}
        <div className={styles.plaqueBarre}>
          <div className={styles.onglets} role="group" aria-label={t("sequence.tablist")}>
            {PLATEAUX.map((plateau, index) => (
              <button
                type="button"
                aria-label={t(plateau.nomKey)}
                aria-current={index === actif ? "true" : undefined}
                className={`${styles.onglet}${index === actif ? ` ${styles.ongletActif}` : ""}`}
                key={plateau.cle}
                onClick={() => viser(index)}
              >
                {plateau.numero}
              </button>
            ))}
          </div>
          <span className={styles.etat} lang={enFrancais}>
            {etat}
          </span>
        </div>

        <div className={styles.piste} aria-hidden="true">
          <span className={styles.pisteRemplie} />
        </div>

        <p ref={live} className="aj-sr-only" aria-live="polite" aria-atomic="true" />
      </div>
    </section>
  );
}
