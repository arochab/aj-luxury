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
   Le vêtement seul et le vêtement porté sont deux prises du même plateau, et
   le duo les rend à la même ÉCHELLE : deux boîtes rigoureusement identiques
   en `object-fit: contain`, alimentées par deux fichiers de rapport quasi
   égal (1024/1536 = 0,6667 et 1731/2600 = 0,6658, 0,13 % d'écart). Cette
   égalité-là est structurelle : rien en JS ne peut la désynchroniser.

   ── L'HORIZON DU DIPTYQUE, MESURÉ ─────────────────────────────────
   Deux passes se sont contredites ici. La première annonçait un horizon à
   ~71 % partout ; la deuxième a déclaré le pourpre faux — « horizon à 69 % à
   gauche et 87 % à droite, la lyre de droite au double » — et a basculé sa
   prise portée sur `-model-color`. La mesure a été REFAITE en PIL sur les
   vrais fichiers : deux boîtes 473x711 en `object-fit: contain`, bande de
   détection 34 px, exactement ce que rend le CSS. Résultat :
     • POURPRE — 69,2 % au bord DROIT du « seul » (contraste 117), 69,3 % au
                bord GAUCHE du porté (contraste 135). Rupture à la couture :
                0,1 POINT. C'est la couture la plus juste des trois plateaux,
                et l'arête la plus franche du site.
     • ROSE et LILAS — contrastes 27 à 64, ruptures de 10,4 et 12,9 points.
   Le « 86,8 % » invoqué contre le pourpre n'était pas un décalage d'horizon :
   c'est une SECONDE arête, présente à l'identique dans les deux prises
   (86,2 % dans le « seul », 86,8 % dans le porté) — l'arc et le carquois
   posés sur le marbre. Et la « lyre au double » n'existe pas : même diamètre
   de tube, même laurier. Les trois plateaux sont trois prises du même décor.

   ── POURQUOI `-model-world` ET PAS `-model-color` ──────────────────
   La bascule vers `-model-color` a coûté le sol. Luminance moyenne du tiers
   bas — le socle de marbre qui fait tenir la série : 149,5 pour le « seul »,
   97,4 pour `-world`, 42,9 pour `-color`. Des trois variantes `-color` du
   dépôt, celle du pourpre est la SEULE sans aucun sol (42,9 contre 107,1
   rose et 81,1 lilas). Sur le panneau 03, le dernier avant #coloris, l'homme
   y flottait sur un aplat pourpre et le marbre s'arrêtait net à la couture.
   Le pourpre porté est donc revenu à `-model-world`. Aucun actif nouveau.

   ── LA GOUTTIÈRE ────────────────────────────────────────────
   Le duo assume DEUX CADRES plutôt qu'un panorama : une gouttière les sépare
   (`--duo-gouttiere`), le filet blanc qui soulignait la couture est
   supprimé. Ce choix tient toujours, mais pour sa vraie raison : les
   accessoires se répètent d'une prise à l'autre, et deux prises d'une même
   série se lisent mieux côte à côte que soudées. Ce n'est PAS un pansement
   sur un horizon cassé — l'horizon du pourpre est juste à 0,1 point.

   Le volet entre les deux prises se fait par transforms contra-rotatifs : la
   fenêtre glisse d'un côté, son contenu glisse de l'autre de la même
   quantité. Le plan porté ne bouge donc pas RELATIVEMENT À SON CADRE pendant
   l'ouverture — il reste ancré à son plateau. Ni clip-path ni left/right :
   sur une couche 1731x2600, l'un relayoute et l'autre repeint à chaque frame.

   Le cadre, lui, se recentre : voir `recentrage` plus bas.

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
    /* `-model-world-v1`, et surtout pas `-model-color-v1`. Mesuré en PIL sur
       les vrais fichiers, deux boîtes 473x711 en `contain`, bande de
       détection 34px — exactement ce que rend le CSS : horizon marbre/mur à
       69,2 % au bord DROIT du « seul » et à 69,3 % au bord GAUCHE du porté.
       0,1 point de rupture à la couture : c'est la couture la plus juste des
       trois plateaux. La variante `-color` n'a AUCUN sol (luminance moyenne
       du tiers bas : 42,9, contre 97,4 pour `-world` et 149,5 pour le
       « seul ») — l'homme y flotte sur un aplat et le marbre s'arrête net à
       la couture. */
    worn: "/images/client/apollon-world/apollon-pourpre-model-world-v1.webp",
    mur: "var(--aj-mur-pourpre)",
    voile: "var(--aj-voile-pourpre)",
    phrase:
      "Pensé pour ceux qui recherchent l’alliance parfaite entre élégance, confort et raffinement.",
  },
];

/** Les trois mots du récit. Pas de clé de dictionnaire disponible pour eux. */
const ETATS = ["Seul", "Se dévoile", "Porté"] as const;

/* ==========================================================================
   La partition
   --------------------------------------------------------------------------
   Le découpage précédent était un seul curseur linéaire : `p * 3 − 1`, borné.
   Conséquences mesurées sur les 320svh de scroll épinglé (420svh de section
   moins les 100svh de la scène collante) :
     • le premier tiers, soit 106svh, laissait le rail RIGOUREUSEMENT immobile
       — c'était la course d'entrée du volet du panneau 1, et rien d'autre ;
     • pour les panneaux 2 et 3, l'ouverture du volet était calée sur le MÊME
       intervalle que le déplacement du rail : le vêtement se dévoilait
       pendant que son panneau glissait vers le cadre. On ne voyait donc
       jamais le plan « Seul » du lilas ni celui du pourpre ;
     • `local`, d'où sortent les trois mots, était calculé contre un index
       obtenu par `Math.round(x)`, donc décalé d'un demi-panneau : le mot
       « Seul » n'apparaissait que pour le premier coloris. Le récit ne se
       jouait qu'une fois sur trois.

   La partition remplace ce curseur par une suite de MESURES nommées. Chaque
   coloris a ses trois temps ; entre deux coloris, un transit pendant lequel
   le rail seul travaille, volets figés. Les durées sont relatives : leur
   somme est ramenée à 1, donc la partition ne dépend pas de la hauteur de la
   section et le point de rupture mobile (380svh) la resserre sans la
   déformer.

   Sur 320svh, ce tableau donne : 17svh de plan « Seul », 50svh de dévoilement,
   17svh de plan « Porté », puis 34svh de transit — trois fois, deux transits.
   3 × 84 + 2 × 34 = 320. Plus une seule hauteur d'écran de rail immobile.
   ========================================================================== */

type NomTemps = "transit" | "seul" | "devoile" | "porte";

const DUREES: Record<NomTemps, number> = {
  transit: 1.1,
  seul: 0.55,
  devoile: 1.6,
  porte: 0.55,
};

type Mesure = {
  readonly panneau: number;
  readonly nom: NomTemps;
  readonly debut: number;
  readonly fin: number;
};

function partition(n: number): readonly Mesure[] {
  const brut: { panneau: number; nom: NomTemps }[] = [];
  for (let i = 0; i < n; i += 1) {
    // Aucun transit avant le premier panneau : il n'y a rien à quitter. C'est
    // très exactement ce qui produisait les 106svh de rail mort en tête.
    if (i > 0) brut.push({ panneau: i, nom: "transit" });
    brut.push({ panneau: i, nom: "seul" });
    brut.push({ panneau: i, nom: "devoile" });
    brut.push({ panneau: i, nom: "porte" });
  }
  const total = brut.reduce((somme, m) => somme + DUREES[m.nom], 0);
  let curseur = 0;
  return brut.map(({ panneau, nom }) => {
    const debut = curseur / total;
    curseur += DUREES[nom];
    return { panneau, nom, debut, fin: curseur / total };
  });
}

const MESURES = partition(PLATEAUX.length);

/** Trouve la mesure en cours. Onze entrées : un balayage suffit, et il évite
    de garder un index en cache que le scroll inversé rendrait faux. */
function mesureA(q: number): Mesure {
  for (let k = MESURES.length - 1; k > 0; k -= 1) {
    if (q >= MESURES[k].debut) return MESURES[k];
  }
  return MESURES[0];
}

/** Où viser pour amener un coloris à son premier temps, scellé. */
const REPERES: readonly number[] = PLATEAUX.map(
  (_, i) => MESURES.find((m) => m.panneau === i && m.nom === "seul")?.debut ?? 0,
);

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

        // Requêtes bornées à la scène, et non au document : `gsap.utils.toArray`
        // ne connaît pas le scope de gsap.context().
        const tous = (classe: string): HTMLElement[] =>
          Array.from(sceneNoeud.querySelectorAll<HTMLElement>(`.${classe}`));

        const panneaux = tous(styles.panneau);
        const fenetres = tous(styles.fenetre);
        const contenus = tous(styles.fenetreContenu);
        // Les deux demi-boîtes de chaque panneau, dans l'ordre du DOM : elles
        // se déplacent ENSEMBLE, c'est la paire qu'on recentre.
        const paires = panneaux.map((panneau) =>
          Array.from(panneau.querySelectorAll<HTMLElement>(`.${styles.demi}`)),
        );
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
          const q = borne(p, 0, 1);
          // Où en est-on dans la partition, et où en est-on DANS la mesure.
          // Toute la scène dérive de ces deux nombres.
          const mesure = mesureA(q);
          const etendue = mesure.fin - mesure.debut;
          const u = etendue > 0 ? borne((q - mesure.debut) / etendue, 0, 1) : 1;

          // Le rail ne bouge QUE pendant un transit. `lisse` annule sa vitesse
          // aux deux bornes : le panneau arrive posé, et le palier commence
          // sur un plan strictement immobile plutôt que sur une décélération.
          const x =
            mesure.nom === "transit" ? mesure.panneau - 1 + lisse(u) : mesure.panneau;
          railNoeud.style.transform = `translate3d(${(-x * (100 / n)).toFixed(4)}%,0,0)`;

          // Les murs se croisent en opacité — jamais une couleur recalculée
          // et repeinte plein écran à chaque frame. `x` est déjà lissé pendant
          // le transit et constant partout ailleurs : inutile de lisser deux
          // fois, la dérivée est déjà nulle aux bornes.
          if (murs[0]) murs[0].style.opacity = borne(x, 0, 1).toFixed(4);
          if (murs[1]) murs[1].style.opacity = borne(x - 1, 0, 1).toFixed(4);

          for (let i = 0; i < n; i += 1) {
            // Un panneau déjà traversé reste ouvert, un panneau à venir reste
            // scellé, et le panneau courant ne s'ouvre que sur son temps
            // « Se dévoile ». Il ARRIVE donc fermé au bout de son transit :
            // c'est là tout le récit, et c'est ce qui manquait aux coloris 2
            // et 3.
            const ouverture =
              i < mesure.panneau
                ? 1
                : i > mesure.panneau
                  ? 0
                  : mesure.nom === "devoile"
                    ? lisse(u)
                    : mesure.nom === "porte"
                      ? 1
                      : 0;

            // v : ce qu'il reste à ouvrir, en pourcentage de la boîte. La
            // fenêtre part de −v, le contenu de +v — même quantité, signes
            // opposés, donc l'image reste immobile DANS SON CADRE pendant que
            // le volet passe.
            const v = (1 - ouverture) * 100;
            const fenetre = fenetres[i];
            const contenu = contenus[i];
            if (fenetre) fenetre.style.transform = `translate3d(${(-v).toFixed(3)}%,0,0)`;
            if (contenu) contenu.style.transform = `translate3d(${v.toFixed(3)}%,0,0)`;

            // Le recentrage du cadre. Volet fermé, la moitié droite du duo
            // n'affiche rien : le cadre tenu le plus longtemps du site était à
            // moitié vide, et la prise « seul » collée à gauche de sa colonne.
            // On décale donc la PAIRE vers la droite de la moitié d'une boîte
            // plus la moitié de la gouttière — ce qui centre exactement la
            // seule prise visible — et cette compensation fond à zéro au
            // rythme du volet. Le diptyque s'élargit depuis un cadre
            // équilibré au lieu de se remplir dans un cadre troué.
            //   Les 50 % sont un pourcentage de la demi-boîte elle-même :
            // aucune mesure, aucune valeur en cache, donc rien à réinvalider
            // au redimensionnement ni quand la hauteur dynamique du viewport
            // bouge sans qu'un refresh soit déclenché.
            const recentrage = `translate3d(calc((50% + var(--duo-gouttiere) / 2) * ${(
              1 - ouverture
            ).toFixed(4)}),0,0)`;
            const paire = paires[i];
            if (paire) for (const boite of paire) boite.style.transform = recentrage;
          }

          if (remplie) {
            remplie.style.transform = `scaleX(${q.toFixed(4)})`;
          }

          // La bascule d'indicateur se fait au MILIEU du transit : le numéro
          // change quand le nouveau panneau prend le cadre, pas quand
          // l'ancien commence à sortir.
          const bascule = mesure.nom === "transit" && u < 0.5;
          const index = bascule ? mesure.panneau - 1 : mesure.panneau;
          if (index !== vu) {
            vu = index;
            setActif(index);
          }

          // Les trois mots sont désormais LUS dans la partition, plus déduits
          // d'un reste de division. Pendant un transit, on quitte un plan
          // porté pour en aborder un scellé : « Porté » puis « Seul ».
          const mot =
            mesure.nom === "seul"
              ? ETATS[0]
              : mesure.nom === "devoile"
                ? ETATS[1]
                : mesure.nom === "porte"
                  ? ETATS[2]
                  : bascule
                    ? ETATS[2]
                    : ETATS[0];
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
          paires.forEach((paire) => {
            paire.forEach((boite) => {
              boite.style.transform = "";
            });
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
  // La cible est le début du temps « Seul » du coloris visé — on arrive donc
  // sur la plaque scellée, et c'est le scroll qui la dévoile. Le repère sort
  // de la partition : la barre et le récit ne peuvent pas diverger.
  const viser = (index: number) => {
    const section = racine.current;
    if (!section) return;
    const nom = t(PLATEAUX[index].nomKey);
    if (live.current) live.current.textContent = nom;
    const haut = section.offsetTop + REPERES[index] * amplitude.current();
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
      /* Le fond de la SECTION suit le coloris courant. `.plaqueScene` fait
         100svh : dès que le viewport réel dépasse le « small viewport » —
         mobile dont la barre d'URL se rétracte — une bande de section se
         découvre sous la scène, et elle restait rose sous un mur pourpre.
         Ce n'est pas une couleur animée : elle change avec `actif`, donc
         deux fois par traversée, jamais par frame. */
      style={{ "--mur-courant": PLATEAUX[actif].mur } as CSSProperties}
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
