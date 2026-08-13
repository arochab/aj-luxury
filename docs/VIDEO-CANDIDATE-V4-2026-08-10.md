# AJ Luxury — matrice média hero v4

**Statut : HISTORIQUE DU CANDIDAT TEST — PROMU EN VERSION SITES 31 LE 11 AOÛT 2026**

**Date : 10 août 2026**

**Code d’intégration : hero vidéo, politique de mouvement et tests associés**

**Production et domaine modifiés par cette passe média : aucun**

La promotion effective, les droits, approbations et smoke tests sont gouvernés par
`docs/internal/RELEASE-HANDOFF-HERO-V4-2026-08-10.md`.

## Verdict

Les quatre renditions vidéo et les huit posters v4 sont prêts pour un câblage en
environnement de test. Le crop portrait protège les deux visages, les deux torses
et les deux sous-vêtements. Tous les fichiers vidéo sont H.264 High, `yuv420p`,
progressifs, sans audio, marqués BT.709 et `fast-start` (`moov` avant `mdat`). Tous
les poids restent sous les plafonds v3 correspondants.

Le master ne passe pas le contrôle de boucle : les mannequins restent fixes mais
le décor métallique saute au raccord. La stratégie retenue est donc une lecture
unique, puis l'arrêt sur la dernière image. Ne pas activer `loop` et ne pas ajouter
de fondu de raccord entre la fin et le début. L’entrée poster → vidéo utilise en
revanche un fondu de 1 100 ms, déclenché uniquement par `onPlaying`, afin d’éviter
toute image vide ou transition prématurée. La vidéo reste immobile si
`prefers-reduced-motion` ou l’économie de données est actif.

Ce dossier ne prétend ni à une approbation d'Isabelle, ni à la validation d'Adam,
ni à celle de Jérémy. Le candidat doit rester en test jusqu'aux validations
explicites prévues par `AGENTS.md`.

## Source qualifiée

| Fichier | Propriétés | SHA-256 |
|---|---|---|
| `inputs_assets/inputs/aj-luxury-hero-candidate-2026-08-10.mp4` | 3 079 531 octets ; 1920×1080 ; H.264 High/yuv420p ; 24 i/s ; 169 images ; 7,041667 s ; sans audio ; master non fast-start | `E3A4B616C0BCDE49A3303216F696C8E0EC4044C3EE26A3C03E7C6358BD10AEC1` |

Provenance confirmée pour ce lot : le master ci-dessus est la nouvelle source
explicitement demandée par Adam pour le candidat v4. Le fichier
`inputs_assets/inputs/Accueil test 1.mp4` est une ancienne preview distincte,
848×480 avec audio, désormais hors périmètre. Il n'est pas la source des
renditions ci-dessous. Cette confirmation de source ne vaut pas approbation de
production ni cession implicite de droits.

## Fichiers vidéo à câbler

| Rôle | Fichier exact | Octets | Plafond v3 | Écart | VMAF | SSIM vs source normalisée | SHA-256 |
|---|---|---:|---:|---:|---:|---:|---|
| Portrait | `public/videos/aj-luxury-hero-v4-portrait-720x934.mp4` | 1 096 231 | 1 123 698 | -2,44 % | 96,627003 | 0,993472 | `4333EC5172953750CBD1177B0015357DE67AB6D0B19831204E34D6416619752A` |
| Tablette | `public/videos/aj-luxury-hero-v4-tablet-1440x810.mp4` | 1 930 786 | 2 281 803 | -15,38 % | 96,972126 | 0,994932 | `8BAC0B258EE7B5BA829EB3C79F232B85340F9109C8C91F996A48374A7C5D2BC5` |
| Desktop | `public/videos/aj-luxury-hero-v4-desktop-1920x1080.mp4` | 2 657 638 | 2 923 443 | -9,09 % | 97,023117 | 0,995903 | `77AD0929D129D7C6CB47CCC6A3ECF6857A241EC1809BE722DB4698CC78AD7469` |
| XL natif | `public/videos/aj-luxury-hero-v4-xl-native-1920x1080.mp4` | 3 057 857 | 5 095 439 | -39,99 % | 97,578466* | 1,000000 | `10C5A48FF92DC1917C93CF2F2D4DDC5CC2FC693C4BD2361AF36865D02DA74610` |

Toutes les vidéos ont 169 images, 24 i/s et 7,041667 s. Les débits conteneur sont
respectivement 1 245 422, 2 193 555, 3 019 328 et 3 474 014 bit/s.

\* Le XL est un remux sans perte du master. L'égalité de décodage est la preuve
décisive : MD5 des pixels décodés master = MD5 XL =
`626b01c72c2fb71f5ad4ced2feb444f0`. Le score VMAF inférieur à 100 provient de la
chaîne de normalisation de mesure, pas d'une altération des pixels.

### Crop portrait figé

```text
source crop : 828 × 1074
origine     : x=546, y=2
sortie      : 720 × 934
filtre      : crop=828:1074:546:2,scale=720:934:flags=lanczos
```

Équivalent normalisé : gauche 28,4375 %, haut 0,1852 %, largeur 43,1250 %,
hauteur 99,4444 %. Le cadre est fixe et centré. Aucun recadrage dynamique n'est
nécessaire. La jambe avancée est déjà coupée dans le master en bas ; ce n'est pas
un défaut introduit par ce crop.

### Stratégie XL figée

Le master ne contient que 1920×1080 pixels. Aucun MP4 2560×1440 artificiel n'a été
créé : un tel fichier ajouterait 77,8 % de pixels interpolés sans détail source.
Le rôle XL doit utiliser le remux natif 1920×1080 ci-dessus et laisser le navigateur
gérer l'affichage. Un véritable actif XL ne sera justifié qu'avec un master natif
d'au moins 2560×1440, idéalement 3840×2160.

## Posters à câbler

Tous les posters utilisent la première image de la rendition correspondante.

| Rôle | Fichier exact | Octets | Plafond v3 | Écart | SHA-256 |
|---|---|---:|---:|---:|---|
| Portrait compact WebP | `public/images/client/hero-v4-portrait-480x623-poster.webp` | 37 098 | 64 562 | -42,54 % | `83AAB50671DF7E0B83463993204F00CF064FC7371D40FF69AE21FC95A65EBE71` |
| Portrait WebP | `public/images/client/hero-v4-portrait-720x934-poster.webp` | 64 038 | 103 202 | -37,95 % | `1270ECFB03CC3BBDE737D92CE8182B28C7312B1468DF2DD2B87925E5D6705EA8` |
| Tablette WebP | `public/images/client/hero-v4-tablet-1440x810-poster.webp` | 123 820 | 224 974 | -44,96 % | `B88B4CA9E5A8D70358E6C6A3E806053BC9316B054E6F29B782FFEF8F0B10A562` |
| Tablette AVIF | `public/images/client/hero-v4-tablet-1440x810-poster.avif` | 70 552 | 111 961 | -36,99 % | `34C0DB1620BB0E5368495E12E5AF0E86E79246190E305D79BDF2774BF267676E` |
| Desktop WebP | `public/images/client/hero-v4-desktop-1920x1080-poster.webp` | 184 422 | 346 814 | -46,82 % | `FC756BB039215DC7FABCB8DA67001B19E475899CDB7FC86B5888A8C01CB72044` |
| Desktop AVIF | `public/images/client/hero-v4-desktop-1920x1080-poster.avif` | 105 428 | 166 742 | -36,77 % | `A28C8CE7AAABA0744D1323E8675724F5BA09D3816B5166BBE65EC9A02518ADA0` |
| XL WebP | `public/images/client/hero-v4-xl-native-1920x1080-poster.webp` | 262 132 | 548 472 | -52,21 % | `F833D238690C4B65FE212E8E226C40B72862600C8787809C5ACAF3FF42999940` |
| XL AVIF | `public/images/client/hero-v4-xl-native-1920x1080-poster.avif` | 121 806 | 242 352 | -49,74 % | `95AE3D298A9052C57ED7EFF9F08E526780A1523508B62C5BA8714015B59BC505` |

## Décision de lecture et contrôle du raccord

| Rendition | SSIM dernière image → première image | Verdict boucle |
|---|---:|---|
| Portrait | 0,908044 | échec visible, amplifié par le crop |
| Tablette | 0,947518 | échec visible |
| Desktop | 0,945856 | échec visible |
| XL natif | 0,947118 | échec visible |

Le saut représente environ 26 à 29 fois le mouvement adjacent moyen du master.
Un fondu dédoublerait les colonnes et structures métalliques. Pour ce candidat :

1. lancer une seule lecture automatique si les préférences de mouvement le permettent ;
2. ne pas mettre l'attribut `loop` ;
3. à `ended`, conserver la dernière image affichée et basculer l'intention de lecture à l'arrêt ;
4. conserver le contrôle lecture/pause et la pause hors écran ;
5. utiliser uniquement le poster si `prefers-reduced-motion: reduce` est actif.

Une future boucle ne devra être acceptée qu'avec un master réellement cyclique,
un raccord inférieur ou égal au P95 des variations internes et un contrôle visuel
à vitesse normale.

## Recette de génération

Base d'encodage des trois renditions compressées :

```powershell
ffmpeg -i MASTER -map 0:v:0 -an -sn -dn -vf FILTRE `
  -c:v libx264 -preset slow -crf CRF -profile:v high -level:v 4.1 `
  -pix_fmt yuv420p -g 240 -keyint_min 240 -sc_threshold 0 `
  -movflags +faststart SORTIE
```

Valeurs : portrait = filtre du crop ci-dessus, CRF 17 ; tablette =
`scale=1440:810:flags=lanczos`, CRF 16 ; desktop =
`scale=1920:1080:flags=lanczos`, CRF 17. Le GOP long est intentionnel pour ce film
de fond de 7 secondes sans recherche temporelle.

Après encodage, puis pour le XL directement depuis le master, le marquage BT.709
et le fast-start ont été appliqués sans réencodage :

```powershell
ffmpeg -i ENTREE -map 0:v:0 -an -sn -dn -c:v copy `
  -bsf:v "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1" `
  -movflags +faststart SORTIE
```

Les WebP ont été générés avec `libwebp`, qualité 82 pour le portrait, 84 pour
tablette/desktop, 90 pour XL, `compression_level 6`. Les AVIF ont été générés avec
`libaom-av1`, `still-picture=1`, CRF 24 pour tablette/desktop et CRF 20 pour XL.

## Preuve de non-régression média v3

Les quatre vidéos v3 ont été relues après génération et conservent leurs empreintes :

| Fichier v3 | SHA-256 inchangé |
|---|---|
| `aj-luxury-hero-v3-portrait-720x934.mp4` | `9F577EE1D6D6E8E879F8F274CE8B159DD561927D5E6123DFB5A865C4AF2994C3` |
| `aj-luxury-hero-v3-tablet-1440x810.mp4` | `9D2E0C176B3AE551F1AF059C9D581A46C4BA5E5F9F82028BDA7D51DEA33F2532` |
| `aj-luxury-hero-v3-desktop-1920x1080.mp4` | `E39E047631DC8EDF3A9FF3AB321442CA5B8322F750F1590B8CFFA49DC22AE438` |
| `aj-luxury-hero-v3-xl-2560x1440.mp4` | `E3AFFCDE67B027686DDD3212E5CFFF9ABAFD9F5EFB1CD925C3AC858A7DC0AB53` |

## Intégration locale vérifiée

Le candidat v4 est câblé uniquement dans l'environnement local/test. La production
et le domaine public n'ont pas été modifiés.

- Huit viewports contrôlés : 320×800, 390×844, 430×932, 768×1024,
  1024×768, 1440×900, 1920×1080 et 2560×1440.
- La rendition attendue est chargée à chaque breakpoint et aucun viewport ne
  présente de débordement horizontal.
- En paysage, le stage commence à 96 px sous un header mesuré à 92 px : les deux
  visages, les deux produits et les logos restent hors du chrome de navigation.
- En portrait, le stage est centré dans l'espace réellement disponible avec
  `top: calc(50% + 34px)`. Les respirations haut/bas mesurées sont respectivement
  97,7/97,9 px, 74,0/74,2 px, 92,1/92,3 px et 49,0/47,2 px.
- En navigateur, la première lecture atteint 7,041667 s, reste sur la dernière
  image et passe le contrôle à « Animer le métal ». Un clic relance la vidéo depuis
  le début et remet le contrôle à « Figer le métal ».
- Le démarrage automatique est muet et `playsInline`. La source est attachée après
  le premier rendu, puis la lecture attend un `readyState >= 3`. Un rejet précoce
  conserve l’intention et `canplay` déclenche l’unique nouvel essai ; un refus de
  politique une fois le média prêt bascule vers le contrôle manuel sans boucle de
  tentatives.
- Chrome 151 isolé confirme les politiques système : avec
  `prefers-reduced-motion: reduce` ou `Save-Data`, aucun `src`/`currentSrc` MP4
  n’est attaché et le contrôle de mouvement est masqué.
- Une vraie bascule d’onglets confirme la pause en arrière-plan (progression de
  0,024 s pendant 0,9 s) puis la reprise au premier plan (progression de 0,674 s
  pendant 0,65 s).
- Smoke test propre : aucune erreur ni aucun avertissement console.
- Suite finale : lint, build et 75/75 tests automatisés réussis ; contrôle du diff
  réussi.

### Performance : verdict borné aux preuves disponibles

Par rapport à la v3, les transferts MP4 diminuent de 2,44 % en portrait, 15,38 %
en tablette, 9,09 % en desktop et 39,99 % sur le rôle XL. Les posters diminuent de
36,77 % à 52,21 % selon le format. Le gain XL inclut toutefois l'usage du master
natif 1920×1080 au lieu d'un fichier 2560×1440 interpolé : il ne doit pas être
présenté comme un gain sans contrepartie de résolution.

Les outils de trace DevTools/Lighthouse n'étaient pas disponibles dans ce runtime
local et le serveur de développement ne reproduit pas fidèlement les requêtes
partielles MP4 du Worker. Aucun chiffre LCP, Web Vitals ou premier photogramme n'est
donc inventé. Le gate démontré porte sur les octets, le décodage, le comportement
réel en navigateur, les breakpoints et la non-régression fonctionnelle.

## Jury final IA à huit rôles

**Verdict : PASS local/test — note minimale 9,5/10.** Ce score qualifie la qualité
d'intégration du master fourni ; il ne vaut ni mesure terrain ni autorisation de
production.

| Regard indépendant | Note |
|---|---:|
| Direction créative underwear premium | 9,7/10 |
| Direction design / luxe | 9,6/10 |
| Direction marketing / marque | 9,6/10 |
| Direction UX/UI | 9,7/10 |
| Expertise responsive mobile | 9,7/10 |
| Expertise accessibilité / mouvement | 9,7/10 |
| Ingénierie performance web | 9,5/10 |
| QA / release anti-régression | 9,7/10 |

Moyenne du jury final : **9,65/10** ; aucune note inférieure à 9,5/10.

Les réserves non bloquantes restent la résolution native maximale 1920×1080, la
jambe déjà coupée dans le master et l'absence de vraie boucle dans la source. Elles
sont traitées sans faux upscale et par une lecture unique stable.

## Gate avant toute promotion

- conserver la confirmation de provenance et vérifier les droits d'exploitation du master candidat ;
- validation visuelle du même candidat en test par Adam CHABBI ;
- validation visuelle du même candidat par Jérémy SCHEPPLER ;
- tests responsive, accessibilité, lecture unique et performance sur le câblage final ;
- seulement ensuite, autorisation séparée de déploiement.
