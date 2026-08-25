# AJ Luxury — réconciliation stock de lancement

Statut : `CURRENT — PRODUCTION IMPORT BLOCKED PENDING EXACT MANIFEST APPROVAL`

## Verdict

Le catalogue peut afficher 730 unités vendables, réparties aussi équitablement
que les nombres entiers le permettent entre 3 coloris et 4 tailles. Les packs
de 2 et 3 ne possèdent aucun stock propre : ils consomment exclusivement les
SKU unitaires sélectionnés.

Le manifeste de production reste bloqué tant que Jérémy n’a pas confirmé les
12 quantités physiques et approuvé l’empreinte exacte de cette ventilation.

## Faits

- `FACT — Adam, 2026-08-25` : 756 unités physiques au total.
- `FACT — Adam, 2026-08-25` : 730 unités à la vente et 26 destinées aux
  cadeaux/réserve.
- `FACT — Jérémy, 2026-08-25` : les futurs cadeaux, tailles et coloris ne sont
  pas encore connus.
- `DECIDED — Jérémy, 2026-08-25` : pack 2 à 49,99 €, pack 3 à 69,99 € ; mêmes
  couleurs ou couleurs mixtes autorisées ; disponibilité calculée depuis les
  produits unitaires.

## Ventilation commerciale équilibrée proposée

La grille ci-dessous est une allocation de capacité commerciale, pas la preuve
d’un comptage physique par SKU. Elle totalise exactement 730 unités vendables.

| Coloris | S | M | L | XL | Total |
|---|---:|---:|---:|---:|---:|
| Pourpre Impérial | 60 | 61 | 61 | 61 | 243 |
| Rose Velours | 61 | 61 | 61 | 61 | 244 |
| Lilas Céleste | 61 | 61 | 61 | 60 | 243 |
| **Total** | **182** | **183** | **183** | **182** | **730** |

L’hypothèse technique actuelle est de 63 unités physiques sur chacun des 12
SKU. Les 26 unités non vendables sont donc provisionnellement distribuées 3/2
par SKU afin de maintenir le plafond global à 730. Cette hypothèse doit être
remplacée si le comptage physique réel diffère.

## Gates

- `BLOCKED — Jérémy` : confirmer ou corriger les 12 quantités physiques.
- `BLOCKED — Jérémy` : approuver le manifeste exact et son SHA-256 en tant que
  responsable stock.
- `BLOCKED — Adam` : approuver le même manifeste et le même SHA de release en
  tant que responsable de mise en ligne.
- `NEXT ACTION` : compléter `LAUNCH-STOCK-IMPORT.template.json`, calculer son
  SHA-256 canonique puis recueillir les deux attestations distinctes. La route
  one-shot owner-only importe ensuite ce payload exact ; aucun seed, template
  ou calcul provisoire ne vaut autorisation d’import.
