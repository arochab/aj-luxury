# Retours design de Jérémy · 31 juillet 2026

Pilote : Adam CHABBI  
Périmètre : accueil, Notre Histoire, navigation et fiches produits

## Registre de traitement

| ID | Retour client | Traitement | Statut | Preuve |
|---|---|---|---|---|
| J31-D01 | Accueil éditorial : Alex en Rose à gauche, duo en Pourpre au centre, Jérémy en Lilas à droite | Trois sources remplacées et ordre verrouillé | Testé | `app/page.tsx`, test d’identité, contrôle responsive |
| J31-D02 | Afficher « Alex & Jérémy » dans cet ordre | Titre, légendes et ordre des portraits corrigés | Testé | `app/notre-histoire/page.tsx`, rendu HTML |
| J31-D03 | Remplacer le portrait de Jérémy par la version retouchée transmise | Source SwissTransfer archivée puis intégrée | Testé | `public/images/client/story-jeremy-retouched.jpeg` |
| J31-D04 | Retirer la mention limitant les fondateurs à la première campagne | Texte pérenne réécrit en FR, EN, ES, DE et IT | Testé | dictionnaires `lib/i18n/dictionaries`, 54 contrôles |
| J31-D05 | Aérer légèrement les séquences de Notre Histoire | Séparateurs courts et responsive ajoutés | Testé | `Story.module.css`, 9 résolutions |
| J31-D06 | Tester une conclusion métallisée avec slogan noir | Bande argentée sobre, texte noir et contraste renforcé | Testé | `Story.module.css`, audit design |
| J31-D07 | Vérifier le centrage exact du menu | Grille symétrique et centre mesuré | Testé | écart mesuré à 0 px sur 9 résolutions |
| J31-D08 | Ajouter un guide des tailles qui s’ouvre au clic | Fenêtre accessible S à XL, sans mesure non validée | Testé | ouverture, Échap, focus, tactile et 44 px contrôlés |
| J31-A01 | Préparer un nouveau visuel d’accueil avec Isabelle | Contraintes techniques conservées, aucun visuel provisoire présenté comme définitif | À produire | validation Jérémy et Alex requise |
| J31-A02 | Explorer une création liée à Apollon | Pistes lyre, arc, laurier ou épée consignées sans intégration prématurée | À produire | choix créatif et contrôle des droits requis |

## Recette de la passe

- Compilation réussie.
- 54 contrôles automatisés réussis sur 54.
- Aucun débordement horizontal sur 1920×1080, 1440×900, 1280×800, 1024×768, 768×1024, 430×932, 390×844, 360×800 et 320×800.
- Navigation centrée sur chaque largeur contrôlée.
- Trois fiches produits contrôlées séparément.
- Quantités internes de stock non exposées.
- Guide des tailles : ouverture, fermeture, Échap, blocage du défilement, piège et restitution du focus contrôlés.

## Éléments encore attendus

- Mesures fabricant définitives du guide des tailles.
- Nouveau visuel d’accueil produit avec Isabelle puis validé par Jérémy et Alex.
- Décision créative sur le visuel conceptuel Apollon avant toute production.
