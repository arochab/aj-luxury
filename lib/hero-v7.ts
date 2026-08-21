/* ==========================================================================
   Hero v7 — la photographie vivante
   --------------------------------------------------------------------------
   v6 était une vidéo : un compositing local rendu en quatre MP4, 2,6 Mo pour
   le jeu complet, dont l'unique rôle était de faire bouger 3 à 6 % des pixels
   d'une image fixe. v7 rend ce mouvement au navigateur et supprime la vidéo.

   Ce que ce changement achète :
     • 173 Ko pour le premier écran de bureau (94 Ko de fond + 79 Ko de
       découpe) contre 742 Ko de MP4 desktop, poster non compris ;
     • un LCP qui est une <img> avec `fetchpriority=high`, pas un élément
       vidéo dont le premier cadre dépend du décodage ;
     • et surtout le geste qui n'était pas possible en vidéo : LE MOT-MARQUE
       PASSE DERRIÈRE LES CORPS. Le fond et les corps sont deux calques ;
       AJ LUXURY se glisse entre les deux.

   Les deux masters sont les images validées par Adam le 21 août 2026 à 09:52.
   Chacune produit une paire strictement superposée, fabriquée par
   `scripts/build_hero_v7_assets.py` :
     • `plate`   — la photographie entière, inchangée ;
     • `figures` — les deux corps détourés, fond transparent.
   Les deux calques partagent dimensions, `object-fit` et `object-position` :
   leur recalage est donc exact par construction, à toute taille de fenêtre.

   PLAFOND DE RÉSOLUTION, ÉNONCÉ ET NON CONTOURNÉ. Les masters font 1672x941.
   Aucun agrandissement génératif n'est appliqué : sur ces images, il
   toucherait des visages réels. Un écran 1440x900 en DPR 2 demande 2880 px de
   large et en reçoit 1672 — soit 1,72x. Sur un composite CGI à lumière douce,
   sans texture fine ni texte, l'écart n'est pas visible à distance normale ;
   il le deviendrait sur un master photographique. Le vrai palier est une
   regénération des masters en 4K, pas un upscale.
   ========================================================================== */

export const HERO_VERSION = "v7";

const versioned = (chemin: string) => `${chemin}?v=${HERO_VERSION}`;

/** Au-dessus de ce rapport largeur/hauteur, la fenêtre est traitée comme
 *  paysage. Même seuil que le hero v6 : les deux directions d'art se relaient
 *  au même endroit, donc le basculement reste prévisible pour la recette. */
export const HERO_PORTRAIT_MAX_ASPECT = 4 / 5;

export const HERO_PORTRAIT_MEDIA = `(max-aspect-ratio: 4 / 5)`;

export type HeroCalque = {
  avif: string;
  webp: string;
};

export type HeroMaster = {
  /** Master d'origine, pour la traçabilité de la recette. */
  source: string;
  largeur: number;
  hauteur: number;
  plate: HeroCalque;
  figures: HeroCalque;
  /** Vignette 24 px en data URI : couleur posée au premier paint, zéro
   *  requête, zéro décalage de mise en page. */
  lqip: string;
};

const base = "/media/images/client";

export const HERO_MASTERS = {
  /** IMAGE A — validée pour le bureau et la tablette. */
  paysage: {
    source: "hero-v7-source-A-landscape-1672x941.png",
    largeur: 1672,
    hauteur: 941,
    plate: {
      avif: versioned(`${base}/hero-v7-paysage-plate.avif`),
      webp: versioned(`${base}/hero-v7-paysage-plate.webp`),
    },
    figures: {
      // Mesuré : 79 Ko en WebP contre 120 Ko en AVIF sur cette découpe. AVIF
      // n'est pas systématiquement plus léger dès qu'il y a un canal alpha
      // très découpé ; l'ordre des <source> suit la mesure, pas la mode.
      webp: versioned(`${base}/hero-v7-paysage-figures.webp`),
      avif: versioned(`${base}/hero-v7-paysage-figures.avif`),
    },
    lqip: "data:image/webp;base64,UklGRpwAAABXRUJQVlA4IJAAAADQAwCdASoYAA4APrVInkmnJCKhMAgA4BaJaQAAXJqyLedc6BfkJCAA/uW+K9DfEdNhQDaf8IKCOgZQgIoLDu6vj4JvHYe+XWH4y7aYhWk6fNCUEa/7snKzptbSpQLp/552+XPu0Rv1cNsrdEKqlURkEmlIJuIiZ2//ltS0bwpKuP8gl+/99ab85+la6qEAAAA=",
  },
  /** IMAGE B — validée pour le téléphone. Recadrée sur les deux corps
   *  (704x941, soit 0,748) par le script d'actifs ; aucun corps, aucun
   *  visage, aucune ceinture n'est coupé. */
  portrait: {
    source: "hero-v7-source-B-landscape-1672x941.png",
    largeur: 704,
    hauteur: 941,
    plate: {
      avif: versioned(`${base}/hero-v7-portrait-plate.avif`),
      webp: versioned(`${base}/hero-v7-portrait-plate.webp`),
    },
    figures: {
      avif: versioned(`${base}/hero-v7-portrait-figures.avif`),
      webp: versioned(`${base}/hero-v7-portrait-figures.webp`),
    },
    lqip: "data:image/webp;base64,UklGRmQBAABXRUJQVlA4IFgBAAAwBwCdASoYACAAPrVKnkmnJCKhMAgA4BaJZgC7ISBDrLgJVFNC8qSHXEwOfjFyf+XKU+/uWgSJ5l1EWumAYGaXv8AA/tKwsbvXhlSV7Srw8In7X8e+ZEwopg2D68HDvgk7aqhVQH7rPzjP4505uA55EsEgtWQP8NzrCS8RU3PrtqdbOCy8e0icuACx4Jlygf9LnAgnsG8w+Cc+hr4Q4t0lun/4U5TsAhO5ExCe7NErGJLcs8xcnkFV3Ec2jp8GVnK62eGXcts8JRfZl3/AzrL3CVyMgTxbpfLP4SrOZsRX/r46a8DpLcPndZbrIPKTzs0QhuqZSS/6hlZ6tkyOw1ktRqbXnrTxXAhSXq3TfjviSqavPowV0hgOvgre+qtj2V5GDDbAIHBtwvJOPXiZKYQOev7UnDt+wGmKBEX9mGhR4UQ9p6p53OHwNgODq84b2Rt50GegFFHmAA==",
  },
} as const satisfies Record<string, HeroMaster>;

/** Le master qu'une fenêtre donnée doit recevoir. Sert au composant et à la
 *  recette : un seul endroit décide, donc le test peut l'interroger. */
export function selectHeroMaster(
  largeurFenetre: number,
  hauteurFenetre: number,
): HeroMaster {
  if (
    hauteurFenetre > 0 &&
    largeurFenetre / hauteurFenetre <= HERO_PORTRAIT_MAX_ASPECT
  ) {
    return HERO_MASTERS.portrait;
  }
  return HERO_MASTERS.paysage;
}
