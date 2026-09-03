# AJ Luxury — architecture commerce courante

Statut : `SOURCE TECHNIQUE COURANTE`

Dernière mise à jour : 3 septembre 2026

## Vue d’ensemble

```text
navigateur client
  ├─ pages et assets Next.js
  └─ API commerce Cloudflare Worker
       ├─ D1 : commandes, stock, comptes, preuves, factures, promotions
       ├─ Stripe : paiement et signaux de règlement/remboursement
       ├─ Resend : e-mails transactionnels et preuves de livraison
       └─ Sendcloud : transport, étiquette A4 et suivi

navigateur administrateur
  └─ compte AJ confirmé + liste fermée → /admin → session Admin D1 + CSRF
```

Cloudflare héberge le frontend et le Worker. D1 est la source interne des états
commerce ; les fournisseurs externes restent l’autorité pour leurs propres
événements — Stripe pour le paiement, Sendcloud pour le transport et Resend pour
la livraison des e-mails.

## Domaines fonctionnels

| Domaine | Responsabilité | Source de vérité |
|---|---|---|
| Catalogue | Apollon, 3 coloris, 4 tailles, prix et disponibilité | D1 + code catalogue versionné |
| Panier | Quantités, variantes, pack, remise et frais | session checkout + validations serveur |
| Stock | Physique, cadeaux, sécurité, réservation, ventes, disponible | ledger et agrégats D1 |
| Paiement | Création Checkout et confirmation finale | Stripe signé, rapproché avec D1 |
| Commande | Snapshot immuable des articles, montants, adresse et CGV | D1 |
| Facturation | Facture après paiement et avoir après remboursement | D1, numérotation continue |
| E-mails | Outbox idempotente et preuve fournisseur | D1 + Resend |
| Livraison | Shipment unique, étiquette A4, tracking et remise | D1 + Sendcloud |
| Promotions | Règle, période, plafond, réservation et consommation | D1 |
| Administration | Commandes, stock, promos, factures et étiquettes | `/admin` + API Admin |

## États essentiels

### Paiement et commande

```text
commande créée → paiement en attente
                ├─ Stripe confirmé → réglée → facture → stock vendu → expédition
                ├─ Stripe refusé    → échec, aucun faux statut payé
                └─ résultat ambigu  → vérification, aucun statut inventé
```

Un rejeu du même événement retrouve les mêmes objets. Il ne recrée ni commande,
ni facture, ni consommation promo, ni expédition.

### Expédition

```text
label_pending → label_claimed → label_ready
                               → handed_over → in_transit → delivered
                    └─ failed, sans preuve fournisseur
```

Une expédition possède une clé d’idempotence stable. Un résultat fournisseur
ambigu bloque toute seconde création. La migration 0031 autorise uniquement la
première commande historique, rejetée faute de téléphone, à repasser de
`failed/provider_rejected` à la création. Cette autorisation :

- est créée par un administrateur identifié ;
- contient uniquement un téléphone E.164 ;
- est consommée atomiquement ;
- ne peut ni être supprimée, ni être remise à zéro, ni être recréée ;
- est impossible si une référence colis, un tracking ou un reçu existe déjà.

### Stock

Le disponible est dérivé des mouvements, jamais d’un nombre saisi dans le
frontend :

```text
disponible = physique
           - cadeaux
           - réserve de sécurité
           - réservations panier actives
           - ventes confirmées
```

Les packs consomment les variantes unitaires sélectionnées ; ils ne possèdent
pas un stock parallèle.

### Promotions

Le code est normalisé et validé côté serveur. La remise est réservée pendant le
checkout, consommée après confirmation du paiement et libérée si la commande
expire ou échoue. Le snapshot de remise d’une commande payée devient immuable.

## Surface Admin

| Route | Usage |
|---|---|
| `/admin` | interface d'Adam et Jérémy |
| `/api/commerce/management/session` | connexion et session nominative |
| `/api/commerce/management/orders` | liste et état des commandes |
| `/api/commerce/management/inventory` | stock global et par référence |
| `/api/commerce/management/promotions` | liste et création des codes promo |
| `/api/commerce/management/orders/{id}/invoice` | facture A4 |
| `/api/commerce/management/orders/{id}/credit-notes/{number}` | avoir A4 |
| `/api/commerce/management/orders/{id}/shipping-label` | étiquette transporteur A4 |
| `/api/commerce/management/shipments/{id}/handover` | confirmation de remise physique |

La connexion exige un compte AJ Luxury dont l'e-mail est confirmé, son mot de
passe et l'appartenance à la liste fermée. Toutes les mutations Admin exigent
ensuite une session courte, un contrôle d'origine, un jeton CSRF et une clé
d'idempotence lorsque l'action peut être rejouée. Cloudflare Access n'intervient
plus dans le parcours humain.

## Accès autorisés

L’allowlist courante contient exactement :

- `adam.chabbi94@gmail.com` ;
- `jeremy@ajluxurystore.com` ;
- `jeremyajluxurystore@gmail.com`.

Le routage e-mail de `jeremy@ajluxurystore.com` vers la boîte dédiée ne remplace
pas l’autorisation d’accès : chaque identité est contrôlée explicitement.

## Migrations

Le candidat courant attend les migrations additives jusqu’à :

- `0028` : promotions ;
- `0029` : factures ;
- `0030` : avoirs ;
- `0031` : relance unique de l’expédition historique.
- `0032` : e-mail opérateur avec documents et activation internationale.

Une migration additive reste en place lors d’un rollback applicatif. Le rollback
standard restaure d’abord le Worker puis les Assets. Une restauration D1 Time
Travel est destructive et exige une décision d’incident séparée.

## Invariants non négociables

- aucun numéro complet de carte ni cryptogramme ne traverse AJ Luxury ;
- aucune commande n’est déclarée réglée sans signal Stripe vérifié ;
- aucune facture n’est modifiée après émission ; un remboursement crée un avoir ;
- aucun second shipment ne peut être créé pour la même commande ;
- aucune remise transporteur n’est confirmée avant le dépôt physique ;
- aucune quantité interne détaillée n’est exposée publiquement ;
- aucun secret, JWT, cookie ou donnée client complète n’entre dans les preuves Git ;
- un mode `controlled` n’est jamais présenté comme une ouverture publique.
