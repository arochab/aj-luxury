# AJ Luxury — état opérationnel courant

Statut : `SOURCE DE STATUT COURANTE — À METTRE À JOUR APRÈS CHAQUE RELEASE`

Dernière vérification consignée : 1er septembre 2026

## Verdict

La production actuellement prouvée reste en mode **contrôlé**, pas en ouverture
publique commerce. Le candidat local ajoute le stock dans Admin et la relance
unique, protégée et traçable de l’étiquette de la première commande historique.
Sa recette locale complète est passée ; il n’est pas déployé tant que son commit
exact n’a pas été gelé et approuvé par Adam puis Jérémy.

## Production actuellement prouvée

| Élément | Valeur vérifiée |
|---|---|
| Domaine | `https://ajluxurystore.com` |
| Endpoint de santé | `https://ajluxurystore.com/api/commerce/health` |
| SHA déclaré | `917033289e73afa03c19cc6c741601a5570797ca` |
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
| Correction candidate | saisie E.164 par Jérémy, autorisation unique consommable une fois, même shipment et même clé d’idempotence |

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

## Contenu du candidat local

- tableau Stock global et par référence dans Admin ;
- détails commande, paiement, e-mails, facture et avoirs conservés ;
- gestion des codes promo conservée ;
- téléchargement de l’étiquette A4 existante conservé ;
- relance exceptionnelle de la première expédition, une seule fois ;
- migration additive D1 `0031_failed_shipment_admin_retry.sql` ;
- tests d’idempotence, de transitions D1 et de protection du retry ;
- documentation opérateur et release alignée sur la migration 0031.

## Dernière recette locale

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

Ces tests n’appellent pas les comptes réels Stripe, Sendcloud ou Resend et
n’achètent aucune étiquette. La preuve terrain reste donc distincte.

## Ce qui reste à faire, dans l’ordre

1. geler un commit unique et publier son SHA ;
2. recueillir les deux approbations exactes Adam et Jérémy pour ce SHA ;
3. sauvegarder D1 et appliquer la migration 0031 ;
4. déployer Worker puis Assets depuis le même SHA en mode contrôlé ;
5. prouver la santé, l’accès Admin, les commandes, le stock et les promotions ;
6. laisser Jérémy créer/télécharger une seule fois l’étiquette de la première
   commande puis l’imprimer en A4 ;
7. après dépôt réel, conserver la preuve et confirmer la remise dans Admin ;
8. ne promouvoir `live` qu’avec un nouveau reçu complet et les accords dédiés.

## Hors périmètre de l’ouverture France/UE

Royaume-Uni, États-Unis et Canada restent fermés tant que les codes douaniers,
documents, services transporteur, coûts et colis tests propres à chaque zone ne
sont pas prouvés. Cette fermeture doit rester explicite ; elle ne doit ni
inventer une disponibilité internationale ni altérer les options France/UE.
