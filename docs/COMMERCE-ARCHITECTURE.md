SUPERSEDED — retained as history — replaced by `docs/BACKEND-LOT-2-ACTION-PLAN.md` on 2026-08-10

# AJ Luxury - fondation commerce de démonstration

## Catalogue réel intégré

- Modèle parent : `Apollon`.
- Trois coloris : Pourpre Impérial, Rose Velours et Lilas Céleste.
- Quatre tailles : S, M, L et XL.
- Douze variantes avec SKU et stock distincts.
- 252 unités par coloris, soit 756 unités annoncées au total.
- Prix non inventé : il reste explicitement à confirmer.

La maquette contient un contrat TypeScript pour le catalogue, les variantes, le
panier, le client, l’adresse, la commande et la session de paiement. Un provider
local rend le parcours testable sans encaissement, compte réel ni persistance.

## Gestion du stock à confirmer

Les quantités reçues sont enregistrées par coloris et taille. La division en
trois lots n’est pas appliquée automatiquement, car plusieurs quantités ne sont
pas divisibles par trois. La réserve influenceurs doit rester un mouvement de
stock distinct afin de ne jamais être confondue avec le stock vendable.

Buckets recommandés :

- `SELLABLE` : disponible à la vente ;
- `REPLENISHMENT` : réassort prévu ;
- `SAFETY` : marge de sécurité ;
- `GIFTING` : dotations influenceurs.

## Frontière de responsabilité

La maquette ne contient aucun secret de paiement, compte réel, conservation
d’adresse, commande persistée, synchronisation de stock ou calcul définitif de
livraison, taxe et retour.

L’intégration de paiement devra être créée côté serveur par la plateforme
retenue. Les données bancaires ne doivent jamais transiter ni être journalisées
par AJ Luxury.

## Décisions requises avant production

1. Prix de vente.
2. Répartition exacte des trois lots.
3. Quantité et processus de sortie du stock influenceurs.
4. Source de vérité du stock et outil d’administration.
5. Plateforme e-commerce et propriété opérationnelle du compte.
6. Livraison, retours, paiements et commande invité ou compte facultatif.
