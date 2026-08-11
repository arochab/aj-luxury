# AJ Luxury — contrat de conception A02 consentement et audience

**Statut : PASS DE CONCEPTION LEAN — AUCUN CODE A02 ÉCRIT**

**Gate d’entrée : D03 gelé et accepté ; migration prévue `0006`**

## Décision

Appliquer une règle unique aux zones de lancement : aucune mesure d’audience avant
consentement explicite. Le système reste first-party, agrégé, sans identifiant visiteur,
sans lien avec comptes ou commandes, sans fournisseur analytics et sans outil payant.

Ce choix prudent évite la géolocalisation juridique et les exemptions différentes par
pays. Il ne constitue pas un avis juridique ; les textes, durées et transferts devront
être validés avant activation.

## Expérience de consentement

Premier écran, poids visuel comparable :

- `Tout refuser` ;
- `Tout accepter` ;
- `Personnaliser`.

Deux catégories seulement :

- nécessaires, toujours actives et expliquées ;
- mesure d’audience, désactivée par défaut.

Règles :

- aucune case précochée, acceptation par silence ou couleur manipulatrice ;
- `Sec-GPC: 1` force l’audience à `false` ;
- acceptation et refus mémorisés six mois, puis nouveau choix ;
- lien permanent `Gérer mes cookies` dans le pied de page ;
- retrait immédiat, arrêt de la collecte et suppression de l’attribution de session ;
- changement de finalité, fournisseur, inventaire, texte ou version invalide l’accord ;
- panne du consentement = état inconnu, analytics bloqué, vente intacte.

## Stockage borné

Avant accord : aucun appel, stockage, buffer ou rejeu analytics.

Après accord, l’attribution référent/UTM peut vivre dans `sessionStorage`, sans ID de
visiteur. Elle disparaît au refus ou au retrait. Langue, introduction, panier et sessions
de sécurité restent documentés comme fonctions distinctes et nécessaires.

## Migration `0006`

Deux tables seulement :

1. `consent_decisions`, append-only : ID, hash SHA-256 d’un jeton aléatoire first-party,
   décision `granted | denied | withdrawn`, source `banner | preferences`, finalité fixe
   `audience_measurement`, versions politique/copie/inventaire, dates, remplacement et
   clé d’idempotence. Jamais d’IP, user-agent, e-mail, compte, commande ou adresse.
2. `analytics_daily_metrics`, agrégée directement : jour UTC, événement, chemin
   allowlisté, produit/variante facultatifs, référent/UTM allowlistés, compteurs, quantité,
   valeur agrégée et devise. Aucun événement brut, ID visiteur/session/panier/client,
   commande ou paiement.

Étendre les classes de rétention avec `consent_evidence` et
`analytics_daily_aggregate`. Les règles restent inactives tant que leurs durées ne sont
pas approuvées. Hypothèse à valider : agrégats 13 mois ; durée des preuves à fixer
juridiquement, jamais indéfinie.

## Événements et tableau de bord

Événements après consentement : `page_view`, `product_view`, `add_to_cart`,
`checkout_started`.

`order_paid` reste hors analytics : commandes et chiffre d’affaires proviennent des
tables commerce canoniques, sans attribution campagne→commande dans ce MVP.

Le collecteur accepte un événement par requête, valide une liste fermée côté serveur,
utilise l’heure serveur et agrège atomiquement. Il ne retente pas, ne met rien en file et
n’est jamais attendu par le panier, le checkout ou le paiement.

Vue admin unique, périodes 7/30/90 jours : pages consenties, vues produit, ajouts panier,
checkouts, ratios, chemins/référents/UTM et, séparément, commandes/CA commerce. Libellé :
« Mesure limitée aux visites ayant accepté ». Aucun « visiteur unique ».

## Tests veto

- Premier accès, refus et GPC : zéro stockage/requête non essentiel.
- Accord : premier événement seulement après preuve enregistrée.
- Retrait : effet immédiat, attribution supprimée, aucun rejeu.
- Reçu expiré, falsifié ou d’ancienne version : rejet.
- PII, champ libre, query string, fragment ou valeur hors allowlist : rejet.
- Aucun lien avec client, compte, panier, commande ou paiement.
- Incréments D1 concurrents sans perte.
- Analytics lent ou absent : vente inchangée.
- Admin uniquement, jamais de vue individuelle.
- Migration réelle `0000→0006`, upgrade `0005→0006`, replay et contraintes vertes.
- Bundle navigateur sans capacité serveur ; aucun secret, remote ou production.

## Décisions attendues de Jérémy

- textes FR et EN du bandeau, préférences, cookies et confidentialité ;
- durées finales avec validation juridique ;
- Cloudflare/D1 dans les traitements, destinataires et transferts ;
- responsable vie privée et contact public pour le Canada/Québec ;
- fuseau du tableau de bord et nomenclature UTM, sans blocage si liste vide.

## Sources officielles consultées le 11 août 2026

- [CNIL — FAQ cookies](https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/FAQ)
- [CNIL — recommandation cookies consolidée](https://www.cnil.fr/sites/default/files/2026-01/recommandation_cookies_consolidee.pdf)
- [ICO — exceptions storage/access](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/)
- [ICO — gestion du consentement](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/how-do-we-manage-consent-in-practice/)
- [California DOJ — Global Privacy Control](https://oag.ca.gov/privacy/ccpa/gpc)
- [OPC Canada — meaningful consent](https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/appropriate-handling-of-personal-information/collecting-personal-information-and-consent/consent/gl_omc_201805/)
- [CAI Québec — Loi 25](https://www.cai.gouv.qc.ca/protection-renseignements-personnels/sujets-et-domaines-dinteret/principaux-changements-loi-25)
