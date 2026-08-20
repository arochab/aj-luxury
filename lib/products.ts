import { deepFreeze } from "./deep-freeze.ts";

export const sizes = Object.freeze(["S", "M", "L", "XL"] as const);

export type ProductSize = (typeof sizes)[number];

export type ProductMedia = {
  src: string;
  frame: "main" | "portrait" | "landscape";
  objectPosition?: string;
  /* Ratio NATIF de la source, à ne renseigner que lorsqu'il diffère du cadre
     de sa famille. Il n'est appliqué que là où la vignette est seule sur sa
     ligne (sous 560 px, cf. ProductPage.module.css) : ailleurs, la règle
     d'appariement de l'AGENTS impose un cadre commun aux deux vignettes
     d'une même ligne, et c'est le cadre commun qui gagne. */
  sourceRatio?: string;
};

/* ==========================================================================
   QUI PORTE QUOI — retour n°4 d'Adam, 19/08
   --------------------------------------------------------------------------
   « Jamais deux photos du même mannequin à la suite, nulle part », et un
   coloris porté par le même homme partout. Les deux règles se tiennent, mais
   elles ne se déduisent d'aucun nom de fichier : `product-rose-profile.webp`
   montre Jérémy, `product-card-rose.webp` montre Alex, et rien dans les deux
   noms ne le dit. C'est exactement ainsi que la séquence Jérémy / Jérémy /
   Alex s'est installée sur l'accueil ET sur /shop sans être vue.

   L'attribution est donc DÉCLARÉE ici, une fois, d'après le contenu observé
   des images — jamais d'après leur nom — et tout le site la lit.

   L'ARBITRAGE. Les trois plans portés de la séquence guidée
   (apollon-world/*-model-color-v2) sont la seule série tournée d'un coup sur
   les trois coloris, et ce sont les fichiers dont le décor généré vient
   d'être nettoyé. Ils donnent Rose → Alex, Lilas → Jérémy, Pourpre → Alex.
   C'est cette série qui fixe la règle : la contredire obligerait à changer le
   geste central de l'accueil pour des sources non nettoyées.

   CONSÉQUENCE ASSUMÉE. Deux coloris sur trois reviennent à Alex : sur une
   gamme impaire, l'alternance stricte (Alex, Jérémy, Alex) impose ce partage.
   Les photos qui contredisent l'attribution sortent du tunnel commercial —
   product-rose-profile (Jérémy en Rose), product-lilas-model (Alex en Lilas),
   editorial-pourpre-chair (Jérémy en Pourpre) et story-jeremy-retouched
   (Jérémy en Rose) ne sont plus lues par aucune carte, aucune fiche, aucune
   galerie. Elles restent dans le dépôt et, pour la première, dans la bande
   éditoriale de l'accueil, qui est une campagne et non un catalogue. */
export type Wearer = "alex" | "jeremy";

/** Prénom affichable. Un seul endroit, pour qu'aucun alt ne le réécrive. */
export const wearerNames: Readonly<Record<Wearer, string>> = Object.freeze({
  alex: "Alex",
  jeremy: "Jérémy",
});

/* Toutes les photographies du dépôt où un visage est reconnaissable, et qui
   s'y trouve. « duo » signifie les deux dans le même cadre : une image duo ne
   revendique aucune attribution de coloris et rompt toujours l'alternance,
   quel que soit son voisin.
   Renseigné à l'inspection des fichiers, planche-contact du 19/08. */
export const wearerByAsset: Readonly<Record<string, Wearer | "duo">> =
  Object.freeze({
    // Les trois plans portés de la séquence guidée de l'accueil. C'est la
    // série qui FIXE la règle : une seule session, les trois coloris, décor
    // généré nettoyé le 18/08.
    "apollon-world/apollon-rose-model-color-v2.webp": "alex",
    "apollon-world/apollon-lilas-model-color-v2.webp": "jeremy",
    "apollon-world/apollon-pourpre-model-color-v2.webp": "alex",
    // Le film d'ouverture : les deux dans le même plan.
    "hero-v4-desktop-1920x1080-poster.webp": "duo",
    "hero-v4-portrait-720x934-poster.webp": "duo",
    "hero-v4-portrait-480x623-poster.webp": "duo",
    // Rose Velours
    "raw/product-card-rose.webp": "alex",
    "editorial-rose-profile.webp": "alex",
    "raw/product-rose-profile.webp": "jeremy",
    "story-jeremy-retouched.jpeg": "jeremy",
    // Lilas Céleste
    "editorial-lilas-chair.webp": "jeremy",
    "raw/product-lilas-model.webp": "alex",
    "product-lilas-model.webp": "alex",
    // Pourpre Impérial
    "raw/product-card-pourpre.webp": "alex",
    "hero-pourpre-model.webp": "alex",
    "editorial-pourpre-chair.webp": "jeremy",
    // Les deux dans le même cadre
    "campaign-duo-lilas-seated.webp": "duo",
    "campaign-duo-pourpre.webp": "duo",
  });

/** Qui figure sur ce média, ou `null` s'il n'y a pas de visage (détails,
 *  plans de dos serrés, natures mortes). Un `null` ne rompt ni ne satisfait
 *  l'alternance : il n'entre tout simplement pas dans la séquence. */
export function wearerOf(src: string): Wearer | "duo" | null {
  const cle = Object.keys(wearerByAsset).find((suffixe) =>
    src.endsWith(suffixe),
  );
  return cle ? wearerByAsset[cle] : null;
}

/* ==========================================================================
   LES TROIS LIGNES DE COLORIS — retour d'Adam, 20/08
   --------------------------------------------------------------------------
   « Les taglines sont des paires d'adjectifs interchangeables — DOUX ET
   RAFFINÉ, DÉLICAT ET LUMINEUX, PROFOND ET SOPHISTIQUÉ — sans un mot
   d'Apollon. » Le reproche est exact et il est structurel : on pouvait
   permuter les trois lignes entre les trois coloris sans que rien ne sonne
   faux, ce qui est la définition d'une ligne qui ne dit rien.

   LE SYSTÈME QUI LES REMPLACE. Le chapô de la boutique dit déjà « une seule
   pièce, trois lumières ». Apollon est le dieu de la lumière ; chaque coloris
   reçoit donc SON heure, et une seule :
     Rose Velours      l'aube        rose pâle et chaud
     Lilas Céleste     le zénith     bleu-violet froid, la couleur du plein ciel
     Pourpre Impérial  le crépuscule pourpre profond
   Les trois lignes deviennent impermutables : on ne déplace pas une aube sur
   un pourpre. Le mot constant est « Apollon », la variable est l'heure —
   la même mécanique que l'étalon secondaire, qui répète le nom de collection
   sur chacune de ses 16 cartes et ne fait varier que ce qui suit.

   Aucune de ces lignes n'affirme un fait invérifiable : ni client, ni chiffre,
   ni distinction, ni date, ni disponibilité d'un autre modèle. « Apollon »
   reste non traduit dans les cinq langues : c'est un nom de modèle, pas un mot.

   Ces deux champs alimentent la carte de /shop, la fiche produit et la
   séquence guidée de l'accueil. Une seule source, trois écrans.
   ========================================================================== */

export type Product = {
  slug: string;
  modelId: "boxer-aj-luxury";
  model: string;
  name: string;
  color: string;
  tone: string;
  swatch: string;
  /** L'homme qui porte CE coloris, partout où il est porté. */
  wearer: Wearer;
  /* Le plan de carte, et le plan de tête de fiche : c'est le MÊME fichier.
     Une carte qui ouvre sur un autre corps que celui qu'elle montrait était
     le défaut relevé le 19/08 sur le Lilas — carte Jérémy, fiche Alex. */
  image: string;
  /** La nature morte du plateau : marbre, lyre, arc, laurier, carquois.
      Aucun corps, donc aucune question de parité — c'est ce qui permet aux
      deux recommandations de bas de fiche d'exister sur les trois coloris
      alors que deux d'entre eux partagent le même mannequin. */
  still: string;
  gallery: ProductMedia[];
  tagline: string;
  description: string;
  details: string[];
  features: string[];
  priceCents: number;
  status: "launch-product";
  statusLabel: string;
  primaryModel: boolean;
  benefits: Array<{ title: string; text: string }>;
};

const benefits = [
  {
    title: "Toucher doux et soyeux",
    text: "Un toucher doux et soyeux au contact de la peau.",
  },
  {
    title: "Matière respirante et confortable",
    text: "Une grande respirabilité et une sensation de seconde peau.",
  },
  {
    title: "Ceinture premium de 3,5 cm",
    text: "Logo métallique AJ Luxury.",
  },
];

const features = [
  "Coupe boxer classique",
  "Composition : 94 % modal – 6 % élasthanne",
  "Toucher doux et soyeux",
  "Matière respirante et confortable",
  "Ceinture premium de 3,5 cm",
  "Logo métallique AJ Luxury",
  "Maintien optimal au quotidien",
];

/*
 * ORDRE CANONIQUE — rose, lilas, pourpre.
 * C'est l'ordre de la maquette, repris littéralement par ORDRE_COLORIS
 * (app/page.tsx). /shop et /products/[slug] itèrent getProducts() dans
 * l'ordre de déclaration et numérotent 01/02/03 : cette numérotation ne peut
 * coïncider avec celle de l'accueil que si ce tableau porte le même ordre.
 * Ne pas réordonner ici sans réordonner ORDRE_COLORIS, et réciproquement.
 */
export const products: Product[] = deepFreeze([
  {
    slug: "rose-pale",
    modelId: "boxer-aj-luxury",
    model: "Apollon",
    name: "Rose Velours",
    color: "Rose Velours",
    tone: "Apollon à l’aube",
    swatch: "#dda9bd",
    wearer: "alex",
    /* Était `product-rose-profile.webp`, c'est-à-dire JÉRÉMY, alors que le
       Lilas juste après montrait lui aussi Jérémy : la rangée de l'accueil et
       celle de /shop lisaient Jérémy, Jérémy, Alex. `product-card-rose.webp`
       est le même plan de carte, tourné avec Alex, déjà dans le dépôt — et
       accessoirement 13 points de L* plus clair que le profil, ce qui aligne
       enfin l'exposition des trois cartes. */
    image: "/images/client/raw/product-card-rose.webp",
    still: "/images/editorial/isabelle-apollon/apollon-rose-lyre-v1.webp",
    gallery: [
      {
        src: "/images/client/raw/product-card-rose.webp",
        frame: "main",
        objectPosition: "center 30%",
      },
      { src: "/images/client/editorial-rose-profile.webp", frame: "portrait" },
      {
        src: "/images/client/raw/product-rose-front.webp",
        frame: "portrait",
        /* 2000x2571 = 0,7779, contre 0,6658 pour les autres sources. */
        sourceRatio: "2000 / 2571",
      },
      { src: "/images/client/raw/product-rose-detail.webp", frame: "landscape" },
    ],
    tagline: "Apollon à l’aube",
    description:
      "Découvrez Apollon Rose Velours, une pièce qui réinvente le sous-vêtement masculin avec subtilité et sophistication.",
    details: [
      "Conçu en 94 % modal et 6 % élasthanne, ce boxer offre une douceur incomparable, une excellente respirabilité et une élasticité idéale pour accompagner votre silhouette avec confort et élégance.",
      "Sa ceinture élastique de 3,5 cm, ornée du logo métallique AJ Luxury, signe une finition premium et affirme l’identité de la marque.",
      "Son coloris Rose Velours, doux et raffiné, révèle une esthétique moderne et audacieuse pour l’homme qui souhaite associer confort, style et confiance en soi.",
    ],
    features,
    priceCents: 2999,
    status: "launch-product",
    statusLabel: "Modèle Apollon",
    primaryModel: true,
    benefits,
  },
  {
    slug: "lilas-bleu-clair",
    modelId: "boxer-aj-luxury",
    model: "Apollon",
    name: "Lilas Céleste",
    color: "Lilas Céleste",
    tone: "Apollon au zénith",
    swatch: "#a9abd9",
    wearer: "jeremy",
    image: "/images/client/editorial-lilas-chair.webp",
    still: "/images/editorial/isabelle-apollon/apollon-lilas-lyre-v1.webp",
    /* La carte montrait Jérémy et la fiche s'ouvrait sur Alex
       (`product-lilas-model.webp`) : on cliquait sur un homme et on en
       obtenait un autre, sur le même coloris. Le plan de tête est désormais
       le plan de carte, et les deux vignettes qui suivent sont sans visage.
       `product-lilas-front.webp` est retiré : il redit `-detail` de face, et
       trois vignettes dans une grille à deux colonnes laisseraient une
       demi-ligne vide, que l'AGENTS interdit. */
    gallery: [
      {
        src: "/images/client/editorial-lilas-chair.webp",
        frame: "main",
        objectPosition: "center 30%",
      },
      { src: "/images/client/raw/product-lilas-detail.webp", frame: "portrait" },
      { src: "/images/client/raw/product-lilas-back.webp", frame: "portrait" },
    ],
    tagline: "Apollon au zénith",
    description:
      "Découvrez Apollon Lilas Céleste, un boxer masculin où la douceur rencontre l’élégance contemporaine.",
    details: [
      "Fabriqué à partir d’un mélange premium de 94 % modal et 6 % élasthanne, il procure un confort exceptionnel grâce à une matière légère, respirante et agréable au contact de la peau. Sa coupe boxer classique accompagne chaque mouvement tout en offrant un ajustement parfait.",
      "La ceinture de 3,5 cm, sublimée par le logo métallique AJ Luxury, apporte une finition luxueuse et une identité forte à cette création.",
      "Son coloris Lilas Céleste, délicat et lumineux, apporte une touche de modernité et d’originalité tout en conservant une élégance masculine assumée.",
    ],
    features,
    priceCents: 2999,
    status: "launch-product",
    statusLabel: "Modèle Apollon",
    primaryModel: true,
    benefits,
  },
  {
    slug: "pourpre",
    modelId: "boxer-aj-luxury",
    model: "Apollon",
    name: "Pourpre Impérial",
    color: "Pourpre Impérial",
    tone: "Apollon au crépuscule",
    swatch: "#7d0f52",
    wearer: "alex",
    image: "/images/client/raw/product-card-pourpre.webp",
    still: "/images/editorial/isabelle-apollon/apollon-pourpre-lyre-v1.webp",
    gallery: [
      {
        src: "/images/client/raw/product-card-pourpre.webp",
        frame: "main",
        objectPosition: "center 30%",
      },
      { src: "/images/client/raw/product-pourpre-detail.webp", frame: "portrait" },
      { src: "/images/client/raw/product-pourpre-back.webp", frame: "portrait" },
      { src: "/images/client/raw/product-pourpre-alt.webp", frame: "portrait" },
      /* Était `editorial-pourpre-chair.webp`, c'est-à-dire JÉRÉMY dans le
         coloris d'Alex — la seule galerie du site qui montrait deux hommes
         différents pour un même vêtement. `hero-pourpre-model.webp` est le
         même plan porté avec Alex, déjà dans le dépôt, et il rend au passage
         le ratio commun 1731x2600 : l'exception de cadre à 1864x2600
         disparaît avec lui. */
      { src: "/images/client/hero-pourpre-model.webp", frame: "portrait" },
    ],
    tagline: "Apollon au crépuscule",
    description:
      "Découvrez Apollon Pourpre Impérial, un boxer masculin pensé pour ceux qui recherchent l’alliance parfaite entre élégance, confort et raffinement.",
    details: [
      "Confectionné dans un tissu doux composé de 94 % modal et 6 % élasthanne, il offre un toucher soyeux, une grande respirabilité et une sensation de seconde peau. Sa coupe boxer classique épouse naturellement les formes du corps tout en garantissant une liberté de mouvement optimale au quotidien.",
      "Sa ceinture élastique de 3,5 cm, ornée du logo métallique AJ Luxury, apporte une signature élégante et un maintien confortable.",
      "Son coloris Pourpre Impérial, profond et sophistiqué, incarne l’assurance et le caractère. Une pièce intemporelle qui sublime votre collection de sous-vêtements.",
    ],
    features,
    priceCents: 2999,
    status: "launch-product",
    statusLabel: "Modèle Apollon",
    primaryModel: true,
    benefits,
  },
]);

export function getProducts() {
  return products;
}

export function getFeaturedModels() {
  return products;
}

export function getProduct(slug: string) {
  return products.find((product) => product.slug === slug);
}

export function getProductVariants(modelId: string) {
  return products.filter((product) => product.modelId === modelId);
}

const numberFormatLocales = {
  fr: "fr-FR",
  en: "en-GB",
  es: "es-ES",
  de: "de-DE",
  it: "it-IT",
} as const;

export function formatPrice(
  priceCents: number | null,
  locale: keyof typeof numberFormatLocales = "fr",
) {
  if (priceCents === null) {
    return {
      fr: "Prix à confirmer",
      en: "Price to be confirmed",
      es: "Precio por confirmar",
      de: "Preis noch zu bestätigen",
      it: "Prezzo da confermare",
    }[locale];
  }

  return new Intl.NumberFormat(numberFormatLocales[locale], {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(priceCents / 100);
}
