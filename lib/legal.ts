export const LEGAL_VERSION = "2026-09-03-r3";

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


/* Numéro professionnel communiqué par Adam le 01/09/2026. Il est publié sur
   les surfaces où un consommateur cherche réellement à joindre le vendeur :
   contact, mentions légales et CGV. Il ne doit pas être injecté dans le footer,
   le compte client, le checkout ou les données destinées au transporteur. */
export const LEGAL_CONTACT = {
  brand: "AJ Luxury",
  email: "contact@ajluxurystore.com",
  phone: "+33 6 88 42 40 62",
  phoneHref: "+33688424062",
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
      écrite du vendeur ou du SIE sur la franchise, la TVA et l'OSS. Le recours
      à un comptable n'est pas imposé.
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

/** Statut fiscal communiqué pour le candidat du 26 août 2026. */
export const SELLER_TAX_STATUS = Object.freeze({
  vatCollected: false,
  taxCents: 0,
  invoiceMention: "TVA non applicable, art. 293 B du code général des impôts",
} as const);

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

/* Adhésion triennale payée le 01/09/2026. Preuve interne :
   docs/legal/mediation/mediator-source-2026-09-01.pdf, SHA-256
   f2b0cfddb88d0e8b2ede2b8abca8980e4d09e18d82cccb5a9107398cf67870b7.
   Les coordonnées publiées sont celles du service consommateur indiquées sur
   le site officiel du médiateur ; les données bancaires de la facture source
   ne sont jamais exposées. */
export const MEDIATOR: Readonly<{
  name: string;
  address: string;
  website: string;
  filingUrl: string;
}> = Object.freeze({
  name: "Société Médiation Professionnelle – Médiateur de la consommation",
  address: "Alteritae, 5 rue Salvaing, 12000 Rodez, France",
  website: "https://www.mediateur-consommation-smp.fr/",
  filingUrl: "https://www.mediateur-consommation-smp.fr/demander-une-mediation/",
});

export const PRELAUNCH_BLOCKERS = [] as const;

export const POSTLAUNCH_FORMALITIES = [
  "déclarer l’ajout de l’activité de vente en ligne au guichet unique dans le mois suivant son démarrage",
] as const;
