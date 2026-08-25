export type EditorialMoodboardImage = {
  src: string;
  alt: string;
  crop: "portrait-left" | "duo" | "portrait-right";
  width: number;
  height: number;
};

/**
 * Campagne éditoriale resserrée : trois coloris distincts, un solo de chaque
 * fondateur et une image duo. L'ordre évite toute répétition de coloris dans
 * une même séquence visuelle.
 */
export const editorialMoodboardImages: EditorialMoodboardImage[] = [
  {
    src: "/images/client/editorial-pourpre-chair.webp",
    alt: "AJ Luxury — Jérémy — Apollon Pourpre Impérial",
    crop: "portrait-left",
    width: 1864,
    height: 2600,
  },
  {
    src: "/images/client/campaign-duo-lilas-seated.webp",
    alt: "AJ Luxury — Alex et Jérémy — Apollon Lilas Céleste",
    crop: "duo",
    width: 1484,
    height: 2229,
  },
  {
    src: "/images/client/editorial-rose-profile.webp",
    alt: "AJ Luxury — Alex — Apollon Rose Velours",
    crop: "portrait-right",
    width: 1731,
    height: 2600,
  },
];
