export const LEGAL_VERSION = "2026-08-25";

/*
  La même date, mais avec des traits d'union INSÉCABLES (U+2011) pour
  l'affichage. Dans le surtitre des six pages du gabarit d'information, la
  colonne de titre fait ~415 px : le navigateur coupait la ligne sur le trait
  d'union ISO et laissait « 07-30 » seul sur une seconde ligne, sous
  « … version du 2026- ». Un numéro de version cassé en son milieu se lit mal
  au-dessus de pages qui doivent inspirer confiance. La césure se fait
  désormais avant « version ». La constante brute reste la valeur de référence
  pour toute comparaison ou tout export.
*/
export const LEGAL_VERSION_DISPLAY = LEGAL_VERSION.replace(/-/g, "‑");


/*
  LE TÉLÉPHONE EST `null`, ET C'EST UN CHOIX ASSUMÉ, PAS UN OUBLI.

  Adam confirme le 22/08/2026 qu'aucune ligne n'est ouverte à ce jour.

  L'article 6 III 1 a) de la LCEN demande, pour un éditeur personne physique,
  « nom, prénoms, domicile et numéro de téléphone ». Il manque donc une mention
  légale, et aucun code ne peut la fabriquer : inventer un numéro serait une
  faute bien plus grave que l'absence.

  Restait à choisir entre afficher un texte d'attente et ne rien afficher.
  Un « à compléter avant l'ouverture des ventes » sur des mentions légales en
  ligne ne satisfait pas davantage la loi ET signale au visiteur que la marque
  n'est pas prête. La ligne est donc omise tant que la valeur est `null`, et le
  manque est porté là où il peut être traité : PRELAUNCH_BLOCKERS ci-dessous.

  Dès qu'un numéro existe, il suffit de le poser ici : la ligne réapparaît.
*/
export const LEGAL_CONTACT = {
  brand: "AJ Luxury",
  email: "contact@ajluxurystore.com",
  phone: null as string | null,
} as const;

/* ==========================================================================
   IDENTITÉ DU VENDEUR — renseignée le 22/08/2026
   --------------------------------------------------------------------------
   SOURCE : Annuaire des Entreprises (INSEE, DGFiP, Douanes, INPI), fiche
   SIREN 944 996 487, relevée le 22/08/2026, données mises à jour au
   21/08/2026. Recoupée avec l'adresse d'expéditeur du compte Sendcloud
   « Scheppler Jeremy », qui porte la même adresse.

   « AJ Luxury » est le nom commercial. Le vendeur, au sens juridique, est
   l'entreprise individuelle Jeremy SCHEPPLER : les mentions légales doivent
   donc porter les deux.

   DEUX POINTS DE VIGILANCE, VÉRIFIÉS ET NON INVENTÉS :

   1. LE SIRET. L'entreprise compte trois établissements et UN SEUL est en
      activité : 944 996 487 00038, siège social depuis le 28/07/2026. Les
      deux autres sont fermés — 00012 à Strasbourg (fermé le 25/09/2025) et
      00020 à Belmont (fermé le 28/07/2026). Ne jamais publier le 00020, qui
      circule encore dans des annuaires tiers.

   2. LA TVA. La clé de contrôle française permet de former FR58944996487,
      mais elle ne prouve ni son attribution active ni le régime fiscal.
      Contrôle du 25/08/2026 : VIES renvoie invalide et l'API officielle des
      entreprises renvoie « tva: null ». Le numéro ne doit donc pas être
      publié comme numéro de TVA intracommunautaire actif. La mention de prix
      et le traitement des ventes UE seront renseignés seulement après réponse
      écrite du comptable ou du SIE sur la franchise, la TVA et l'OSS.
   ========================================================================== */
export const SELLER_IDENTITY = {
  legalName: "Jérémy Scheppler, entrepreneur individuel",
  legalForm: "Entreprise individuelle — nom commercial AJ Luxury",
  registeredOffice: "3 A rue Principale, 67130 Belmont, France",
  registration:
    "SIREN 944 996 487 — SIRET du siège 944 996 487 00038 — immatriculée au Registre national des entreprises (RNE) le 28 mai 2025",
  vatNumber: null as string | null,
  publicationDirector: "Jérémy Scheppler",
} as const;

/** Numéro EORI relevé sur la fiche officielle le 22/08/2026 et déclaré valide
 *  par le validateur EORI officiel de l'Union européenne le 25/08/2026.
 *  Cette validation ne remplace pas la configuration des transporteurs,
 *  déclarations, droits, taxes et retours pour chaque destination hors UE. */
export const EORI_NUMBER = "FR944996487" as const;

/**
 * Adresse confirmée par Jérémy le 25/08/2026 pour les retours AJ Luxury.
 * Elle est identique au siège et à l'adresse expéditeur Sendcloud.
 */
export const RETURN_ADDRESS = {
  recipient: "AJ Luxury — Jérémy Scheppler EI",
  line1: "3 A rue Principale",
  postalCode: "67130",
  city: "Belmont",
  country: "France",
} as const;

export const HOSTING_PROVIDER = {
  name: "Cloudflare, Inc.",
  address:
    "101 Townsend Street, San Francisco, California 94107, États-Unis",
  phone: "+33 1 73 01 52 44",
  website: "https://www.cloudflare.com",
} as const;

/*
  `null` TANT QU'AUCUN MÉDIATEUR N'EST CONVENTIONNÉ, pour la même raison que
  le téléphone plus haut : une page de CGV qui affiche « À compléter, À
  compléter » ne satisfait pas davantage l'article L612-1 du code de la
  consommation, et signale au lecteur une marque qui n'est pas prête.

  Relevé sur la prévisualisation déployée le 22/08/2026 : la phrase rendue
  était « le médiateur conventionné par AJ Luxury : À sélectionner et
  conventionner avant l'ouverture des ventes, À compléter, À compléter. »

  À la place, la page dit ce qui est vrai : la vente n'est pas ouverte, et le
  médiateur sera désigné avant qu'elle le soit. Dès qu'il l'est, poser l'objet
  ici suffit : la phrase définitive réapparaît.
*/
export const MEDIATOR: Readonly<{
  name: string;
  address: string;
  website: string;
}> | null = null;

export const PRELAUNCH_BLOCKERS = [
  "régime de TVA du vendeur et mention associée sur les prix",
  "numéro de téléphone de l’éditeur, exigé par l’article 6 III de la LCEN",
  "activité de vente au détail à déclarer : l’activité enregistrée est la production de films (59.11B)",
  "médiateur de la consommation conventionné",
  "zones, transporteurs, tarifs et délais de livraison",
  "prestataire de paiement et moyens de paiement",
  "prestataires réellement utilisés pour les comptes, e-mails et la mesure d’audience",
] as const;
