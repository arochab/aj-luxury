# AJ Luxury — standards d’implémentation

Ces règles s’appliquent à toute évolution visuelle du projet, quel que soit l’agent ou l’outil utilisé.

## Mise en page

- Construire les compositions avec une grille, des ratios et des espacements explicites. Aucun correctif ponctuel par marge arbitraire.
- Un espace vide doit servir la hiérarchie, la respiration ou le focus. Un vide créé par deux hauteurs incompatibles est un défaut.
- Deux médias appariés sur une même ligne doivent partager le même cadre et finir à la même hauteur, à 1 px près.
- Les textes d’achat restent alignés à gauche pour la lisibilité. « Centré » signifie ici une composition équilibrée, pas un centrage systématique de chaque élément.
- Préserver en priorité le produit, le logo de ceinture et les visages. Aucun recadrage involontaire.

## Responsive et interactions

- Vérifier les trois fiches produits en 1920×1080, 1440×900, 1280×800, 1024×768, 768×1024, 430×932, 390×844 et 360×800.
- Aucun débordement horizontal du document.
- Les contenus doivent se réorganiser proprement à 320 px de large, sans perte d’information.
- Les cibles interactives principales mesurent au moins 44×44 px.
- Le zoom, le clavier, le focus visible et la fermeture par Échap doivent rester fonctionnels.

## Validation

- Exécuter `npm run lint`, `npm run build` et `npm test` après toute modification fonctionnelle ou visuelle importante.
- Contrôler visuellement les trois coloris, pas seulement une route représentative.
- Avant publication : aucun bloqueur, aucune bande vide accidentelle, aucune coupe de visage et validation finale par un regard design, un regard responsive/accessibilité et un regard client.
- Toute modification validée doit être publiée sur les deux environnements prévus par le projet.
