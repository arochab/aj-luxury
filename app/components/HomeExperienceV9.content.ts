import type { TranslationKey } from "../../lib/i18n/dictionaries";

export const HOME_V9_ANATOMY = [
  "section-hero",
  "section-colorways",
  "section-material",
  "section-campaign-closing",
] as const;

export const HOME_V9_ASSETS = {
  hero: "/images/client/raw/product-pourpre-detail.webp",
  material: "/images/client/raw/product-rose-detail.webp",
  campaign: {
    mobile: "/images/client/campagne-duo-760.webp",
    tablet: "/images/client/campagne-duo-1100.webp",
    desktop: "/images/client/campagne-duo-1484.webp",
  },
} as const;

export const HOME_V9_COPY = {
  heroLineOne: "Reveal Your",
  heroLineTwoLead: "Inner",
  heroLineTwoAccent: "Beauty",
  productName: "Apollon",
  productSlug: "pourpre",
  closingCopyKey: "brandStory",
} as const;

export const HOME_V9_COLORWAYS = [
  {
    slug: "rose-pale",
    nameKey: "sequence.color.rose" satisfies TranslationKey,
    descriptionKey: "product.description.rose-pale" satisfies TranslationKey,
    image: "/images/client/editorial-rose-profile.webp",
    width: 1731,
    height: 2600,
    position: "center 30%",
  },
  {
    slug: "lilas-bleu-clair",
    nameKey: "sequence.color.lilac" satisfies TranslationKey,
    descriptionKey:
      "product.description.lilas-bleu-clair" satisfies TranslationKey,
    image: "/images/client/editorial-lilas-chair.webp",
    width: 1731,
    height: 2600,
    position: "center 29%",
  },
  {
    slug: "pourpre",
    nameKey: "sequence.color.purple" satisfies TranslationKey,
    descriptionKey: "product.description.pourpre" satisfies TranslationKey,
    image: "/images/client/editorial-pourpre-chair.webp",
    width: 1864,
    height: 2600,
    position: "center 31%",
  },
] as const;

export const HOME_V9_PREVIEW_CONTROLS = {
  heroSplit: { key: "--home9-hero-split", min: 36, max: 42, step: 1 },
  heroTitle: { key: "--home9-hero-title-max", min: 76, max: 104, step: 2 },
  sectionSpace: { key: "--home9-section-space", min: 68, max: 100, step: 4 },
  motion: { key: "--home9-motion-duration", min: 180, max: 500, step: 20 },
} as const;
