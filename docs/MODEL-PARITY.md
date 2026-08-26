# Parité d’image entre les deux fondateurs

Jérémy et Alex sont à la fois les fondateurs clients et les deux mannequins de la campagne.

Règles de direction artistique :

- les deux apparaissent ensemble dans le hero ;
- aucun mannequin ne doit dominer systématiquement les cadrages ;
- les écrans individuels alternent le premier rôle ;
- la fréquence, la taille apparente et la qualité des images sont contrôlées ensemble ;
- une nouvelle sélection d’assets doit conserver cet équilibre sur desktop et mobile.

## Gate bloquante — seconde preview commerce

Cette gate s’applique à l’accueil servi par le Worker
`aj-luxury-prod-front-commerce-preview`, avant tout partage ou déploiement de
la seconde preview. Elle est contrôlée sur la page entière, dans l’ordre réel
du défilement, en **1440 × 900** puis en **390 × 844**.

Une image est comptée avec son `currentSrc` réellement chargé dans le
navigateur. Pour détecter les doublons, on compare le chemin normalisé sans
paramètres ni fragment. Logos, icônes et médias purement décoratifs sans
mannequin sont exclus du comptage de parité, mais pas du relevé des sources.

| Contrôle bloquant | Critère de réussite | Preuve QA attendue |
| --- | --- | --- |
| Parité Alex / Jérémy | Même nombre d’images solo pour Alex et Jérémy ; le duo ne compte pour aucun des deux. | Tableau ordonné `position · currentSrc · mannequin · largeur × hauteur` pour chaque viewport. |
| Alternance | Après retrait des images sans mannequin et du duo, la suite des solos alterne strictement `Alex / Jérémy / Alex / Jérémy…` ou l’inverse. | Suite des prénoms issue du DOM, dans l’ordre du défilement complet. |
| Aucun mannequin consécutif | Deux apparitions solo successives ne montrent jamais la même personne, même si un produit, un décor ou le duo se trouve entre elles. | Assertion automatique sur la suite des apparitions solo. |
| Aucun `src` répété | Aucun chemin de photo normalisé n’apparaît deux fois sur l’accueil, quelle que soit la section ou la taille d’affichage. | Liste des chemins uniques comparée au nombre total de photos. |
| Duo unique | Exactement une photo montre Alex et Jérémy ensemble sur l’accueil. | Une seule ligne attribuée `duo` dans le relevé. |
| Cadres et importance égaux | À chaque viewport, Alex et Jérémy ont le même nombre de cadres dans chaque niveau d’importance (plein écran, grand éditorial, secondaire) et la somme des surfaces rendues de leurs images solo diffère de **1 % maximum**. Aucun des deux n’obtient seul un emplacement plus dominant que l’autre. | Dimensions DOM, niveau d’importance par cadre et ratio des surfaces cumulées Alex / Jérémy. |

**Décision :** tous les contrôles doivent être verts aux deux viewports. Un
seul échec vaut **NO-GO** : la seconde preview n’est ni partageable ni
déployable tant que le contrôle n’a pas été rejoué avec de nouvelles preuves.

État actuel :

- hero : duo ;
- écran Apollon : mannequin au teint plus bronzé ;
- rail collection : alternance bronzé, clair, bronzé ;
- campagne éditoriale : alternance d’images individuelles et duo.
