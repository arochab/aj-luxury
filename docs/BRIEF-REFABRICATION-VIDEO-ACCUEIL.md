# AJ Luxury — cahier des charges, refabrication de la vidéo d'accueil

**Date : 20 août 2026 — document contractuel, opposable au prestataire**

**Donneur d'ordre : Adam CHABBI, pour AJ Luxury.**

Ce document remplace toute discussion orale. Ce qui n'y figure pas n'est pas dû ;
ce qui y figure est dû et mesurable.

## 1. Ce qui est commandé

Le plan d'accueil actuel est un composite : les deux fondateurs y sont posés dans
un décor de marbre et de métal sans passe d'ombre ni passe de reflet propre. Le
sol est un miroir : le tabouret et les socles s'y reflètent correctement, les
deux hommes n'y sont ancrés que par un assombrissement diffus. C'est ce défaut
qui fait lire le collage.

Il est commandé **un nouveau rendu 3D du même plan**, avec les mêmes personnes,
le même univers et le même cadrage, produit en passes séparées et livré avec ses
éléments, de façon à pouvoir corriger l'ancrage au sol sans réengager un tournage.

## 2. Passes séparées exigées

Livrées comme fichiers distincts, non fusionnés, sur la même durée et la même
cadence, en registration parfaite au pixel :

| Passe | Contenu | Format |
|---|---|---|
| `beauty` | rendu complet | ProRes 4444, alpha inclus |
| `shadow_catcher` | ombres portées et de contact seules, sur fond transparent | ProRes 4444 ou EXR 16 bits |
| `reflection` | reflets du sol seuls, sur fond transparent | ProRes 4444 ou EXR 16 bits |
| `matte_talents` | masque alpha des deux mannequins, propre, sans halo | ProRes 4444 ou EXR 16 bits |
| `matte_metal` | masque alpha du métal liquide et de la flaque | idem |
| `depth` | profondeur linéaire | EXR 32 bits |

Une remise ne comportant que le `beauty` aplati est **refusée**.

## 3. Ancrage au sol — le point critique

Le sol est une surface spéculaire. Chaque objet posé dessus doit obéir à la
**même loi**, mesurable dans l'image livrée. La loi ci-dessous a été relevée sur
le rendu actuel, sur deux références indépendantes du plan, et sert de barème :

| Grandeur mesurée sur le sol | Valeur attendue |
|---|---|
| énergie de structure transférée dans le reflet, rapportée à l'objet | 0,29 ± 0,05 |
| compression verticale du reflet | 0,70 à 0,90 selon la profondeur |
| teinte du reflet | légèrement plus froide, bleu supérieur au rouge de 2 à 3 % |
| flou du reflet | croissant avec la distance, gradient conservé à 0,75 au-delà de 60 px en 1080p |
| ombre de contact | dense, courte, luminance ramenée à 0,50 ± 0,08 du sol voisin au point d'appui |

**Chacun des quatre pieds** doit porter une ombre de contact et un reflet obéissant
à cette loi. Un reflet qui suit une autre loi que celle du tabouret et des socles
est plus grave que pas de reflet ; il sera refusé.

La matière est prise en compte : la peau est mate, le chrome est spéculaire. Le
barème porte sur le **taux de transfert**, pas sur le contraste absolu.

## 4. Boucle

- Le plan doit être **cycliquement bouclable**. La dernière image doit enchaîner
  sur la première comme deux images consécutives.
- Critère mesurable : la différence structurelle entre dernière et première image,
  après passe-bas gaussien σ = 3, doit être **inférieure ou égale au 95ᵉ centile
  des différences entre images adjacentes**, et **aucun pixel** ne doit y varier
  de plus de **6 niveaux sur 255**.
- La méthode est libre : simulation périodique, boucle native, ou aller-retour.
  Aucun fondu de raccord n'est accepté ; il dédouble les colonnes et la statue.

## 5. Format de livraison

| Paramètre | Exigence |
|---|---|
| master d'archive | **ProRes 4444**, sans perte visuelle, conservé et remis |
| définition du master | **3840 × 2160 minimum**. Le master actuel est 1920 × 1080, ce qui interdit tout rôle XL réel |
| cadence | **24 im/s**, constante, sans pulldown |
| durée | **7,0 s ± 0,1 s**, soit 168 images à 24 im/s |
| espace colorimétrique | **BT.709**, primaires, transfert et matrice explicitement marqués |
| échantillonnage | 4:4:4 sur le master ; le 4:2:0 n'est admis que sur les dérivés web |
| audio | **aucun** |
| cadrages | un master paysage 16:9 et **un cadrage portrait natif** protégeant les deux visages et les deux boxers, et non un recadrage du paysage |

## 6. Contraintes de sujet, non négociables

- **Aucun visage recadré, à aucun format.** Aucun boxer recadré.
- Les deux fondateurs sont Jérémy et Alex. Leur ressemblance doit rester exacte :
  aucune retouche morphologique, aucun remplacement de visage, aucune génération.
- Univers imposé : marbre, métal liquide, lyre, arc, laurier. Trois coloris à
  terme, un seul modèle au lancement.
- Aucun élément de vente, prix, mention commerciale ou texte incrusté dans le
  plan.

## 7. Droits

- Cession des droits d'exploitation à AJ Luxury pour le web, la publicité en
  ligne et les réseaux sociaux, sans limitation de territoire ni de durée.
- Les fichiers sources du projet 3D, scène, textures et graphes de rendu, sont
  remis avec le master d'archive.
- Le prestataire garantit détenir les droits sur les modèles, textures et assets
  tiers employés. Les autorisations à l'image des deux fondateurs sont fournies
  par AJ Luxury.

## 8. Critères d'acceptation

La livraison est acceptée si, et seulement si, les huit points suivants sont
vérifiés. Chacun est mesurable et sera mesuré.

1. Les six passes de la section 2 sont présentes, en registration au pixel, mêmes
   durée et cadence.
2. Le master est ProRes 4444, ≥ 3840 × 2160, 24 im/s constant, 168 images, sans
   audio, BT.709 marqué.
3. Boucle : différence structurelle du raccord ≤ P95 des différences adjacentes,
   et écart maximal ≤ 6 niveaux sur 255.
4. Ancrage : les quatre pieds portent une ombre de contact dont la luminance au
   point d'appui vaut 0,50 ± 0,08 du sol voisin à la même profondeur.
5. Reflets : le taux de transfert de structure des deux mannequins vaut 0,29 ± 0,05,
   mesuré comme pour le tabouret et les socles dans la même image.
6. Stabilité temporelle : sur les 168 images, l'écart des ombres et des reflets
   entre deux images consécutives reste **inférieur à l'écart correspondant du
   reflet du tabouret**. Aucun scintillement.
7. Aucun visage ni boxer recadré, dans le master paysage comme dans le cadrage
   portrait natif.
8. Un rendu web dérivé à 1920 × 1080 obtient un **VMAF ≥ 96** contre le master
   normalisé.

Un point non conforme suspend la réception jusqu'à correction. Le paiement du
solde est lié à la réception complète.

## 9. Ce qui reste hors périmètre

- L'encodage et l'intégration des rendus web sont réalisés en interne à partir du
  master d'archive.
- Aucune modification du site, du domaine ou de la production n'est confiée au
  prestataire.

## 10. En attendant

Le rendu v5 en test corrige le seul défaut corrigible depuis la source, le gel en
fin de lecture. L'ancrage au sol reste au niveau du rendu d'origine et n'a pas été
retouché ; la mesure est dans `docs/VIDEO-CANDIDATE-V5-2026-08-20.md`, section 3.
