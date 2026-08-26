# AJ Luxury — réconciliation stock de lancement

Statut : `CURRENT — SOURCE GRID AND ALLOCATION DECIDED; EXACT PAYLOAD APPROVAL REQUIRED`

## Verdict

Le catalogue dispose maintenant de 726 unités vendables, soit 242 par coloris,
après ventilation des 23 cadeaux restant à remettre. Les packs
de 2 et 3 ne possèdent aucun stock propre : ils consomment exclusivement les
SKU unitaires sélectionnés.

Le manifeste de production reste soumis aux deux approbations portant sur son
empreinte exacte. Le présent document ne vaut ni import ni activation.
`LAUNCH-STOCK-PAYLOAD.20260825.json` est conservé comme preuve historique du
modèle 63 × 12 désormais remplacé ; seul le template v2 courant doit être daté
et signé pour ce candidat.

## Faits

- `FACT — Adam, 2026-08-26` : 756 unités initiales, 4 déjà vendues et 26
  cadeaux au total.
- `FACT — fiche courante transmise, 2026-08-26` : 749 pièces encore
  physiquement présentes après les 4 ventes et 3 cadeaux déjà remis.
- `DECIDED — Adam, 2026-08-26` : les 23 cadeaux restants sont ventilés par
  variante selon la grille ci-dessous, sans réserve sécurité ni SAV additionnelle.
- `DECIDED — Jérémy, 2026-08-25` : pack 2 à 49,99 €, pack 3 à 69,99 € ; mêmes
  couleurs ou couleurs mixtes autorisées ; disponibilité calculée depuis les
  produits unitaires.

## Grille opérationnelle décidée

| Coloris | Taille | Courant | Cadeaux restants | Vendable |
|---|---:|---:|---:|---:|
| Pourpre Impérial | S | 26 | 2 | 24 |
| Pourpre Impérial | M | 102 | 2 | 100 |
| Pourpre Impérial | L | 87 | 2 | 85 |
| Pourpre Impérial | XL | 35 | 2 | 33 |
| Lilas Céleste | S | 26 | 2 | 24 |
| Lilas Céleste | M | 100 | 1 | 99 |
| Lilas Céleste | L | 88 | 2 | 86 |
| Lilas Céleste | XL | 35 | 2 | 33 |
| Rose Velours | S | 26 | 2 | 24 |
| Rose Velours | M | 102 | 2 | 100 |
| Rose Velours | L | 87 | 2 | 85 |
| Rose Velours | XL | 35 | 2 | 33 |
| **Total** |  | **749** | **23** | **726** |

Les 3 cadeaux déjà remis sont rattachés aux tailles M des trois coloris. La
ventilation cumulée des 26 cadeaux est donc de 2 unités par variante, sauf
Pourpre M et Rose M à 3. Cette ventilation est une décision opérationnelle
d’Adam dérivée de la fiche, pas un fait attribué au fournisseur.

## Gates

- `BLOCKED — Jérémy` : approuver le manifeste exact et son SHA-256 en tant que
  responsable stock.
- `BLOCKED — Adam` : approuver le même manifeste et le même SHA de release en
  tant que responsable de mise en ligne.
- `NEXT ACTION` : dater `LAUNCH-STOCK-IMPORT.template.json`, calculer son
  SHA-256 canonique puis recueillir les deux attestations distinctes. La route
  one-shot owner-only importe ensuite ce payload exact ; aucun seed, template
  ou calcul provisoire ne vaut autorisation d’import.
