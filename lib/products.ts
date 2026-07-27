export const sizes = ["S", "M", "L", "XL"] as const;

export type ProductSize = (typeof sizes)[number];

export type Product = {
  slug: string;
  modelId: "boxer-aj-luxury";
  model: string;
  name: string;
  color: string;
  tone: string;
  swatch: string;
  image: string;
  gallery: string[];
  tagline: string;
  description: string;
  priceCents: null;
  status: "launch-product";
  statusLabel: string;
  primaryModel: boolean;
  inventory: Record<ProductSize, number>;
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

export const products: Product[] = [
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
      "/images/client/raw/product-card-pourpre.webp",
      "/images/client/raw/product-pourpre-detail.webp",
      "/images/client/raw/product-pourpre-back.webp",
      "/images/client/raw/product-pourpre-alt.webp",
    ],
    tagline: "Profond et sophistiqué",
    description:
      "Découvrez Apollon Pourpre Impérial, un boxer masculin pensé pour ceux qui recherchent l’alliance parfaite entre élégance, confort et raffinement.",
    priceCents: null,
    status: "launch-product",
    statusLabel: "Modèle Apollon",
    primaryModel: true,
    inventory: { S: 26, M: 103, L: 87, XL: 36 },
    benefits,
  },
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
      "/images/client/raw/product-rose-profile.webp",
      "/images/client/raw/product-card-rose.webp",
      "/images/client/raw/product-rose-detail.webp",
      "/images/client/raw/product-rose-front.webp",
    ],
    tagline: "Doux et raffiné",
    description:
      "Découvrez Apollon Rose Velours, une pièce qui réinvente le sous-vêtement masculin avec subtilité et sophistication.",
    priceCents: null,
    status: "launch-product",
    statusLabel: "Modèle Apollon",
    primaryModel: true,
    inventory: { S: 26, M: 103, L: 87, XL: 36 },
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
    image: "/images/client/raw/product-lilas-model.webp",
    gallery: [
      "/images/client/raw/product-lilas-model.webp",
      "/images/client/editorial-lilas-chair.webp",
      "/images/client/raw/product-lilas-detail.webp",
      "/images/client/raw/product-lilas-back.webp",
      "/images/client/raw/product-lilas-front.webp",
    ],
    tagline: "Délicat et lumineux",
    description:
      "Découvrez Apollon Lilas Céleste, un boxer masculin où la douceur rencontre l’élégance contemporaine.",
    priceCents: null,
    status: "launch-product",
    statusLabel: "Modèle Apollon",
    primaryModel: true,
    inventory: { S: 26, M: 102, L: 88, XL: 36 },
    benefits,
  },
];

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

export function formatPrice(priceCents: number | null) {
  if (priceCents === null) return "Prix à confirmer";

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}
