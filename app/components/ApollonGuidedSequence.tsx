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
   Banc et protocole : `_design-reference/mesure-horizon.py`. Toute mesure
   d'horizon citée ici en sort, et rien d'autre ne fait autorité.

   LE PROTOCOLE — écrit une fois, parce que trois passes successives ont
   produit trois échelles de contraste incomparables faute de l'avoir écrit :
     • BOÎTE — chaque prise rendue en 473x711 px, `object-fit: contain`,
       exactement ce que rendent `.demi` / `.prise` à 1440x900 ;
     • BANDE — 34 px de large, adjacente à la couture : les colonnes de DROITE
       du « seul », celles de GAUCHE du porté. Le centre des cadres, occupé
       par le vêtement ou par le corps, ne dit rien du décor ;
     • LISSAGE — profil de luminance BT.601 ligne à ligne, moyenne glissante
       sur 5 lignes ; sans elle le grain du marbre domine ;
     • HORIZON — UNE arête et une seule : la ligne mur / sol de marbre. Prise
       comme la première ligne sous 60 % où le profil franchit vers le haut le
       seuil à mi-chemin entre la médiane MUR (50-64 %) et la médiane SOL
       (88-97 %), et s'y maintient 12 lignes ;
     • CONTRASTE — l'écart SOL − MUR en niveaux de luminance 0-255. Un ÉCART
       DE PLAGES, jamais une pente. C'est précisément cette ambiguïté qui a
       fait diverger les passes : un « contraste 117 » y désignait une pente
       lissée, un « contraste 27 » un écart, et on les comparait ;
     • RUPTURE — l'écart en POINTS entre les deux horizons. Seuil : 2 points.

   RÉSULTAT — les trois ruptures passent le seuil de 2 points, mais elles ne
   le passent PAS de la même manière, et l'écrire uniformément serait refaire
   l'erreur que ce protocole existe pour arrêter :
     • pourpre — FRANC. 69,3 % au bord droit du « seul » contre 69,3 % au bord
       gauche du porté → 0,0 point, sur des contrastes de 139,9 et 146,3. Le
       mur et le sol sont séparés par plus de cent niveaux de luminance :
       l'arête est franche, le seuil à mi-hauteur ne peut se tromper de ligne,
       et la marge au seuil est entière.
     • rose — JUSTE, MAIS À CONTRASTE FAIBLE. 69,1 % contre 68,9 % → 0,1 point,
       donc la meilleure rupture après le pourpre — sur des contrastes de 32,1
       et 33,1 seulement. L'en-tête du banc pose qu'un contraste sous 30
       signale une position d'horizon moins sûre : le rose est à deux niveaux
       de ce plancher. La rupture est bonne, la CONFIANCE dans les deux
       positions qui la composent l'est moins. C'est le plateau à re-mesurer
       en premier si les fichiers changent.
     • lilas — DANS LE SEUIL, SANS MARGE. 71,9 % contre 70,0 % → 1,8 point sur
       une tolérance de 2,0, soit 91 % du budget consommé au chiffre exact du banc. Contrastes 36,8 et
       50,3 : la détection est sûre, c'est l'écart lui-même qui est grand. Un
       recadrage de deux dixièmes de point sur l'une des deux prises le fait
       passer HORS SEUIL.
   Aucun de ces trois cas n'appelle un correctif aujourd'hui (voir PAS DE CALE
   VERTICALE), mais seul le pourpre autorise à ne plus y penser.

   CE QUE MESURE UN DÉTECTEUR NAÏF. Le critère « ligne de gradient maximal »
   annonce 10,4 points de rupture sur le rose et 12,9 sur le lilas. Ces
   ruptures n'existent pas, et `--pics` le montre en une commande : il retient
   83,0 % du côté « seul » du rose, qui est le CARQUOIS doré posé sur le
   marbre (pente 11,1), quand l'horizon mur/sol est à 69,1 % avec une pente de
   5 à 7 seulement. Sur le lilas il retient 81,0 % du côté porté — encore le
   carquois. Les accessoires sont les objets les plus contrastés du décor et
   ils ne sont PAS à la même place d'une prise à l'autre : les mesurer
   fabrique une rupture. C'est la même erreur qui avait fait condamner le
   pourpre (« 87 % à droite ») — l'arc et le carquois, présents à l'identique
   dans les deux prises. Et la « lyre au double » n'existe pas : même diamètre
   de tube, même laurier. Les trois plateaux sont trois prises du même décor,
   et ça se mesure.

   ── PAS DE CALE VERTICALE ─────────────────────────────────────────
   Une cale par plateau sur la demi-boîte portée, en
   `object-position: center calc(50% + var(--aj-cale-porte))`, a été
   envisagée. Elle n'est pas écrite, pour deux raisons cumulatives :
     • elle n'a rien à corriger — poser +10,4 % sur le rose CRÉERAIT la
       rupture de dix points qu'elle prétendait annuler ;
     • elle serait inerte de toute façon. En `contain`, les deux fichiers sont
       contraints en LARGEUR : le jeu vertical total vaut 1,5 px pour le
       « seul » et 0,6 px pour le porté, sur 711. `object-position` en
       pourcentage ne répartit que ce jeu-là — sa course complète de 0 % à
       100 % déplace le cadrage de 0,2 % de la hauteur de boîte, et une
       consigne de 10,4 % se sature à 0,06 px.
   Si un plateau dérivait un jour pour de bon, le levier serait un
   `transform: translateY()` sur `.prise`, au prix d'un rognage du marbre en
   bas et d'une lisière de mur nu en haut. Le paramètre `cale` du banc simule
   ce levier, rognage compris, pour qu'on en voie le coût avant de l'écrire.

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
    worn: "/images/client/apollon-world/apollon-rose-model-color-v2.webp",
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
    worn: "/images/client/apollon-world/apollon-lilas-model-color-v2.webp",
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
    /* Même traitement que les portraits Lilas et Rose : Alex vient du master
       client, reste à ses coordonnées d'origine et seul le mur devient
       pourpre. La v4 reprend le portrait solo de la boutique et n'applique
       aucune coupe verticale. */
    worn: "/images/client/apollon-world/apollon-pourpre-model-color-v4.webp",
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
   section et le régime mobile, qui ramène l'unité à 0,6 écran, la resserre
   sans la déformer.

   ── LES DURÉES SONT DÉSORMAIS DES ÉCRANS ──────────────────────────
   Le jeu précédent — transit 1,1 / seul 0,55 / dévoile 1,6 / porté 0,55, somme
   10,3, étalé sur les 320svh de course de la section — donnait une unité de
   31svh. Le PALIER PORTÉ, c'est-à-dire le seul moment où la composition est
   entière et immobile, tenait donc 17svh : un sixième d'écran. Le lecteur
   traversait la révélation sans jamais s'y arrêter.

   L'étalon fait l'inverse et c'est son trait le plus net : ses sections
   d'observation d'objet durent 4 à 13,25 écrans, et le bloc de copie y reste
   épinglé sur exactement un écran pendant que l'objet travaille. Mesuré le
   20/08 sur oryzo.ai : un plan par écran et demi sur la section « wearable ».

   Les durées ci-dessous sont donc lues EN ÉCRANS, et la hauteur de la section
   en découle : `.plaque` vaut `(1 + somme) × 100svh`, l'écran collant plus la
   course. Une unité = un écran plein. Depuis le 21/08 les durées sont PAR
   COLORIS (voir DUREES_PAR_PLATEAU) : somme 8,3 écrans, donc 930svh, et
   aucun palier porté sous 0,85 écran — la leçon de l'étalon est conservée,
   les strophes ne sont plus identiques.
   ========================================================================== */

type NomTemps = "transit" | "seul" | "devoile" | "porte";

/* ── CHAQUE COLORIS A SES TEMPS PROPRES — 21/08 ────────────────────
   Le jeu précédent donnait 0,5 / 1 / 1 aux trois coloris : trois strophes
   identiques, relevées par le handoff comme un défaut majeur (« 9 écrans sur
   14, même bloc au pixel près »). La partition devient musicale :
     • rose, 01 — l'OUVERTURE. Le rituel est nouveau : le plan scellé tient
       0,75 écran, le dévoilement prend son temps (1,05), le palier 0,9 ;
     • lilas, 02 — la REPRISE. Le lecteur connaît le rituel : entrée brève
       (0,45), dévoilement plus allant (0,75), palier 0,85 ;
     • pourpre, 03 — la CADENCE FINALE. Entrée moyenne (0,5), dévoilement
       soutenu (0,9), et le palier le plus long de la série (1,15) : la
       séquence se referme sur son plan le plus tenu, pas sur un écho.
   Les transits restent égaux : la vitesse du rail est la physique de la
   pièce, pas un trait de caractère des coloris. Somme 8,3 écrans (‑0,2). */
const DUREES_PAR_PLATEAU: readonly Record<
  Exclude<NomTemps, "transit">,
  number
>[] = [
  { seul: 0.75, devoile: 1.05, porte: 0.9 },
  { seul: 0.45, devoile: 0.75, porte: 0.85 },
  { seul: 0.5, devoile: 0.9, porte: 1.15 },
];

const DUREE_TRANSIT = 0.5;

const dureeDe = (panneau: number, nom: NomTemps): number =>
  nom === "transit" ? DUREE_TRANSIT : DUREES_PAR_PLATEAU[panneau][nom];

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
  const total = brut.reduce((somme, m) => somme + dureeDe(m.panneau, m.nom), 0);
  let curseur = 0;
  return brut.map(({ panneau, nom }) => {
    const debut = curseur / total;
    curseur += dureeDe(panneau, nom);
    return { panneau, nom, debut, fin: curseur / total };
  });
}

const MESURES = partition(PLATEAUX.length);

/* La somme brute des durées, en écrans. Elle part en style inline vers
   `--plaque-temps`, d'où Accueil.module.css tire `(1 + somme) × 100svh`.
   Elle est DÉRIVÉE du même tableau que la partition : une durée modifiée
   déplace la hauteur de la section du même geste, et le palier ne peut pas
   se retrouver plus court que ce que la partition annonce. */
const SOMME_TEMPS = MESURES.reduce(
  (somme, m) => somme + dureeDe(m.panneau, m.nom),
  0,
);

/** Trouve la mesure en cours. Onze entrées : un balayage suffit, et il évite
    de garder un index en cache que le scroll inversé rendrait faux. */
function mesureA(q: number): Mesure {
  for (let k = MESURES.length - 1; k > 0; k -= 1) {
    if (q >= MESURES[k].debut) return MESURES[k];
  }
  return MESURES[0];
}

/** Où viser pour amener un coloris à son plan PORTÉ, volet ouvert.
 *
 *  Visait « seul » jusqu'au 19/08, c'est-à-dire la plaque scellée, en laissant
 *  au défilement le soin de la dévoiler. C'est juste pour qui descend la page ;
 *  c'est faux pour qui clique un onglet — et l'onglet est le SEUL chemin
 *  d'accès aux plateaux 02 et 03, les liens des panneaux inactifs étant
 *  `inert`. Mesuré après un clic sur l'onglet 03 à 1920x1080 : la nature morte
 *  occupait x 834..1402 et il restait 503 px de bordeaux plat jusqu'au bord de
 *  la fenêtre, soit 26,4 % de la largeur en aplat vide, le volet étant à
 *  translateX(-568,03 px) — complètement fermé. Il fallait deviner qu'il
 *  fallait continuer à faire défiler pour compléter la composition.
 *
 *  On vise donc le temps où le volet est ouvert et le vêtement porté
 *  visible : la composition est entière à l'arrivée, et la révélation reste
 *  disponible en remontant. Le repère continue de sortir de la partition, donc
 *  la barre et le récit ne peuvent toujours pas diverger.
 *
 *  À 30 % DU PALIER, pas à son seuil — 21/08. Depuis que le texte avance avec
 *  l'image, la ligne commerce et « Découvrir » s'assemblent sur le premier
 *  quart du palier porté. Un saut d'onglet posé à u = 0 arrivait donc sur une
 *  copie amputée de son lien, sans un pixel de scroll pour la compléter. À
 *  30 %, la copie est entière à l'arrivée et 70 % du palier reste à lire. */
const REPERES: readonly number[] = PLATEAUX.map((_, i) => {
  const porte = MESURES.find((m) => m.panneau === i && m.nom === "porte");
  if (!porte) return 0;
  return porte.debut + 0.3 * (porte.fin - porte.debut);
});

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
  // Le rail est-il REPLIÉ en une seule fenêtre ? C'est la seule question qui
  // décide de l'inertie. Sous mouvement réduit le CSS déplie les trois
  // panneaux, tous visibles, tous atteignables : `anime` reste faux et
  // personne ne devient inerte. Cet état est posé par la branche animée de
  // `mm.add` et repris à faux par son nettoyage, donc il suit exactement le
  // régime que GSAP applique, pas une media query lue en double.
  const [anime, setAnime] = useState(false);
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

        // Le rail est replié : deux panneaux sur trois sont hors cadre, et
        // `.plaqueScene` est en `overflow: clip`, donc le navigateur n'a
        // aucun défilement de rattrapage pour ramener un focus qui s'y
        // égarerait. On le déclare au rendu, qui posera `inert`.
        // Après la garde, et pas avant : sur un retour anticipé, `gsap.context`
        // n'enregistre aucun nettoyage, et un `setAnime(true)` posé plus haut
        // laisserait l'état à vrai sans rien pour le redescendre.
        setAnime(true);

        // Requêtes bornées à la scène, et non au document : `gsap.utils.toArray`
        // ne connaît pas le scope de gsap.context().
        const tous = (classe: string): HTMLElement[] =>
          Array.from(sceneNoeud.querySelectorAll<HTMLElement>(`.${classe}`));

        const panneaux = tous(styles.panneau);
        const fenetres = tous(styles.fenetre);
        const contenus = tous(styles.fenetreContenu);
        // La copie progressive : la phrase suit le volet, la ligne commerce
        // et le lien n'arrivent qu'au diptyque complet. Interrogés une fois,
        // pilotés par frame comme le reste.
        const phrases = tous(styles.panneauTexte);
        const commerces = tous(styles.panneauPrix);
        const liens = tous(styles.panneauLien);
        // La carte de copie du téléphone : son voile grandit avec ce qu'elle
        // porte. Voir le réglage de `--aj-copie-remplie` plus bas.
        const cartes = tous(styles.panneauCopie);
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
            //   L'ÉCART LUI-MÊME EST EN CSS, pas ici : `--duo-recentrage`,
            // défini deux fois dans Accueil.module.css, une par régime de mise
            // en page. Écrit en dur ici, il valait `50% + gouttière / 2`, ce
            // qui centre la prise visible SI la paire est centrée — identité
            // (W−2b−g)/2 + b/2 + g/2 = (W−b)/2, vraie pour tout W. La paire
            // ayant été ancrée à droite entre-temps, cet écart ne centrait plus
            // rien : mesuré à 1920x1080 sur le temps « Seul », la prise
            // occupait x 795..1482, centre à 1138 contre 952 pour l'écran, et
            // 795 px d'aplat restaient à sa gauche. Le JS n'écrit donc plus que
            // le FACTEUR ; la géométrie appartient à la feuille de style, seule
            // à savoir où la paire est posée. Le pourcentage reste celui de la
            // demi-boîte : aucune mesure, rien à réinvalider au
            // redimensionnement ni quand la hauteur dynamique du viewport bouge
            // sans qu'un refresh soit déclenché.
            const recentrage = `translate3d(calc(var(--duo-recentrage) * ${(
              1 - ouverture
            ).toFixed(4)}),0,0)`;
            const paire = paires[i];
            if (paire) for (const boite of paire) boite.style.transform = recentrage;

            // ── LE TEXTE AVANCE AVEC L'IMAGE — 21/08 ─────────────────
            // Le bloc de copie était monté entier dès le plan scellé : le
            // même texte au pixel près tenait trois écrans consécutifs. Il
            // se CONSTRUIT désormais au rythme de la partition :
            //   • plan scellé — le nom seul ;
            //   • dévoilement — la phrase monte AVEC le volet : même valeur
            //     `ouverture`, même pilote, 1:1 avec le scroll ;
            //   • dévoilement, seconde partie — la ligne commerce et
            //     « Découvrir » s'assemblent, de sorte que le PALIER TIENNE
            //     UN PANNEAU COMPLET.
            //
            // CE DERNIER POINT EST UN CORRECTIF DU 21/08. La ligne commerce
            // s'assemblait auparavant sur le premier quart du PALIER, donc
            // après le plan scellé ET tout le dévoilement : mesuré au
            // navigateur, le prix et le lien restaient `visibility:hidden`
            // pendant 1 700 px de défilement sur le panneau 01, soit 67 % de
            // sa durée. Le brief d'Adam demande que le visiteur comprenne
            // toujours le produit, le coloris, LE PRIX et le chemin d'achat.
            // Le palier, phase la plus longue et la plus regardée, tenait un
            // panneau encore en train de s'écrire.
            // Remonter la page déconstruit le bloc dans l'ordre inverse.
            // Opacité + translation seulement, et les nœuds restent dans le
            // DOM : rien ne change pour le lecteur d'écran, `inert` continue
            // de gouverner les panneaux hors cadre.
            const commerce =
              i < mesure.panneau
                ? 1
                : i > mesure.panneau
                  ? 0
                  : mesure.nom === "porte"
                    ? 1
                    : mesure.nom === "devoile"
                      ? // Sur les 65 derniers % du dévoilement : le nom reste
                        // seul pendant le plan scellé — c'est le rituel voulu —
                        // puis le commerce monte derrière la phrase et le
                        // panneau est ENTIER quand le palier commence.
                        lisse(borne((u - 0.35) / 0.65, 0, 1))
                      : 0;
            const phrase = phrases[i];
            if (phrase) {
              phrase.style.opacity = ouverture.toFixed(4);
              phrase.style.transform = `translate3d(0,${((1 - ouverture) * 16).toFixed(2)}px,0)`;
            }
            /* ── LE VOILE GRANDIT AVEC LA COPIE — 21/08 ──────────────
               Sur téléphone, la carte de copie est un aplat peint aux
               dimensions de TOUT son contenu, révélé ou non. Mesuré au
               navigateur pendant le plan scellé : 335x242 px de voile pour un
               titre qui s'arrête à 51 px — 190 px de rectangle sombre peint
               sur du vide, soit 79 % de la carte. Un cadre vide, pas une
               composition.

               Le voile est donc un dégradé dont on ne peint que la hauteur
               utile. 34 % couvre le titre en entier — c'est le plancher de
               contraste, il ne descend jamais en dessous — puis la surface
               suit ce que la copie a effectivement révélé. `background-size`
               ne touche pas la mise en page : c'est de la peinture, pas du
               calcul de boîte. Sans effet au-dessus de 900 px, où la carte
               n'a pas de fond et où c'est `::before` qui tient le voile. */
            const carte = cartes[i];
            if (carte) {
              const remplie = 34 + 66 * Math.max(ouverture, commerce);
              carte.style.setProperty(
                "--aj-copie-remplie",
                `${remplie.toFixed(2)}%`,
              );
            }

            for (const noeud of [commerces[i], liens[i]]) {
              if (!noeud) continue;
              noeud.style.opacity = commerce.toFixed(4);
              noeud.style.transform = `translate3d(0,${((1 - commerce) * 12).toFixed(2)}px,0)`;
              // Un lien à opacité nulle resterait focusable et cliquable :
              // `visibility` le retire du focus et du pointeur tant qu'il
              // n'est pas arrivé. WCAG 2.4.7 sur le panneau actif.
              noeud.style.visibility = commerce < 0.05 ? "hidden" : "";
            }
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
          // La copie progressive redevient entière : le régime « mouvement
          // réduit » et le repli sans JS montrent le bloc complet.
          [...phrases, ...commerces, ...liens].forEach((noeud) => {
            noeud.style.opacity = "";
            noeud.style.transform = "";
            noeud.style.visibility = "";
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
          // Le rail n'est plus piloté : plus rien n'est hors cadre par notre
          // fait, donc plus rien ne doit rester inerte.
          setAnime(false);
        };
      },
    );
  });

  // Les onglets déplacent le scroll : ils ne prennent jamais la main sur lui.
  // La cible est le temps « Porté » du coloris visé, volet ouvert — voir
  // REPERES pour la mesure du défaut que cela corrige. Le repère sort de la
  // partition : la barre et le récit ne peuvent pas diverger.
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
         deux fois par traversée, jamais par frame.

         `--plaque-temps` porte la somme des durées de la partition, en
         écrans. C'est le CSS qui en tire la hauteur de la section — voir
         `.plaque` dans Accueil.module.css. La partition et la course ne
         peuvent donc plus diverger. */
      style={
        {
          "--mur-courant": PLATEAUX[actif].mur,
          "--plaque-temps": SOMME_TEMPS,
        } as CSSProperties
      }
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
                /* Hors cadre = hors tabulation. Sans cela le lien « Découvrir »
                   des panneaux 2 et 3 reste dans l'ordre de tabulation alors
                   qu'il est invisible et inatteignable au scroll : WCAG 2.4.7
                   et 2.4.11 échouent sur la pièce maîtresse de l'accueil.
                   `inert` retire le sous-arbre du focus, du pointeur et de
                   l'arbre d'accessibilité d'un seul geste. */
                inert={anime && index !== actif}
                style={
                  {
                    "--mur": plateau.mur,
                    "--voile": plateau.voile,
                  } as CSSProperties
                }
              >
                <div className={styles.panneauCopie}>
                  <h3 className={`aj-display ${styles.panneauTitre}`}>
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
                  {/* MARGES VOISINES SUPPRIMEES — 20/08.
                      Elles faisaient 428x642 dans une scene de 1080 : il
                      restait 438 px de fond nu sous chacune, sur toute la
                      largeur. C'est la « plaque rapportee » relevee par le
                      client. Elles causaient aussi trois coloris affiches en
                      meme temps alors que le texte n'en annonce qu'un, des
                      mannequins tranches a la verticale, et des gouttieres a
                      165 px d'un cote contre 22 de l'autre.
                      Une image, un ecran, pleine hauteur. */}

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
