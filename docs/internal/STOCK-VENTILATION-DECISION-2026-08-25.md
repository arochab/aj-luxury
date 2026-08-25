# AJ Luxury — décision de ventilation du stock

Statut : `DECIDED BY ADAM — PRODUCTION IMPORT NOT YET AUTHORIZED`

## Décision

- Date : 25 août 2026.
- Décideur : Adam CHABBI.
- Stock physique : 756 unités.
- Cadeaux : 26 unités.
- Stock vendable : 730 unités.
- Réserves sécurité et SAV supplémentaires : 0.
- Règle : 63 unités physiques sur chacune des 12 variantes, avec la distribution
  entière la plus équilibrée possible du vendable entre coloris et tailles.

730 n’étant pas divisible par 12, une égalité arithmétique stricte est impossible.
La ventilation optimale est de dix variantes à 61 vendables et deux variantes à
60 vendables. Les deux cadeaux supplémentaires sont placés sur Pourpre S et Lilas
XL afin de ne pas les concentrer sur le même coloris ni la même taille.

| Coloris | Taille | Physique | Cadeaux | Vendable |
|---|---:|---:|---:|---:|
| Pourpre Impérial | S | 63 | 3 | 60 |
| Pourpre Impérial | M | 63 | 2 | 61 |
| Pourpre Impérial | L | 63 | 2 | 61 |
| Pourpre Impérial | XL | 63 | 2 | 61 |
| Rose Velours | S | 63 | 2 | 61 |
| Rose Velours | M | 63 | 2 | 61 |
| Rose Velours | L | 63 | 2 | 61 |
| Rose Velours | XL | 63 | 2 | 61 |
| Lilas Céleste | S | 63 | 2 | 61 |
| Lilas Céleste | M | 63 | 2 | 61 |
| Lilas Céleste | L | 63 | 2 | 61 |
| Lilas Céleste | XL | 63 | 3 | 60 |
| **Total** |  | **756** | **26** | **730** |

## Contrôles d’équilibre

- Physique par coloris : 252 / 252 / 252.
- Vendable par coloris : 243 / 244 / 243.
- Physique par taille : 189 / 189 / 189 / 189.
- Vendable par taille : 182 / 183 / 183 / 182.

## Gate restant

Le fichier `LAUNCH-STOCK-IMPORT.template.json` reflète cette décision, mais reste
non importable tant que le comptage daté, l’empreinte du payload et les deux
attestations distinctes `stock_owner` et `release_owner` ne sont pas complétés.
L’autorisation de Jérémy a été rapportée par Adam ; elle n’est pas enregistrée
comme une attestation directe couvrant l’empreinte exacte du manifeste.

NEXT ACTION — Adam et le responsable stock contrôlent les 12 lignes physiques ;
les deux responsables attestent ensuite le même payload lié au SHA de release.
