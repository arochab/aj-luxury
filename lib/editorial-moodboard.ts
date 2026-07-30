export type EditorialMoodboardImage = {
  src: string;
  alt: string;
  crop: "portrait-left" | "duo" | "portrait-right";
};

/** Campagne éditoriale resserrée — un solo de chaque fondateur et une image duo. */
export const editorialMoodboardImages: EditorialMoodboardImage[] = [
  {
    src: "/images/client/editorial-pourpre-chair.webp",
    alt: "Alex portant Apollon Pourpre Impérial, assis",
    crop: "portrait-left",
  },
  {
    src: "/images/client/campaign-duo-pourpre.webp",
    alt: "Alex et Jérémy portant Apollon Pourpre Impérial",
    crop: "duo",
  },
  {
    src: "/images/client/editorial-rose-profile.webp",
    alt: "Jérémy portant Apollon Rose Velours, de profil",
    crop: "portrait-right",
  },
];
