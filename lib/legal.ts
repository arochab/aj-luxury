export const LEGAL_VERSION = "30 juillet 2026";

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
