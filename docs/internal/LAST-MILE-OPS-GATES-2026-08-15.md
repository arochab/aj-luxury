# AJ Luxury - gates opérations, stock et reporting

Statut au 15/08/2026 : **code prêt à intégrer, aucune capacité réelle activée**.

## Stock

Le manifeste modèle `LAUNCH-STOCK-IMPORT.template.json` contient les 12 variantes et les 756 unités physiques transmises. Les valeurs `-1`, dates vides et empreintes vides sont volontairement non importables.

Gate d'import :

1. Jérémy renseigne pour chaque variante les réserves cadeaux, sécurité et SAV, même si une valeur décidée est zéro.
2. Les cinq totaux sont recalculés. La somme physique doit rester 756 et le vendable doit être `physique - cadeaux - sécurité - SAV`.
3. Le SHA-256 canonique est calculé par `createLaunchStockPayloadSha256`.
4. Le responsable stock et le responsable release, deux personnes distinctes, approuvent ce même SHA-256 après le comptage.
5. `validateLaunchStockImport` doit passer avant toute écriture. Une variante absente, ajoutée, renommée, réordonnée, surallouée, non approuvée ou modifiée après approbation ferme l'import.
6. Après import, contrôler D1 et le ledger : 12 variantes, physique 756, réserves et vendable identiques au manifeste, aucune réservation active inattendue.

La D1 actuelle conserve la réserve cadeaux séparément et combine sécurité + SAV dans `safety_reserve_quantity`. Le manifeste approuvé conserve la ventilation métier. Aucun importeur D1 n'est câblé dans cette branche afin d'éviter une mutation accidentelle.

Les approbations sont des attestations métier liées à une empreinte, pas des signatures électroniques qualifiées.

## E-mails transactionnels

Le port fournisseur, l'outbox D1, les leases, l'idempotence, les retries et la purge existaient déjà. Le dispatcher ajouté :

- vérifie la disponibilité avant de prendre un lease ;
- traite au maximum 25 messages par cycle ;
- n'accepte que des hashes de lease irréversibles ;
- ne renvoie que des compteurs, jamais destinataire, contenu ou référence de commande ;
- reste fermé sans adaptateur fournisseur.

Gate d'activation : compte fournisseur détenu par AJ Luxury, domaine expéditeur validé, SPF/DKIM/DMARC contrôlés, secret injecté hors Git, preuve d'idempotence fournisseur, templates FR/EN relus, tests sandbox succès/rejet/timeout/retry/doublon, alertes sur backlog et échecs terminaux. Aucun e-mail réel n'est envoyé par ce lot.

## Analytics et reporting

`readCommerceOperationsReport` calcule des KPI agrégés directement depuis les enregistrements D1 durables : commandes, paiements, remboursements, stock, expéditions, retours et outbox. Il ne requiert ni SDK tiers, ni cookie, ni pixel. Il ne sélectionne aucune adresse e-mail, adresse postale, référence de suivi, identifiant client, payload ou user-agent.

Gate d'exposition : route owner/admin séparée, autorisation serveur testée, période maximale 366 jours, aucune dimension à faible effectif, export journalisé, sauvegarde/restauration D1 prouvée et définitions KPI validées par Jérémy. Le reporting n'est relié à aucune route dans cette branche.

## Critères de recette de ce lot

- tests ciblés `tests/last-mile-ops.test.mjs` verts ;
- lint du projet vert ;
- build et suite complète verts avant intégration finale ;
- aucune modification de `worker/index.ts`, aucun appel fournisseur, aucun secret, aucun cookie analytics et aucun déploiement.
