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

   2. LA TVA. Le registre officiel indique « Pas de n° TVA valide ». Le numéro
      FR58944996487 a beau être arithmétiquement cohérent — la clé 58 est bien
      celle que donne (12 + 3 × (SIREN mod 97)) mod 97 —, l'administration ne
      le reconnaît pas comme valide à ce jour. Publier un numéro de TVA
      inexistant serait une mention légale fausse. Le champ reste donc en
      attente, et le prix ne peut pas s'afficher « TTC » tant que le régime
      n'est pas tranché : si l'entreprise relève de la franchise en base, la
      mention obligatoire est « TVA non applicable, article 293 B du CGI ».
   ========================================================================== */
export const SELLER_IDENTITY = {
  legalName: "Jérémy Scheppler, entrepreneur individuel",
  legalForm: "Entreprise individuelle — nom commercial AJ Luxury",
  registeredOffice: "3 A rue Principale, 67130 Belmont, France",
  registration:
    "SIREN 944 996 487 — SIRET du siège 944 996 487 00038 — immatriculée au Registre national des entreprises (RNE) le 28 mai 2025",
  vatNumber:
    "À confirmer — le registre officiel indique « pas de n° TVA valide » au 21/08/2026 ; régime de TVA à trancher avant l’ouverture des ventes",
  publicationDirector: "Jérémy Scheppler",
} as const;

/** Numéro EORI, relevé sur la fiche officielle le 22/08/2026. Le handoff du
 *  17/08 le donnait « en attente » : il existe. Il reste à vérifier qu'il est
 *  activé auprès de la douane pour l'export hors Union européenne. */
export const EORI_NUMBER = "FR944996487" as const;

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
  "régime de TVA du vendeur et mention associée sur les prix",
  "adresse de retour et numéro de téléphone",
  "médiateur de la consommation conventionné",
  "zones, transporteurs, tarifs et délais de livraison",
  "prestataire de paiement et moyens de paiement",
  "prestataires réellement utilisés pour les comptes, e-mails et la mesure d’audience",
] as const;
