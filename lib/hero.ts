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

/** LA PHOTOGRAPHIE DE CAMPAGNE, ENTIERE.
 *
 *  Remplacement demande par Adam le 22/08/2026. La scene precedente
 *  superposait deux corps DETOURES sur un champ de metal calcule ; elle est
 *  supprimee, pas melangee. Ce qui est servi ici est la prise de vue de studio
 *  telle quelle, fond compris.
 *
 *  Trois consequences directes, et elles sont toutes des gains :
 *
 *  - plus aucun liseré de detourage dans les cheveux, defaut constate a
 *    l'echelle 1:1 le 22/08 ;
 *  - plus de canevas WebGL sur le premier ecran, donc le budget de
 *    composition revient a la page ;
 *  - la lumiere des corps et celle du fond viennent de la meme prise de vue,
 *    ce qu'aucune composition ne garantissait.
 *
 *  Master : 1484 x 2229, la source la moins compressee dont dispose le
 *  projet. Mesure le 22/08 : le JPEG de 1115 Ko n'est que 1 % plus fin que le
 *  WebP de 177 Ko, donc la resolution est le vrai plafond, pas l'encodage.
 *
 *  AVIF ECARTE, ET C'EST MESURE. Sur cette photographie il pese PLUS lourd
 *  que le WebP a qualite comparable : 240 Ko contre 188 en pleine largeur.
 *  Le servir couterait des octets sans rien apporter. */
export const HERO_PHOTO = {
  webp1484: versioned("/media/images/client/campagne-duo-1484.webp"),
  webp1100: versioned("/media/images/client/campagne-duo-1100.webp"),
  webp760: versioned("/media/images/client/campagne-duo-760.webp"),
  largeur: 1484,
  hauteur: 2229,
  /** Teinte du fond de studio, relevee sur les bords haut et bas du master.
   *  Elle prolonge la photographie quand le cadre est plus large qu'elle, au
   *  lieu de la recadrer et de couper les sujets. */
  fondHaut: "#2b2839",
  fondBas: "#282126",
  alt: "AJ Luxury — deux mannequins portent le boxer Apollon Lilas Céleste, prise de vue de studio.",
} as const;

/** Rapport largeur/hauteur de la photographie. Le CSS reserve sa place exacte
 *  avant decodage : aucun saut de mise en page. */
export const HERO_PHOTO_RATIO = HERO_PHOTO.largeur / HERO_PHOTO.hauteur;

/** Le logo de la maison, servi en grand au premier écran ET en petit dans la
 *  barre. C'est le MÊME dessin : l'atterrissage du mot-marque est donc un vrai
 *  changement d'échelle, pas un fondu entre deux objets.
 *
 *  Le dérivé @2x est un rééchantillonnage de Lanczos de l'actif natif — aucun
 *  pixel inventé, aucun modèle génératif. Il n'existe que pour les rendus qui
 *  dépassent 720 px de large. */
export const HERO_LOGO = {
  /* MÊME URL QUE LA BARRE, AU CARACTÈRE PRÈS, ET C'EST UN CORRECTIF.
     Le hero servait `/media/images/aj-luxury-logo.webp?v=v8` quand la barre
     sert `/images/aj-luxury-logo.webp` : deux entrées de cache pour un seul
     fichier, donc deux téléchargements du même dessin sur le premier écran.
     Les deux chemins passent par le même worker ; seule leur écriture
     différait. */
  src: "/images/aj-luxury-logo.webp",
  /* Le rendu du hero dépasse 720 px sur grand écran. Le dérivé @2x est un
     rééchantillonnage de Lanczos de l'actif natif — aucun pixel inventé. */
  srcSet:
    "/images/aj-luxury-logo.webp 720w, /images/aj-luxury-logo@2x.webp 1440w",
  sizes: "(max-aspect-ratio: 4 / 5) min(78vw, 460px), min(71vw, 1400px)",
  largeur: 720,
  hauteur: 520,
} as const;
