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

export type Product = {
  slug: string;
  modelId: "boxer-aj-luxury";
  model: string;
  name: string;
  color: string;
  tone: string;
  swatch: string;
  image: string;
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
    tone: "Doux et raffiné",
    swatch: "#dda9bd",
    image: "/images/client/raw/product-rose-profile.webp",
    gallery: [
      {
        src: "/images/client/raw/product-rose-profile.webp",
        frame: "main",
        objectPosition: "center 30%",
      },
      { src: "/images/client/raw/product-card-rose.webp", frame: "portrait" },
      {
        src: "/images/client/raw/product-rose-front.webp",
        frame: "portrait",
        /* 2000x2571 = 0,7779, contre 0,6658 pour les autres sources. */
        sourceRatio: "2000 / 2571",
      },
      { src: "/images/client/raw/product-rose-detail.webp", frame: "landscape" },
    ],
    tagline: "Doux et raffiné",
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
    tone: "Délicat et lumineux",
    swatch: "#a9abd9",
    image: "/images/client/editorial-lilas-chair.webp",
    gallery: [
      {
        src: "/images/client/raw/product-lilas-model.webp",
        frame: "main",
        objectPosition: "center 30%",
      },
      { src: "/images/client/editorial-lilas-chair.webp", frame: "portrait" },
      { src: "/images/client/raw/product-lilas-detail.webp", frame: "portrait" },
      { src: "/images/client/raw/product-lilas-back.webp", frame: "portrait" },
      { src: "/images/client/raw/product-lilas-front.webp", frame: "portrait" },
    ],
    tagline: "Délicat et lumineux",
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
    tone: "Profond et sophistiqué",
    swatch: "#7d0f52",
    image: "/images/client/raw/product-card-pourpre.webp",
    gallery: [
      {
        src: "/images/client/raw/product-card-pourpre.webp",
        frame: "main",
        objectPosition: "center 30%",
      },
      { src: "/images/client/raw/product-pourpre-detail.webp", frame: "portrait" },
      { src: "/images/client/raw/product-pourpre-back.webp", frame: "portrait" },
      { src: "/images/client/raw/product-pourpre-alt.webp", frame: "portrait" },
      {
        src: "/images/client/editorial-pourpre-chair.webp",
        frame: "portrait",
        /* 1864x2600 = 0,7169, contre 0,6658 pour les autres sources. */
        sourceRatio: "1864 / 2600",
      },
    ],
    tagline: "Profond et sophistiqué",
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
