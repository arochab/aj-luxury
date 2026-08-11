# Gate de migration D1

Statut au 11 août 2026 : procédure locale, aucune base D1 réelle identifiée ni
preuve de cible réelle fournie dans le périmètre de ce candidat.

## Chaîne supportée

La chaîne canonique est strictement :

1. `0000_flimsy_rhino.sql` — SHA-256 normalisé LF
   `6e6262fa635e9808c00493adb1badbf51a1c3d75b2e1112fe567632c526859b4` ;
2. `0001_lock_cart_line_price_provenance.sql` — SHA-256 normalisé LF
   `bef3cc80b9201217050dd5e80362927f3c560bb1c239ac8fd08de2f88aaf08de` ;
3. `0002_lock_order_line_snapshots.sql` — SHA-256 normalisé LF
   `fe72f739c3459f931830054715b8efc268ab86c42d2479d99b4cedc7fe2196fa`.

Les seuls points de départ couverts par la preuve Wrangler locale sont une base
vide, la baseline finale `0000`, et `0000+0001`. Chaque chemin conserve ses
sentinelles et un second passage ne réapplique aucune migration.

`0000_awesome_owl` est classé **état local pré-intégration non supporté**. Il ne
constitue ni une baseline canonique ni une cible présumée. Aucun bridge n’est
construit sans preuve en lecture seule qu’une base D1 réelle possède exactement
cet historique. Si cette preuve apparaît, la migration est stoppée et un bridge
séparé est conçu à partir du schéma et des données réellement observés.

## Gate obligatoire avant une future cible réelle

Avant toute écriture, l’opérateur autorisé doit enregistrer le nom de la cible,
son environnement, son historique `d1_migrations`, un snapshot restaurable et les
résultats des contrôles en lecture seule suivants :

```sql
SELECT id, name, applied_at FROM d1_migrations ORDER BY id;

SELECT COUNT(*) AS open_carts
FROM carts
WHERE status = 'open';

SELECT COUNT(*) AS open_cart_lines
FROM cart_lines AS line
INNER JOIN carts AS cart ON cart.id = line.cart_id
WHERE cart.status = 'open';

SELECT reservation.status, COUNT(*) AS reservations
FROM stock_reservations AS reservation
INNER JOIN carts AS cart ON cart.id = reservation.cart_id
WHERE cart.status = 'open'
GROUP BY reservation.status;

SELECT COUNT(*) AS orders_from_open_carts
FROM orders AS customer_order
INNER JOIN carts AS cart ON cart.id = customer_order.cart_id
WHERE cart.status = 'open';

SELECT inventory.variant_id,
  inventory.active_reserved_quantity,
  COALESCE(active.total, 0) AS expected_active,
  inventory.sold_quantity,
  COALESCE(sold.total, 0) AS expected_sold
FROM inventory
LEFT JOIN (
  SELECT variant_id, SUM(quantity) AS total
  FROM stock_reservations
  WHERE status = 'active'
  GROUP BY variant_id
) AS active ON active.variant_id = inventory.variant_id
LEFT JOIN (
  SELECT variant_id, SUM(quantity) AS total
  FROM stock_reservations
  WHERE status = 'converted'
  GROUP BY variant_id
) AS sold ON sold.variant_id = inventory.variant_id
WHERE inventory.active_reserved_quantity <> COALESCE(active.total, 0)
   OR inventory.sold_quantity <> COALESCE(sold.total, 0);
```

Si la cible n’a pas encore `0001`, tout panier encore ouvert est un panier
pré-`0001` dont la provenance du prix n’a pas bénéficié des guards actuels. Le
gate est alors bloqué tant que ces paniers n’ont pas été exportés pour audit puis
expirés selon une opération métier approuvée. Les réservations actives doivent
être libérées de façon cohérente avec le ledger de stock; aucune suppression SQL
ad hoc ne tient lieu d’expiration. Les commandes déjà créées sont conservées et
réconciliées séparément. L’inventaire est recontrôlé avant de reprendre la
migration.

Si les compteurs sont à zéro et que l’historique correspond à l’un des trois
états supportés, le gate peut passer après preuve de restauration du snapshot.
À la date de ce document, il n’existe aucun panier réel à traiter dans le
périmètre observé : seulement des bases locales éphémères de test.

## Garanties et retour arrière

`0002` rend `order_lines` append-only. Une ligne ne peut naître que sur une
commande `pending_payment` reliée à un panier ouvert, et doit correspondre à la
`cart_line` ainsi qu’à l’identité catalogue observée à cet instant : variante,
référence interne, libellé produit, couleur, taille, quantité et prix. Elle ne
peut ensuite être ni modifiée ni supprimée, directement ou par cascade. Le
paiement compare les snapshots figés commande/panier et les réservations; il ne
relit jamais les libellés du catalogue vivant. Un renommage produit légitime
après création du snapshot ne bloque donc pas le paiement et le reçu conserve le
libellé historique.

Les champs snapshot de l’en-tête de commande sont immuables dès la création.
Une commande naît exclusivement en `pending_payment`. Les transitions autorisées
sont uniquement `pending_payment -> paid|cancelled`. Les états historiques
`preparing`, `shipped` et `refunded` sont conservés mais terminaux dans `0002` :
aucune nouvelle commande ne peut y entrer tant que D03 n’a pas ajouté ses preuves
d’expédition, de livraison et de remboursement. `paid_at` et `updated_at` sont
des timestamps UTC stricts et croissants, et aucun retour vers un état antérieur
n’est admis.

Une `cart_line` ne peut être ajoutée, supprimée ou changer de quantité que si son
panier existe, est ouvert, n’est pas expiré et ne possède ni réservation
historique ni commande. Le panier parent ne peut être
supprimé qu’après retrait légitime de toutes ses lignes et seulement s’il ne
possède aucune réservation, quel que soit son statut, et aucune commande. Cette
règle empêche une cascade d’effacer une réservation active sans corriger les
compteurs de stock.

Toute réservation naît en `active`, avec identité et timestamps figés. Elle doit
viser une ligne du même panier et de la même variante; la somme des réservations
actives ne peut jamais dépasser la quantité de cette ligne. Une insertion sans
ligne ou au-delà de la quantité panier est annulée avec ses effets de stock. Elle ne
peut évoluer qu’une fois vers `released`, `expired` ou `converted`, avec une clé
de transition; une conversion exige une commande du même panier et un paiement
`succeeded` cohérent. Les réservations sont conservées dans tous les états et ne
peuvent jamais être supprimées. Les compteurs `active_reserved_quantity` et
`sold_quantity`, ainsi que leur incrément de version, doivent à chaque mise à
jour correspondre exactement aux réservations persistées; une ligne d’inventaire
ne peut pas être supprimée. Une variante à stock
physique nul reste valide et ne crée simplement aucun mouvement initial de
quantité nulle.

`physical_quantity`, `gift_reserve_quantity` et `safety_reserve_quantity` ne
peuvent pas être modifiés directement. L’unique commande autorisée est l’insertion
d’un mouvement immuable et idempotent : `adjustment` avec
`physical_increase|physical_decrease`, `gift_allocation` avec
`gift_reserve_increase|gift_reserve_decrease`, ou `safety_allocation` avec
`safety_reserve_increase|safety_reserve_decrease`. Cette insertion applique dans
la même instruction un seul delta exact, incrémente la version d’une unité et
avance strictement le timestamp. Si le delta rend l’inventaire impossible, le
mouvement et la variation sont annulés ensemble. Un replay de la même clé ne
réapplique pas le delta.

Un paiement naît en `created`, ou exceptionnellement directement en `succeeded`
si un webhook `payment.succeeded` vérifié et exactement correspondant existe
déjà. Les transitions fermées sont `created -> requires_action` puis
`created|requires_action -> succeeded|failed|expired`. `failure_code` est nul
pour `created`, `requires_action`, `succeeded` et `expired`, et obligatoire pour
`failed`. Les états terminaux sont immuables. Un webhook `processed` est lui aussi
terminal et intégralement immuable; le replay du même événement devient un no-op
et n’incrémente pas son compteur. Aucune preuve webhook ne peut être supprimée.
Les timestamps des commandes, réservations,
paiements, webhooks, mouvements de stock et entrées d’audit sont UTC stricts;
le ledger et l’audit sont append-only.

`refunded` reste volontairement inaccessible à tout nouveau paiement dans
`0002`. D03 devra définir sa preuve fournisseur, sa transition comptable et ses
effets avant de remplacer explicitement le guard de commande. Il devra de même
fournir les preuves requises avant d’ouvrir `preparing` puis `shipped`, ainsi que
la correspondance entre `shipped` en D1 et `fulfilled` dans le contrat public.

Pour D02, la pseudonymisation client doit être douce et ciblée. Il ne faut pas
supprimer une ligne `customers` pour compter sur `ON DELETE SET NULL` :
l’en-tête de commande est immuable et neutralise cette cascade. D02 doit
pseudonymiser les champs personnels autorisés sur `customers` tout en conservant
les snapshots de commande soumis aux obligations de preuve et de conservation.

Les migrations sont forward-only. Le retour arrière d’une future cible réelle
consiste à restaurer le snapshot D1 pris au gate, puis à vérifier l’historique des
migrations et les sentinelles. Supprimer manuellement les triggers sur une cible
partiellement traitée n’est pas un rollback accepté.
