# AJ Luxury — contrat d’exécution D03 logistique

**Statut : PASS DE CONCEPTION LEAN — IMPLÉMENTATION LOCALE EN COURS, CANDIDAT NON GELÉ ET NON ACCEPTÉ**

**Base gelée : `f5ba52d94c53963f52a24b9edcc6c84033b2f1f6`**

**Gate d’entrée : suite complète I06 verte en un seul lancement**

## Objectif borné

Ajouter en local les devis de livraison, l’expédition, le suivi, les retours, la
rétractation et les remboursements pour l’Union européenne, le Royaume-Uni, les
États-Unis et le Canada. Toute autre destination reste fermée. Aucun prestataire,
secret, argent, base distante, route publique ou production n’est activé.

## Modèle minimal accepté

Migration additive unique : `0005_fulfillment_returns_refunds.sql`. Les migrations
`0000` à `0004` restent byte-identiques.

1. `shipping_zone_configurations` : zone, version, statut, service, prix EUR,
   délais, DAP/DDP, colis, origine et code douanier.
2. `shipping_quotes` : panier et empreinte, configuration, adresse normalisée,
   référence/reçu prestataire, montant, délais, droits, expiration et sélection.
3. `shipments` : commande/devis, états d’étiquette et de remise, référence de suivi,
   clé stable, lease, reçu, tentatives et horodatages.
4. `shipment_tracking_events` : événements append-only dédupliqués, sans payload brut.
5. `return_requests` : commande, type retour/rétractation, source, empreinte immuable
   de la déclaration, état, résolution et horodatages.
6. `return_lines` : quantités demandées, reçues, vendables, non vendables et remises
   en stock, avec résultat d’inspection.
7. `refunds` : paiement, retour, motif, montant, état, clé stable, lease, reçu,
   tentatives et horodatages.
8. `customs_records` : expédition, état, référence manuelle et empreinte, sans PDF.

Ajouter à `orders` :

- `shipping_quote_id` ;
- `shipping_address_fingerprint`.

Ces colonnes restent nullables uniquement pour l’historique éventuel issu de `0004`.
Toute nouvelle commande doit les renseigner et les figer.

## Invariants veto

- Zéro zone active après migration ; une seule configuration active et immuable par
  zone, toute évolution créant une nouvelle version.
- Le serveur recharge le devis D1 à partir de son ID. Le devis est lié au panier, à
  son empreinte et à l’adresse ; aucune signature cryptographique n’est nécessaire.
- L’expiration est contrôlée lors de la sélection. Un paiement arrivé ensuite reste
  valable si la sélection était valide.
- Aucune expédition pour une commande non payée. Hors UE, la douane `ready` bloque
  la remise au transporteur, pas nécessairement la génération de l’étiquette.
- DDP reste inactivable sans capacité prouvée de calcul des coûts complets du futur
  prestataire.
- Suivi append-only, doublon exact sans effet, doublon divergent ou croisé rejeté.
- Rétractation invitée uniquement avec une session D1 valide sur la commande exacte ;
  jamais avec le seul couple e-mail/numéro de commande.
- Une demande de rétractation est toujours enregistrable et accusée, même si la date
  de livraison n’est pas encore connue.
- Pour chaque ligne : reçu ≤ acheté ; vendable + non vendable = reçu ; remise en stock
  ≤ vendable. Aucun réassort avant inspection complète.
- Le réassort réutilise exactement le ledger I06 : un unique mouvement déterministe
  `kind='adjustment'` avec `reference_type='physical_increase'`, relié à la ligne de
  retour. Aucun nouveau type de mouvement n’est créé.
- Remboursements `pending + claimed + succeeded` ≤ paiement `succeeded`.
- Une issue réseau ambiguë est reprise avec la même clé ; elle ne devient jamais un
  faux succès ou un faux échec.
- Les transitions, leases, clés et reçus sont imposés dans le domaine et dans D1.
- Livraison, retour et remboursement ne réécrivent pas les états terminaux commande
  `paid` et paiement `succeeded`.
- Les e-mails partent une fois depuis les événements D1 exacts : demande reçue,
  colis remis, remboursement réussi.
- Aucun PII, adresse, payload brut ou texte libre dans l’audit.

## Tests veto minimaux

- Migration réelle : base vide `0000→0005`, upgrade peuplé `0004→0005`, replay,
  contraintes, journal et snapshots sans drift.
- Zones/devis : zéro actif, activation incomplète refusée, territoires exclus, devis
  expiré/modifié/croisé refusé, sélection concurrente unique, paiement tardif accepté.
- Expédition : dépendance absente fermée, reçu incohérent refusé, lease unique, même
  clé après ambiguïté, impayé refusé, douane exigée au handover hors UE.
- Suivi : événement forgé/croisé refusé, doublon sans effet, append-only, ordre
  d’arrivée non supposé chronologique.
- Retours : session invitée expirée/croisée refusée sans révélation, demande toujours
  enregistrable, sur-retour refusé, inspection mixte correcte, double réassort impossible.
- Remboursements : sur-remboursement concurrent et reçu incohérent refusés ; même clé
  après ambiguïté ; commande et paiement jamais réécrits.
- Exploitation : trois e-mails exactement une fois, export RGPD utile, preuves légales
  conservées et audit sans données personnelles.
- Non-régression : suite complète I06, build, lint, types et migrations verts.

## Non-objectifs

Prestataire réel, secrets, KYC, argent, moteur fiscal/douanier, génération ou dépôt
automatique de documents, multi-entrepôts, multi-colis, split shipment, échanges,
avoirs, fraude sur mesure, marketplace, promotions, UI publique et production.
