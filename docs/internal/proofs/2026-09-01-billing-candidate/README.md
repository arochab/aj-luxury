# AJ Luxury — preuves visuelles du candidat facturation

Date : 1er septembre 2026

Ces captures proviennent du build production local final (`APP_ENV=production`),
servi par `vinext start` sur `127.0.0.1:3017`.

| Preuve | Viewport | Vérification |
|---|---:|---|
| `home-horizontal-desktop.png` | 1440 × 1000 | séparation blanche nette, écran Pourpre complet, Alex et produit en `object-fit: contain` |
| `home-horizontal-mobile.png` | 390 × 844 | geste horizontal effectivement déplacé de Pourpre vers Lilas, sans overlap |
| `terms-invoice-credit-note.png` | 1280 × 900 | mention fiscale officielle, facture distincte, avoir distinct et séparation avec l’étiquette transporteur |

Mesures DOM relevées pendant la recette : rail mobile `375 px` de large pour
`1 265 px` de contenu, déplacement horizontal de `437,6 px` sur le premier
geste ; rail desktop `1 425 px` de large pour trois panneaux. Les images de
l’écran 2 étaient toutes rendues en `object-fit: contain`.

