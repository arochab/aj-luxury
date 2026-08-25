export type EditorialMoodboardImage = {
  src: string;
  alt: string;
  crop: "portrait-left" | "duo" | "portrait-right";
  width: number;
  height: number;
};

/**
 * Campagne éditoriale à parité stricte : Alex, le duo, puis Jérémy. Chaque
 * personne bénéficie du même cadre portrait et le seul plan commun occupe le
 * centre. Les trois prises sont distinctes et aucun plan n'est répété.
 */
export const editorialMoodboardImages: EditorialMoodboardImage[] = [
  {
    src: "/images/client/shoot/rose-standing.webp",
    alt: "AJ Luxury — Alex — Apollon Rose Velours",
    crop: "portrait-left",
    width: 1200,
    height: 1803,
  },
  {
    src: "/images/client/shoot/duo-pourpre-full.webp",
    alt: "AJ Luxury — Alex et Jérémy — Apollon Pourpre Impérial",
    crop: "duo",
    width: 2200,
    height: 2070,
  },
  {
    src: "/images/client/shoot/lilas-seated.webp",
    alt: "AJ Luxury — Jérémy — Apollon Lilas Céleste",
    crop: "portrait-right",
    width: 1200,
    height: 1803,
  },
];
