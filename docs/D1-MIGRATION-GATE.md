# Gate de migration D1

Statut au 11 août 2026 : procédure locale, aucune base D1 réelle identifiée ni
preuve de cible réelle fournie dans le périmètre de ce candidat.

## Chaîne supportée

La chaîne canonique est strictement :

1. `0000_flimsy_rhino.sql`, baseline finale dont le SHA-256 normalisé LF est
   `6e6262fa635e9808c00493adb1badbf51a1c3d75b2e1112fe567632c526859b4` ;
2. `0001_lock_cart_line_price_provenance.sql` ;
3. `0002_lock_order_line_snapshots.sql`.

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

`0002` rend `order_lines` append-only : insertion seulement pour une commande
`pending_payment`, aucune mise à jour, aucune suppression directe et aucune
suppression indirecte par cascade. Après paiement, ajout, modification et retrait
sont donc tous refusés. Les champs snapshot de l’en-tête de commande sont
immuables dès sa création. Seuls `status`, `paid_at` et `updated_at` peuvent
évoluer, sous les règles de transition : entrée dans `paid` uniquement depuis
`pending_payment`, `paid_at` UTC obligatoire, et aucun retour vers
`pending_payment`.

Une `cart_line` ne peut être ajoutée ou supprimée que si son panier existe, est
ouvert, n’est pas expiré et ne possède ni réservation historique ni commande. Les
guards de mise à jour de `0001` restent inchangés. Le panier parent ne peut être
supprimé qu’après retrait légitime de toutes ses lignes et seulement s’il ne
possède aucune réservation, quel que soit son statut, et aucune commande. Cette
règle empêche une cascade d’effacer une réservation active sans corriger les
compteurs de stock.

Toute entrée d’un paiement dans `succeeded`, par insertion ou mise à jour, exige
un événement webhook vérifié correspondant. Identité, commande, fournisseur,
session, montant, devise et clé d’idempotence du paiement sont immuables. Un
paiement `succeeded` ne peut ensuite être ni modifié ni supprimé.

Les migrations sont forward-only. Le retour arrière d’une future cible réelle
consiste à restaurer le snapshot D1 pris au gate, puis à vérifier l’historique des
migrations et les sentinelles. Supprimer manuellement les triggers sur une cible
partiellement traitée n’est pas un rollback accepté.
