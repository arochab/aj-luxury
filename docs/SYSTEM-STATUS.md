# AJ Luxury — état opérationnel courant

Statut : `SOURCE DE STATUT COURANTE — À METTRE À JOUR APRÈS CHAQUE RELEASE`

Dernière vérification consignée : 1er septembre 2026

## Verdict

La production actuellement prouvée reste en mode **contrôlé**, pas en ouverture
publique commerce. La release `af95e25` est déployée : elle ajoute le stock dans
Admin et la relance unique, protégée et traçable de l’étiquette de la première
commande historique. Sa migration additive, sa santé runtime, ses accès et ses
218 tests de dernière ligne ont été prouvés le 1er septembre 2026.

## Production actuellement prouvée

| Élément | Valeur vérifiée |
|---|---|
| Domaine | `https://ajluxurystore.com` |
| Endpoint de santé | `https://ajluxurystore.com/api/commerce/health` |
| SHA déclaré | `af95e25d21aad7f4d5e32565c49a7e8809bf288e` |
| Worker/Assets | `ff6a9c55-b4de-4533-8a84-ecfc09f332d1` |
| Déploiement Cloudflare | `4a975427-08d9-4c44-9968-267a147d6895` |
| Proof ID | `AJL-AF95E25-CONTROLLED-20260901T173332Z` |
| Mode commerce | `controlled` |
| Commande publique | `false` |
| Création automatique d’expédition | activée dans la santé du runtime contrôlé |
| Console Admin | `/operations`, protégée par Cloudflare Access et session applicative |
| Accès anonyme Admin/API | refusé avant accès aux données |

Conséquence : ne pas annoncer une ouverture publique ni démarrer une campagne
commerciale tant qu’une promotion distincte n’a pas été prouvée avec
`mode=live` et `publicCommerce=true` sur le même SHA.

## Première commande réelle

| Élément | État |
|---|---|
| Commande | `AJ-41B58D96CCAAE37F00B8` |
| Paiement | confirmé par Stripe, 55,03 EUR |
| Facture | `AJL-2026-000001` |
| Stock | 2 unités vendues comptabilisées dans la base courante |
| Expédition | échec fournisseur historique, sans référence colis, tracking ni étiquette |
| Cause opératoire | téléphone destinataire absent du snapshot historique |
| Correction déployée | saisie E.164 par Jérémy, autorisation unique consommable une fois, même shipment et même clé d’idempotence |

La correction ne modifie jamais l’adresse payée. Elle fournit uniquement le
téléphone exigé par le transporteur. Si le résultat fournisseur devient ambigu,
le système interdit un second clic afin d’éviter une seconde étiquette et une
double facturation.

## Stock courant de référence

| Mesure | Quantité |
|---|---:|
| Physique | 749 |
| Réservé cadeaux | 23 |
| Vendu | 2 |
| Disponible | 724 |

Le détail des douze variantes se trouve dans le manifeste stock. Après
déploiement du candidat, l’écran Admin lit ces valeurs directement depuis D1 ;
il devient alors la source opérationnelle quotidienne.

## Fonctions désormais déployées

- tableau Stock global et par référence dans Admin ;
- détails commande, paiement, e-mails, facture et avoirs conservés ;
- gestion des codes promo conservée ;
- téléchargement de l’étiquette A4 existante conservé ;
- relance exceptionnelle de la première expédition, une seule fois ;
- migration additive D1 `0031_failed_shipment_admin_retry.sql` ;
- tests d’idempotence, de transitions D1 et de protection du retry ;
- documentation opérateur et release alignée sur la migration 0031.

## Dernière recette contrôlée

| Contrôle | Résultat |
|---|---|
| `APP_ENV=production npm test` | PASS, chaîne complète |
| `APP_ENV=production npm run lint` | PASS |
| Build production et frontières analytics | PASS |
| Migrations D1 jusqu’à 0031 et rejeu | PASS |
| Commerce/Admin/stock/promotions/factures | PASS |
| Fulfillment, retry historique et Sendcloud simulé | PASS |
| Rendu desktop/mobile, i18n et cadrage produits | PASS |
| `git diff --check` | PASS |
| Migration D1 `0031` | PASS, appliquée seule |
| Santé canonique | PASS, `ready`, `controlled`, aucun blocker |
| Accès anonyme | commerce `403`, Admin et API Admin `302` Access |
| Routes publiques essentielles | PASS, toutes en `200` |
| Tests après déploiement | PASS, 218/218 |
| Vérification visuelle | PASS desktop et mobile 390×844, aucune erreur console |

Ces tests n’appellent pas les comptes réels Stripe, Sendcloud ou Resend et
n’achètent aucune étiquette. La preuve terrain reste donc distincte.

## Ce qui reste à faire, dans l’ordre

1. Jérémy se connecte à `https://ajluxurystore.com/operations` avec une identité
   admise par Cloudflare Access ;
2. il ouvre `AJ-41B58D96CCAAE37F00B8`, vérifie la commande et saisit une seule
   fois le téléphone acheteur `+33659006025` ;
3. il déclenche l’unique relance, télécharge l’étiquette et l’imprime en A4 ;
4. après dépôt physique, il conserve la preuve et confirme la remise dans Admin ;
5. il vérifie ensuite le premier scan et le suivi transporteur ;
6. ne promouvoir `live` qu’avec un nouveau reçu complet et les accords dédiés.

Le reçu technique complet est conservé sous
`docs/internal/evidence/af95e25d21aad7f4d5e32565c49a7e8809bf288e/`.

## Hors périmètre de l’ouverture France/UE

Royaume-Uni, États-Unis et Canada restent fermés tant que les codes douaniers,
documents, services transporteur, coûts et colis tests propres à chaque zone ne
sont pas prouvés. Cette fermeture doit rester explicite ; elle ne doit ni
inventer une disponibilité internationale ni altérer les options France/UE.
