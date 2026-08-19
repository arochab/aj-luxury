export const LEGAL_VERSION = "2026-07-30";

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


export const LEGAL_CONTACT = {
  brand: "AJ Luxury",
  email: "contact@ajluxurystore.com",
  phone: "À compléter avant l’ouverture des ventes",
} as const;

export const SELLER_IDENTITY = {
  legalName: "À compléter — dénomination sociale ou nom de l’entrepreneur",
  legalForm: "À compléter — forme juridique et capital social, le cas échéant",
  registeredOffice: "À compléter — adresse du siège ou de domiciliation",
  registration:
    "À compléter — SIREN, SIRET et mention RCS/RNE avec la ville d’immatriculation",
  vatNumber: "À compléter — numéro de TVA intracommunautaire, si applicable",
  publicationDirector:
    "À compléter — nom du représentant légal ou du directeur de la publication",
} as const;

export const HOSTING_PROVIDER = {
  name: "Cloudflare, Inc.",
  address:
    "101 Townsend Street, San Francisco, California 94107, États-Unis",
  phone: "+33 1 73 01 52 44",
  website: "https://www.cloudflare.com",
} as const;

export const MEDIATOR = {
  name: "À sélectionner et conventionner avant l’ouverture des ventes",
  address: "À compléter",
  website: "À compléter",
} as const;

export const PRELAUNCH_BLOCKERS = [
  "identité juridique complète du vendeur",
  "adresse de retour et numéro de téléphone",
  "médiateur de la consommation conventionné",
  "zones, transporteurs, tarifs et délais de livraison",
  "prestataire de paiement et moyens de paiement",
  "prestataires réellement utilisés pour les comptes, e-mails et la mesure d’audience",
] as const;
