/* ==========================================================================
   Hero — le premier écran
   --------------------------------------------------------------------------
   HISTORIQUE COURT, PARCE QU'IL EXPLIQUE L'ARCHITECTURE. La v6 était une
   vidéo de 2,6 Mo dont l'unique rôle était d'animer 3 à 6 % des pixels d'une
   image fixe. La v7 l'a remplacée par une photographie en calques. Le 21/08,
   Adam a refusé les masters de ces deux versions : ils venaient d'un modèle
   génératif, les VISAGES ÉTAIENT DÉFORMÉS et le décor était kitsch.

   Ce module est la réponse à ce refus, et elle est structurelle.

     fond    = MÉTAL LIQUIDE, synthétique, calculé au navigateur
     marque  = AJ LUXURY, entre les deux
     figures = LES DEUX CORPS RÉELS, découpés de la photographie validée

   Un générateur redessine ce qu'on lui donne : c'est pour cela que les
   visages dérivaient. Ici aucun générateur n'est sur le chemin. Les corps
   sont les pixels de `campaign-duo-lilas-seated.webp`, la vraie prise de
   studio, découpés par un modèle de SEGMENTATION — qui ne produit qu'un canal
   alpha et ne peut donc pas modifier un visage. Ce qui bouge est derrière
   eux.

   TROIS CONSÉQUENCES QUI VALENT D'ÊTRE DITES :

   1. Le plafond de résolution disparaît. Seuls les CORPS viennent d'un
      fichier ; le fond est calculé, donc net à toute taille et à tout DPR.
      Le compromis « 1,72x d'agrandissement » de la v7 n'existe plus.
   2. Un seul actif sert toutes les tailles d'écran. Les figures sont un
      SUJET, pas une scène : on ne les recadre pas, on les PLACE. Il n'y a
      donc plus de master portrait et de master paysage à tenir synchronisés.
   3. Le mot-marque gagne un fond qui lui appartient, au lieu d'une
      architecture chargée qui lui disputait l'attention.
   ========================================================================== */

export const HERO_VERSION = "v8";

const versioned = (chemin: string) => `${chemin}?v=${HERO_VERSION}`;

/** Au-dessus de ce rapport largeur/hauteur, la fenêtre est traitée comme
 *  paysage. Seuil inchangé depuis la v6 : les directions se relaient toujours
 *  au même endroit, donc le basculement reste prévisible pour la recette. */
export const HERO_PORTRAIT_MAX_ASPECT = 4 / 5;

export const HERO_PORTRAIT_MEDIA = "(max-aspect-ratio: 4 / 5)";

/** Les deux corps détourés, socle noir compris.
 *
 *  Fabriqué par `scripts/build_hero_figures.py` depuis le master approuvé,
 *  rogné sur la boîte englobante de l'alpha : aucun mégapixel transparent
 *  n'est transporté. Les bords sont décontaminés du gris de studio, sans quoi
 *  chaque cheveu porterait un liseré clair sur le métal sombre.
 *
 *  L'ordre des formats suit le poids mesuré : AVIF 195 Ko contre WebP 289. */
export const HERO_FIGURES = {
  avif: versioned("/media/images/client/hero-figures.avif"),
  webp: versioned("/media/images/client/hero-figures.webp"),
  largeur: 1355,
  hauteur: 2020,
  /** Vignette 24 px aplatie sur le noir de marque : couleur posée au premier
   *  paint, zéro requête, zéro décalage de mise en page. */
  lqip:
    "data:image/webp;base64,UklGRnwBAABXRUJQVlA4IHABAADwBwCdASoYACQAPrVUpU4nJKMiMAgA4BaJZgDE2AZbxu2p3AvyEhAA/uW+K9DfEdNhQDaf8IKCOgZQgIoLDu6vj4JvHYe+XWH4y7aYhWk6fNCUEa/7snKzptbSpQLp/552+XPu0Rv1cNsrdEKqlURkEmlIJuIiZ2//ltS0bwpKuP8gl+/99ab85+la6qEAAAA=",
  /** Décrit la photographie, une seule fois, pour tout le premier écran. */
  alt: "AJ Luxury — Jérémy et Alex portent le boxer Apollon Lilas Céleste.",
} as const;

/** Rapport largeur/hauteur de la découpe. Le CSS s'en sert pour réserver la
 *  place exacte des figures avant leur décodage : aucun saut de mise en page. */
export const HERO_FIGURES_RATIO = HERO_FIGURES.largeur / HERO_FIGURES.hauteur;
