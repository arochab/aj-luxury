# AJ Luxury — registre des visuels éditoriaux Isabelle

**Statut : CANDIDAT PRIVÉ — aucune promotion publique autorisée par ce registre**

**Date : 15 août 2026**

## Source retrouvée

Les visuels ont été retrouvés dans le coffre GitHub privé
`arochab/aj-luxury-private-vault`, release draft
`local-migration-2026-08-11`.

- Archive source du coffre : `aj-luxury-source-media-2026-08-11.zip`
- SHA-256 vérifié : `ee5170d27f1557b0865c329e8cb3d39e84952ade83fdb02905676e214c6e5280`
- Archive interne : `inputs_assets/inputs/PHOTOS IA AJ LUXURY 1.zip`
- SHA-256 vérifié : `b6daa955d92a0a3fbe0de6071ee488753eaf5a32d22a54fcef920237d7453b33`

L’archive interne contient sept images. Trois compositions sans mannequin ont été
retenues pour le candidat éditorial : boxer Apollon, socle en marbre, lyre, arc,
flèches et laurier.

## Dérivés web intégrés

Les PNG sources restent dans le coffre privé. Le dépôt applicatif contient
uniquement des dérivés WebP sans métadonnées, à la définition source
`1024 × 1536`, afin de limiter le transfert réseau.

| Coloris | Source privée | SHA-256 source | Dérivé web | Octets | SHA-256 dérivé |
|---|---|---|---|---:|---|
| Rose Velours | `LUXURY PINK 1.png` | `f76717224b569974c67732b5b569c779ba61991aa79f01a34e4286937335b83c` | `public/images/editorial/isabelle-apollon/apollon-rose-lyre-v1.webp` | 123 358 | `031e34845ed68f71cd7dfbbb7c5a31e67abbcf4fa2097b85fe8be7adcdddf15d` |
| Lilas Céleste | `LUXURY PURPLE 1.png` | `bf9e874c3181da342f4f5ee0d0bfe29dc0d72a6f4f084e906d93df83f4c9cdcb` | `public/images/editorial/isabelle-apollon/apollon-lilas-lyre-v1.webp` | 131 994 | `14d1b618087d444a7546d092b7abbcfcaf4dadc9b41134dc662f44dc9be427d9` |
| Pourpre Impérial | `LUXURY RED 2.png` | `2f4120951c7ee5d971460d3163048447194f7543eb8e9988a6818269c9d6daa0` | `public/images/editorial/isabelle-apollon/apollon-pourpre-lyre-v1.webp` | 126 556 | `5357acfff4fc48eb2f5c7f8e6d12299f4c7b74584438f61de9cea835084c92d6` |

Les dérivés sont réservés à la narration de campagne. Ils ne remplacent pas les
photographies client sur les fiches produit et ne constituent pas une preuve
contractuelle de coupe, couleur ou finition.

## Identité et vidéo d’accueil

Le candidat conserve le Hero V4 existant. La couche d’identité porte
`data-identity-source="client-approved-campaign-photo"` et utilise uniquement les
visages issus de la photographie client autorisée. Le cadrage protège les deux
visages, les deux torses et les deux sous-vêtements. Aucun visage, corps ou produit
supplémentaire n’est généré, et aucun nouveau détourage n’est introduit par cette
passe.

Références de contrôle :

- `app/components/HeroIdentityOverlay.tsx`
- `docs/internal/AJ-LUXURY-VISUAL-WORKFLOW-2026-08-13.md`
- `docs/VIDEO-CANDIDATE-V4-2026-08-10.md`

## Gate de publication

Avant toute promotion publique du candidat :

1. revue visuelle du lien privé par Adam ;
2. validation par Jérémy du même lien et de la même version ;
3. confirmation du périmètre d’usage des trois visuels éditoriaux ;
4. validation responsive, accessibilité, performance et fidélité produit ;
5. sauvegarde d’une version Sites distincte et maintien du rollback actuel.
