# Retours Jérémy — lot du 30 juillet 2026

## Objet

Ce document relie chaque retour transmis par Jérémy à une correction, un critère
d’acceptation et une preuve. Il distingue les validations, les modifications
demandées, les règles métier et les demandes de création qui nécessitent encore
un livrable visuel.

## Sources

- 10 captures WhatsApp transmises le 30 juillet 2026.
- Version de référence auditée : prévisualisation AJ Luxury publiée avant ce lot.
- Responsabilité de mise en œuvre et de recette : Adam CHABBI.

## Éléments validés à préserver

| ID | Validation client | Critère de non-régression |
| --- | --- | --- |
| VAL-01 | Léger zoom au survol du trio éditorial | Le zoom reste fluide, discret et ne coupe ni visage ni produit. |
| VAL-02 | Cartes et léger zoom de la Boutique | Agencement, mouvement et accès aux fiches restent inchangés. |
| VAL-03 | Qualificatifs des trois coloris | Les formulations approuvées sont conservées. |
| VAL-04 | Colonne d’achat et descriptions regroupées | Les informations produit restent disponibles dans la colonne d’achat. |
| VAL-05 | Sélecteur de langues du footer | Les cinq langues et leur navigation restent disponibles. |
| VAL-06 | Répartition Rose : deux photos d’Alex et deux de Jérémy | La parité est contrôlée après réordonnancement éventuel. |

## Modifications demandées

| ID | Zone | Retour client | Correctif attendu | Statut |
| --- | --- | --- | --- | --- |
| FB-01 | Accueil, trio éditorial | Alex à gauche, Jérémy à droite ; une photo Rose, une Pourpre et une Lilas | Recomposer le trio sans modifier le zoom validé | **Appliqué et testé** |
| FB-02 | Accessibilité des images | Les personnes doivent être correctement identifiées | Corriger les textes alternatifs et vérifier toutes les occurrences | **Appliqué et testé** |
| FB-03 | Notre Histoire, section « Portée par ceux qui la construisent » | Supprimer les bandes grises ; afficher une photo pleine | Adapter le cadre et le point focal sans déformer ni masquer le boxer | **Appliqué et testé** |
| FB-04 | Notre Histoire, même section | Le discours doit permettre d’intégrer de futurs shootings et collaborations | Réécrire les deux paragraphes sans présenter un projet futur comme déjà réalisé | **Appliqué et testé** |
| FB-05 | Notre Histoire, définition du luxe | « Pas d’excès, simplement la justesse des détails » | Utiliser : « Pas d’excès. Simplement la justesse des détails. » | **Appliqué et testé** |
| FB-06 | Notre Histoire, conclusion | AJ Luxury plus grand et métallisé | Utiliser le véritable bloc de marque avec un traitement argenté sobre | **Appliqué et testé** |
| FB-07 | Fiche Pourpre | Ajouter une photo supplémentaire de Jérémy | Ajouter une vue pertinente sans supprimer les vues techniques | **Appliqué et testé : 5 vues** |
| FB-08 | Fiche Rose | Agrandir les photos et supprimer les bandes grises | Reprendre ratios, cadres et points focaux ; conserver deux photos de chaque fondateur | **Appliqué et testé : 4 vues** |
| FB-09 | Fiche Lilas | Supprimer les bandes grises | Même traitement que Rose, sans recadrage destructeur | **Appliqué et testé : 5 vues** |

## Règle métier stock

| ID | Exigence | Critère d’acceptation | Statut |
| --- | --- | --- | --- |
| STOCK-01 | Ne jamais publier le stock complet | Aucun compte exact supérieur à 5 dans l’interface, les attributs accessibles ou les données envoyées au navigateur | **Appliqué et testé** |
| STOCK-02 | Afficher un compte uniquement à 5 pièces ou moins | Disponible au-dessus de 5 ; Plus que 5 à 1 ; Épuisé à 0 | **Appliqué et testé** |
| STOCK-03 | Séparer les lots de stock | Distinguer stock physique, réservé et disponible à la vente dans le modèle interne | **Modèle interne préparé** |
| STOCK-04 | Empêcher une vente sans stock | Une taille épuisée est désactivée et ne peut pas être ajoutée au panier | **Appliqué et testé** |

## Chantier créatif séparé

| ID | Demande | Traitement |
| --- | --- | --- |
| ART-01 | Explorer avec Isabelle des visuels IA plus conceptuels | Préparer un brief original AJ Luxury, produire les visuels hors du code du site, puis décider de leur emplacement après validation. Aucune copie directe de la référence. |

Le brief de production est disponible dans
`docs/BRIEF-VISUELS-IA-ISABELLE-2026-07-30.md`. La production des visuels reste
volontairement séparée du code et soumise à validation avant intégration.

## Matrice de recette prévue

- Largeurs : 320, 390, 768, 1024, 1440 et 1920 px.
- Pages : accueil, Boutique, Notre Histoire et les trois fiches produit.
- Interactions : survol, zoom, navigation clavier, galerie tactile et sélection de taille.
- Visuels : visage, boxer, ceinture et logo contrôlés ; aucune bande grise parasite.
- Données : aucune quantité supérieure à 5 dans le HTML, les attributs ARIA ou
  les propriétés reçues par le composant client.
- Non-régression : textes validés, langues, liens, prix et panier.

## Preuves d’exécution avant publication

- **Code :** build de production et lint sans erreur.
- **Tests automatisés :** 38 tests réussis, dont 4 contrôles dédiés à la
  confidentialité du stock.
- **Données publiques :** bundle client, HTML produit, panier et checkout
  contrôlés ; aucune quantité métier exacte n’est transmise.
- **Responsive :** 36 combinaisons contrôlées, soit 6 pages sur 6 largeurs
  (320, 390, 768, 1024, 1440 et 1920 px), sans débordement horizontal ni image
  cassée.
- **Galeries :** compteurs contrôlés à 05/05 pour Pourpre, 04/04 pour Rose et
  05/05 pour Lilas ; ouverture, flèches clavier, fermeture Échap et restitution
  du focus vérifiées.
- **Achat :** sélection de taille, état public de disponibilité et activation du
  bouton panier vérifiés.
- **Visuels :** ratios adaptés aux sources portrait et paysage ; aucun fond gris
  ajouté pour compenser un mauvais ratio.

## Preuves de publication

- **Commit de l’implémentation validée :**
  `70a9bfda3dcc75f78a860d54a7d8d95ea44b1a59`.
- **Cloudflare public :**
  `https://aj-luxury-preview.adam-chabbi94.workers.dev/`.
- **Cloudflare Version ID :**
  `2e0f919c-5847-415c-85aa-af4547f924aa`.
- **Sites, version 13 :**
  `https://aj-luxury-preview.arochab.chatgpt.site`.
- Les deux environnements ont été construits à partir du même commit et la
  version Cloudflare a fait l’objet d’un contrôle public mobile et ultra-large.

## Jury final indépendant

| Angle | Note | Verdict | Bloqueur |
| --- | ---: | --- | --- |
| Fidélité aux retours de Jérémy | **9,2 / 10** | PASS | Aucun |
| Direction artistique et UX responsive | **8,8 / 10** | PASS | Aucun |
| Architecture e-commerce et confidentialité | **9,1 / 10** | PASS | Aucun |
| **Moyenne** | **9,03 / 10** | **PASS** | **Aucun** |

Le seuil de validation fixé à 8,5 / 10 est franchi sur chaque axe, pas seulement
en moyenne. Les réserves restantes concernent la future mise en production
transactionnelle et la production de nouveaux visuels, pas les correctifs de ce
lot.
