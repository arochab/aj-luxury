export type EditorialMoodboardImage = {
  src: string;
  alt: string;
  crop: "portrait-left" | "duo" | "portrait-right";
  objectPosition?: string;
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
  },
  {
    src: "/images/client/campaign-duo-lilas-seated.webp",
    alt: "AJ Luxury — Alex et Jérémy — Apollon Lilas Céleste",
    crop: "duo",
    objectPosition: "50% 22%",
  },
  {
    src: "/images/client/editorial-rose-profile.webp",
    alt: "AJ Luxury — Alex — Apollon Rose Velours",
    crop: "portrait-right",
  },
];
