export type EditorialMoodboardImage = {
  src: string;
  alt: string;
  crop: "portrait-left" | "duo" | "portrait-right";
};

/** Campagne éditoriale resserrée — un solo de chaque fondateur et une image duo. */
export const editorialMoodboardImages: EditorialMoodboardImage[] = [
  {
    src: "/images/client/editorial-pourpre-chair.webp",
    alt: "AJ Luxury — Jérémy — Apollon Pourpre Impérial",
    crop: "portrait-left",
  },
  {
    src: "/images/client/campaign-duo-pourpre.webp",
    alt: "AJ Luxury — Jérémy, Alex — Apollon Pourpre Impérial",
    crop: "duo",
  },
  {
    src: "/images/client/editorial-rose-profile.webp",
    alt: "AJ Luxury — Alex — Apollon Rose Velours",
    crop: "portrait-right",
  },
];
