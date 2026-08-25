# AJ Luxury — matrice média hero v5

**Statut : CANDIDAT TEST — NON VALIDÉ**

**Date : 20 août 2026**

**Périmètre : bouclage de la vidéo d'accueil. Production et domaine non modifiés.**

Ce dossier remplace, pour la seule question du bouclage, la décision figée dans
`docs/VIDEO-CANDIDATE-V4-2026-08-10.md`. Les quatre rendus v4 sont conservés sur
disque et restent la référence de repli.

## Verdict

1. **Le gel est confirmé et corrigé.** La v4 ne bouclait pas : elle s'arrêtait
   définitivement sur sa dernière image. La v5 est un montage aller-retour dont
   la dernière et la première image sont deux images **consécutives** du master.
   L'attribut `loop`, interdit en v4, devient obligatoire.
2. **Les ombres de contact et les reflets ne sont PAS refabriqués.** La mesure
   sur les étalons du plan contredit le diagnostic qui motivait ce traitement, et
   le traitement prescrit, implémenté puis contrôlé au zoom 6×, **dégrade**
   l'image. Les pixels de la v5 sont ceux de la v4, sans aucune retouche.
3. Le vrai correctif du sol reste une refabrication en 3D. Son cahier des charges
   est dans `docs/BRIEF-REFABRICATION-VIDEO-ACCUEIL.md`.

## 1. Le bouclage

### Le défaut, vérifié en navigateur

Chrome, 1920×1080, page d'accueil locale, v4 en place :

| Instant | `currentTime` | `ended` | `paused` | `loop` |
|---|---:|---|---|---|
| lecture | 5,757 | false | false | false |
| +2 s | 7,042 | true | true | false |
| +4 s à +10 s | 7,042 | true | true | false |

La dernière image reste affichée indéfiniment. Le comportement est conforme au
code : `loop` est absent, `onEnded` est interdit par test, et le rembobinage
existant n'est déclenché par aucun événement de fin.

### Pourquoi la boucle simple était impossible

Le master n'a **aucun point de boucle naturel**. Recherche exhaustive de toutes
les paires d'images `(i, j)` sur la zone animée, distance moyenne entre images
adjacentes = 0,416 :

| Contrainte | Meilleure paire | Distance | Rapport à l'adjacent |
|---|---|---:|---:|
| écart ≥ 24 images | i=16, j=40 | 2,571 | 6,2× |
| écart ≥ 100 images | i=3, j=103 | 5,320 | 12,8× |
| fin → début (v4) | i=0, j=168 | 13,469 | 32,4× |

Le décor métallique dérive de façon monotone : la distance à l'image 0 croît
sans revenir. Un fondu de raccord dédoublerait les colonnes et la statue.

### Pourquoi l'aller-retour est invisible ici

L'animation ne concerne **que deux objets**. En comparant chaque image à la
médiane temporelle des 169 images, les seuls pixels réellement animés sont :

| Élément animé | Boîte englobante |
|---|---|
| tabouret en métal liquide | x 642–1104, y 659–1080 |
| flaque de mercure | x 1161–1637, y 886–1069 |

Les deux mannequins, les colonnes, la statue, la lyre, l'arc et le laurier sont
**strictement statiques** : leur résidu se limite au grain. Le mouvement restant
est un miroitement, pas un écoulement dirigé : flux optique moyen 0,485 px par
image sur 0,7 % de la zone, cohérence de signe horizontale 0,50. Une inversion
temporelle d'un miroitement non directionnel n'est pas lisible.

### Le montage retenu

```text
images du master : 0,1,…,83,84,83,…,2,1   →   168 images, 24 i/s, 7,000 s
```

Palindrome exact. Le raccord de boucle est la paire `image 1 → image 0`, c'est-à-dire
un pas de temps réel du master. Le pivot est l'image 84, encadrée deux fois par
l'image 83.

### Preuve du raccord

Mesures hors ligne sur les 168 images décodées du rendu desktop, comparées aux
169 images du rendu v4. La colonne décisive est la **différence structurelle**
(après passe-bas σ = 3), qui isole le déplacement géométrique du bruit de
quantification :

| | v4 | v5 | gain |
|---|---:|---:|---|
| adjacent moyen, structurel | 0,1298 | 0,1127 | — |
| **raccord fin → début, structurel** | **3,8336** | **0,4979** | **÷ 7,7** |
| raccord en multiple de l'adjacent | 29,5× | 4,4× | ÷ 6,7 |
| **pire pixel du raccord, structurel** | **231,23** | **5,46** | **÷ 42** |
| SSIM dernière → première image | 0,912388 | 0,979466 | + 0,067 |

Aucun pixel de la v5 ne se déplace de plus de 5,5 niveaux sur 255 au raccord, soit
2,1 %. En v4, le pire pixel sautait de 231 niveaux, soit 91 %.

Contrôle indépendant dans le navigateur, images extraites par `canvas` à
480×270 sur le rendu réellement servi :

| Paire | Écart moyen | Écart max |
|---|---:|---:|
| **raccord : image 167 → image 0** | **1,183** | **38** |
| référence : image 0 → image 1 | 0,428 | 37 |
| référence : image 40 → image 41 | 0,260 | 40 |
| pivot : image 83 vs image 85 | 0,011 | 9 |

L'écart maximal au raccord (38) est **dans la plage des transitions naturelles**
(37 et 40). Le pivot à 0,011 confirme que les images 83 et 85 sont bien la même
image source.

### Le résidu, et pourquoi il n'est pas réductible ici

L'écart moyen résiduel de 1,18 n'est pas un déplacement mais du bruit de
quantification : x264 dépense plus de bits en début de GOP qu'en fin, l'erreur
d'encodage passe de 0,53 sur l'image 0 à 1,24 sur l'image 167. Le raccourcissement
du GOP ne corrige rien (testé à 240, 84, 42 et 24 images : raccord inchangé).
Seul `mbtree=0` aplatit le profil — raccord 1,1555, erreur 0,58 → 0,71 — mais
porte le rendu desktop à **4 225 034 octets, au-dessus du plafond de 2 923 443**.
Le plafond de poids l'emporte : le résidu est du bruit, pas une coupe.

### Câblage

- `HERO_VIDEO_VERSION` passe de `v4` à `v5`.
- `<video>` reçoit `loop`. Le contrat de test est inversé : `assert.doesNotMatch(… /loop/)`
  devient `assert.match(… /loop/)`, avec la mesure en commentaire.
- `rewindHeroVideoIfEnded` est conservé comme filet de sécurité.
- `HTML_CACHE_VERSION` passe à `2026-08-20-hero-v5`.
- Les quatre fichiers v4 et leurs huit posters restent en place.

## 2. Fichiers v5

Recette d'encodage strictement identique à la v4 : `libx264`, `preset slow`,
`profile high`, `yuv420p`, `-g 240 -keyint_min 240 -sc_threshold 0`, `faststart`,
puis marquage BT.709 sans réencodage. CRF 17 portrait, 16 tablette, 17 desktop.

Le rôle XL était en v4 un remux sans perte du master ; le master v5 étant un
nouveau montage, le XL est réencodé en CRF 15. C'est la seule perte de qualité
introduite par cette passe, et elle reste très loin du plafond.

| Rôle | Fichier | Octets | v4 | Écart | Plafond v3 | Marge |
|---|---|---:|---:|---:|---:|---:|
| Portrait | `aj-luxury-hero-v5-portrait-720x934.mp4` | 1 001 603 | 1 096 231 | −8,63 % | 1 123 698 | −10,9 % |
| Tablette | `aj-luxury-hero-v5-tablet-1440x810.mp4` | 1 769 558 | 1 930 786 | −8,35 % | 2 281 803 | −22,4 % |
| Desktop | `aj-luxury-hero-v5-desktop-1920x1080.mp4` | 2 674 789 | 2 657 638 | +0,65 % | 2 923 443 | −8,5 % |
| XL natif | `aj-luxury-hero-v5-xl-native-1920x1080.mp4` | 3 563 083 | 3 057 857 | +16,52 % | 5 095 439 | −30,1 % |

Posters régénérés depuis la première image de chaque rendu v5, mêmes réglages
qu'en v4 (`libwebp` q82/84/90 `compression_level 6` ; `libaom-av1` `still-picture`
CRF 24 et 20). La première image de la v5 est la première image de la v4 : les
écarts de poids sont sous 1,5 % et confirment que rien n'a bougé.

| Poster | Octets | v4 | Plafond | AVIF / WebP |
|---|---:|---:|---:|---:|
| portrait 480×623 WebP | 36 956 | 37 098 | 64 562 | — |
| portrait 720×934 WebP | 63 928 | 64 038 | 103 202 | — |
| tablette WebP | 123 922 | 123 820 | 224 974 | — |
| tablette AVIF | 68 974 | 70 552 | 111 961 | 0,557 |
| desktop WebP | 185 136 | 184 422 | 346 814 | — |
| desktop AVIF | 103 249 | 105 428 | 166 742 | 0,558 |
| XL WebP | 261 800 | 262 132 | 548 472 | — |
| XL AVIF | 118 843 | 121 806 | 242 352 | 0,454 |

## 3. Ombres de contact et reflets — mesure, essai, refus

### Ce qui a été mesuré

Plaque statique = médiane temporelle des 169 images, qui élimine le métal liquide.
Deux étalons du plan servent de référence : le piédestal cannelé (x 1285–1445,
ligne de contact y = 822) et le socle de colonne (x 1480–1700, contact y = 848).

**Loi du sol relevée sur les étalons :**

| Grandeur | Piédestal cannelé | Socle de colonne |
|---|---:|---:|
| transfert d'énergie haute fréquence, reflet / objet | 0,286 | 0,296 |
| compression verticale `k` du miroir | 0,70–0,75 | 0,85–1,10 |
| gain multiplicatif sur la luminance | 0,40–0,69 | 0,30–0,78 |
| décalage vers le gris du sol | +55 à +91 | +27 à +100 |
| teinte | B > G > R de 2 à 3 % | idem |
| conservation du gradient au-delà de d = 60 px | 0,74–0,80 | 0,94–1,05 |

Les deux étalons donnent le même taux de transfert de structure, 0,286 et 0,296 :
**la loi du sol est serrée et exploitable.**

### Ce que la mesure dit des mannequins

Profil normalisé sous chaque objet : luminance sous l'objet divisée par celle du
sol propre à la même profondeur, moyennée sur 16 à 40 colonnes.

| Zone | d = 0 | d = 4 | d = 16 | d = 32 | d = 64 |
|---|---:|---:|---:|---:|---:|
| ÉTALON piédestal | **0,531** | 1,112 | 1,252 | 1,120 | 1,049 |
| ÉTALON socle colonne | **0,586** | 0,529 | 0,606 | 0,816 | 0,935 |
| pied droit d'Alex | **0,347** | 0,539 | 0,721 | 0,782 | 0,794 |
| pied gauche du second | **0,261** | 0,170 | 0,484 | 0,865 | 1,019 |

**Les quatre pieds assombrissent le sol au contact plus fortement que les deux
étalons.** 0,347 et 0,261 contre 0,531 et 0,586. L'affirmation « aucun des quatre
pieds ne projette d'ombre de contact » n'est pas vérifiée : il y a une ombre, et
elle est plus dense que celle du tabouret et des socles.

Au zoom 6×, le sol sous chaque pied porte par ailleurs un reflet coloré chair qui
**suit la forme du pied**, pas une simple traînée. Il est plus plat que celui du
piédestal — mais le piédestal est en chrome cannelé et un pied est une surface
mate et lisse : la matière et la structure disponible ne sont pas comparables, et
appliquer littéralement le contraste du chrome à de la peau produirait des
statues, pas des hommes.

Limite honnête de cette mesure : autour des pieds, le sol contient aussi le bord
de la flaque de mercure, le reflet du tabouret et la jambe croisée. Aucune plage
de sol propre n'y existe. **La comparaison de structure reflet/objet n'y est donc
pas concluante**, dans un sens comme dans l'autre. Seule la mesure d'ombre de
contact ci-dessus, qui dispose d'une référence de sol propre à la même
profondeur, est solide.

### L'essai, et son résultat

Le traitement prescrit a été implémenté selon la loi relevée : miroir vertical à
partir de la ligne de contact avec `k = 0,75`, transfert de structure à 0,29,
flou croissant avec la distance, teinte `B 1,02 / G 1,00 / R 0,985`, atténuation
exponentielle, puis ombre de contact ramenant la luminance à 0,53 sur 5 px.
Contrôle avant/après au zoom 6× sur les deux zones de pieds.

Le résultat dégrade nettement :

- l'ombre de contact, tracée sur le masque de peau, produit un **liseré sombre
  qui épouse le contour** — exactement l'effet « autocollant » que l'opération
  visait à supprimer ;
- sur les orteils du pied gauche, ce liseré tombe **à l'intérieur du pied** et le
  noircit ;
- la détection colonne par colonne échoue là où la jambe croisée passe devant, et
  laisse un **bloc noir rectangulaire** à gauche du pied d'Alex ;
- le reflet ajouté se lit comme une **auréole festonnée**, pas comme un reflet,
  et se superpose au reflet déjà présent ;
- les bords sont crénelés, faute de véritable masque alpha.

Une implémentation plus fine corrigerait le crénelage et le débordement. Elle ne
corrigerait pas le fait de fond : **la mesure ne demande pas d'ajouter de l'ombre
là où il y en a déjà plus que sur l'étalon.**

### Décision

Aucune retouche de pixel n'est appliquée. Les images de la v5 sont celles de la
v4. Conformément à la consigne, l'existant n'est pas dégradé pour pouvoir
annoncer une action.

### Sur la stabilité temporelle

Elle n'a pas été le facteur limitant, et il faut le dire clairement : les deux
mannequins sont **strictement statiques** sur les 169 images. Une couche de reflet
calculée une fois sur la plaque médiane et composée à l'identique sur chaque image
aurait été **stable par construction**, à scintillement nul. Le refus porte sur la
justification du traitement, pas sur sa faisabilité temporelle.

## 4. Plafond atteint depuis la source

- **Animation unique disponible : 3,5 s.** Conserver les 169 images uniques
  imposerait un palindrome de 336 images, soit environ le double d'octets. Le
  desktop dépasserait son plafond. La v5 rejoue donc 3,5 s dans les deux sens.
- **Durée : 7,000 s au lieu de 7,041667 s.** Un palindrome exact a toujours une
  période paire ; 169 est impair. Le coût minimal est une image, soit 41 ms.
  Dimensions et cadence sont inchangées.
- **Aucun XL réel.** Le master ne contient que 1920×1080 pixels. Inchangé depuis
  la v4.
- **Aucun masque alpha des mannequins.** Ni modèle de matting ni PyTorch dans
  l'environnement ; seul un seuillage de teinte chair est disponible, insuffisant
  pour un détourage propre.
- **Aucune passe d'ombre ni de reflet séparée.** Elles n'existent pas dans le
  rendu livré. C'est l'objet du cahier des charges.

## 5. Validation

- `npm run lint` : réussi. `npx vinext build` : réussi.
- `tests/hero-video.test.mjs` : **10 réussis, 1 échec** — l'échec porte sur le
  nombre d'images de galerie produit (12 attendu 14), dans `lib/products.ts`, non
  touché par cette passe.
- `tests/rendered-html.test.mjs` : 20 réussis, 13 échecs, tous sur des
  assertions de copie et de catalogue (« Prix fictif, non commercial », mentions
  de préproduction, « 3 coloris »), sans rapport avec le hero.
- **Contrôle de non-régression** : les mêmes tests exécutés sur le HEAD de la
  branche, modifications remisées, donnent 14 échecs sur `rendered-html` et 1 sur
  `hero-video`. Cette passe **n'introduit aucun échec nouveau** et en corrige un.
- `npm test` complet s'arrête avant les tests sur la barrière
  `check:preprod-demo-boundary`, qui exige les variables d'environnement de
  préproduction absentes en local. Antérieur à cette passe.

## 6. Reste à faire

- Contrôle visuel de la boucle à vitesse normale par Adam, puis par Jérémy.
- Décision sur la commande de refabrication 3D.
- Ce candidat reste en test. Aucun déploiement sans les deux validations
  explicites prévues par `AGENTS.md`.
