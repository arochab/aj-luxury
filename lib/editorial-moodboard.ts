export type EditorialMoodboardImage = {
  src: string;
  alt: string;
  crop: "portrait-left" | "duo" | "portrait-right";
  width: number;
  height: number;
};

/**
 * Campagne éditoriale resserrée : trois coloris et trois prises distinctes du
 * photoshoot client source. Ces dérivés web viennent des masters IMG_5573,
 * IMG_5531 et IMG_5441 ; aucun plan n'est répété dans l'accueil.
 */
export const editorialMoodboardImages: EditorialMoodboardImage[] = [
  {
    src: "/images/client/shoot/pourpre-seated.webp",
    alt: "AJ Luxury — Jérémy — Apollon Pourpre Impérial",
    crop: "portrait-left",
    width: 1200,
    height: 1803,
  },
  {
    src: "/images/client/shoot/lilas-seated.webp",
    alt: "AJ Luxury — Jérémy — Apollon Lilas Céleste",
    crop: "duo",
    width: 1200,
    height: 1803,
  },
  {
    src: "/images/client/shoot/rose-standing-jeremy.webp",
    alt: "AJ Luxury — Jérémy — Apollon Rose Velours",
    crop: "portrait-right",
    width: 1200,
    height: 1803,
  },
];
