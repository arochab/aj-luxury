# ORDRE DE MISSION — AJ LUXURY / FRONT AWWWARDS
### À exécuter par Claude Design. Document autoportant. Aucune connaissance préalable requise.

---

## 0. POINT DE DÉPART — TOUT EST DÉJÀ PRÊT

**Le terrain est préparé. Tu n'as ni dépôt à cloner, ni branche à créer, ni actif à chercher.**

```bash
cd "D:\Adam CHABBI Pro\business-clients\CLIENTS\aj-luxury"
git branch --show-current     # doit renvoyer : claude/front-awwwards-20260817
```

| | |
|---|---|
| **Branche de travail** | `claude/front-awwwards-20260817` — déjà créée, checkout fait, poussée sur `origin` |
| **Coupée à** | `codex/ajl-awwwards-experience-20260815` @ `59d595e` |
| **Dépôt distant** | `arochab/aj-luxury` (privé) |
| **Actifs sur disque** | **62 fichiers médias, 22 Mo** — 58 images, 4 vidéos hero. Aucun Git LFS, aucun média dans `.gitignore`. |
| **Les caleçons seuls** | `public/images/editorial/isabelle-apollon/apollon-{rose,lilas,pourpre}-lyre-v1.webp` |
| **Les caleçons portés** | `public/images/client/apollon-world/apollon-{rose,lilas,pourpre}-model-{world,color}-v1.webp` |
| **Preview privée** | `https://aj-luxury-awwwards-branch-preview.adam-chabbi94.workers.dev/` |

**Un hook `post-commit` pousse automatiquement chaque commit sur `origin`.** Il est actif
(`core.hooksPath = .githooks`). Si tu vois `[github-first] … ECHEC`, ton commit n'existe que sur ce
disque : corrige avant de continuer. Ne le désactive jamais.

**À lire avant d'écrire une ligne**, dans cet ordre : le présent document en entier ·
`docs/internal/HANDOFF-2026-08-17.md` (état, décisions ouvertes, ce qu'il ne faut pas toucher) ·
`docs/internal/GITHUB-FIRST.md` (gouvernance) · `docs/internal/AUDIT-FRONT-JURY-2026-08-17.md`
(le verdict complet, si tu veux le raisonnement derrière un chantier).

---

## 0 bis. CORRECTIONS DU 2026-08-17 — ELLES PRIMENT SUR TOUT LE RESTE

Deux faits établis **après** le jury, par vérification visuelle directe. Ils sont déjà intégrés
au corps du document ; ce rappel existe pour que tu ne puisses pas les manquer.

**① Le hero vidéo n'est PAS vide.** Toute affirmation contraire est fausse et retirée.
Mesure de contrôle sur `ajluxurystore.com` : `currentSrc = aj-luxury-hero-v4-tablet-1440x810.mp4`,
`readyState: 4`, `1440×810`, `currentTime 7,04 s`, `paused: true` (`loop:false`, lecture unique par
conception). La première mesure avait été prise ~1,5 s après navigation sur un `<video preload="none">`
dont la source est attribuée par JS, pas par des enfants `<source>` : état transitoire, pas panne.
**Ne prescris rien sur la disponibilité de la vidéo.**

**② Un treizième chantier existe : C13, la découpe des visages dans la vidéo hero.** Défaut relevé
par Adam, confirmé à l'œil, **absent des douze rendus experts et testeurs**. Il est intégré au plan
§5, au tableau d'agents §6.1 et à la table de preuves §8.3. Ce n'est pas une option.

**La leçon à appliquer sur toute ton exécution :** les douze rendus ont travaillé sur du DOM, du CSS
calculé, des timings et du code source. Le panneau navigateur n'était pas affiché : **personne n'a
regardé le hero.** Une découpe qui bave est invisible dans une matrice de transform.
**À chaque chantier livré, REGARDE le rendu. Une mesure verte n'est pas une preuve visuelle.**

---

## 1. MISSION ET NIVEAU

**Mission :** porter le front d'AJ Luxury de **3,2/10** à **9,7/10** sur la grille du jury Awwwards, en réécrivant la séquence Apollon autour d'une seule idée — le boxer seul et le boxer porté sont deux prises d'un même plateau, et le site doit le laisser voir.

**Niveau exigé :** Site of the Day. Seuil d'acceptation du jury interne : **9,7/10**, pondération Awwwards **Design 40 % · Usability 30 % · Creativity 20 % · Content 10 %**.

Note actuelle, calculée à cette pondération : `(3,5 × 0,40) + (3,0 × 0,30) + (2,5 × 0,20) + (4,0 × 0,10) = 3,20`.

**Avertissement de pilotage, à ne pas contourner.** Six audits antérieurs ont dépensé ~70 % de leur effort sur Usability et Content, soit 40 % de la pondération. Les exécuter intégralement amènerait ce site autour de 5,5, jamais à 9,7. **La majorité de ton budget va au Design (40 %) et à la Creativity (20 %).** Le plan de la §5 est pondéré ainsi. Ne le rééquilibre pas.

---

## 2. CONTEXTE DE MARQUE — LE STRICT NÉCESSAIRE

- **AJ Luxury**, marque française de sous-vêtements masculins premium. **Une seule référence : le boxer « Apollon »**, trois coloris — Rose Velours, Pourpre Impérial, Lilas Céleste. Tailles S à XL. **Prix validé : 29,99 €** (AJ-102).
- **Fondateurs et mannequins : Jérémy et Alex.** La parité entre eux est une **contrainte dure**, pas une préférence.
- Signature actuelle : « Reveal Your Inner Beauty ». **Elle est en cours de remplacement** (voir C11) — décideur : Adam.
- Univers visuel : métal liquide, marbre, lyre, arc et carquois, laurier, registre apollinien.
- Conception, UX/UI et réalisation : **Adam CHABBI**.
- Composition produit : 94 % modal / 6 % élasthanne. Ceinture jacquard 3,5 cm à plaque métal — **déjà photographiée, grande et nette**, dans les trois `apollon-*-lyre-v1.webp`. Ne prescris aucun macro à produire.

---

## 3. ÉTAT DES LIEUX FACTUEL — CHIFFRES MESURÉS, PAS D'IMPRESSIONS

**Terrain :** branche `codex/ajl-awwwards-experience-20260815` @ `59d595e`, servie sur la preview Cloudflare privée `https://aj-luxury-awwwards-branch-preview.adam-chabbi94.workers.dev/`. Mesures DevTools Chrome 148, viewport 1440×900, `prefers-reduced-motion: no-preference`.

### 3.1 — Le P0 réel : il n'existe aucune scène qui mérite d'être épinglée

| Fait mesuré | Valeur |
|---|---|
| `gsap-*.js` + `ScrollTrigger-*.js` téléchargés | **46 Ko** (28 + 18), 87/88 ms |
| GSAP fonctionnel dans l'environnement | v3.15.0 — pin de test manuel → 1 `.pin-spacer` créé puis nettoyé |
| ScrollTriggers créés par l'app | **8**, tous issus du bloc `media.add("(prefers-reduced-motion: no-preference)")` |
| ScrollTriggers créés par le bloc `media.add("(min-width: 981px) and …")`, **le seul contenant `pin: true`** | **0** |
| `.pin-spacer` créés par l'app | **0** à y = 0/15/30/45/60/80/100 % et après cycle resize 1440→900→1440 |
| `--aj-split` sur `.aj-sequence__stage` | **figé à `36%`** aux offsets 30/42/50 % — devrait animer 36 → 29 → 34 |
| `clip-path` sur le stage | **jamais posé** (`none`) |
| Transform/opacité/clip sur 6 sections × 7 nœuds × 5 offsets | **identiques au bit près** |
| Sélecteurs GSAP ciblés | 22/22 résolvent, 0 sélecteur mort, 0 erreur console |

**Le seul mouvement qui atteint réellement l'écran** est `@keyframes aj-section-arrival` (globals.css:4229-4239) : `opacity .72 → 1` et `translateY 12px → 0`, sur `animation-range: entry 2% entry 28%`. Un delta d'opacité de 0,28 sur 12 px n'est pas une intention, c'est un réglage par défaut de thème.

**Et même réparé, l'ancien câblage ne vaut rien :** `start: "top 8%"`, `end: "+=85%"` = **765 px de scroll confisqués** pour déplacer un séparateur de **7 points de pourcentage** (36 → 29 → 34), avec deux beats séparés de ~61 px, soit moins d'un cran de molette.

> **Décision de pilotage, opposable : zéro heure de débogage sur l'ancien pin.** Deux campagnes DevTools instrumentées se contredisent sur un fait binaire (`.pin-spacer.length` : 0 contre 1) et rien dans le dépôt ne permet de trancher. Le P0 n'est pas « le pin ne s'instancie pas », c'est **« il n'existe aucune scène qui mérite d'être épinglée »**. C2 réécrit le trigger de zéro, C12 tranche le fait de façon permanente par un harnais.

**Deux candidats jamais explorés, à instrumenter par le harnais et non à affirmer :** `overflow: hidden` sur `.aj-home` (globals.css:3083) **et** sur `.aj-sequence` (5203) — deux ancêtres clippants au-dessus de l'élément épinglé, pathologie ScrollTrigger classique ; remède `overflow-x: clip`, qui ne crée pas de conteneur de défilement contrairement à `hidden` qui force l'autre axe à `auto`. Et le chemin où, si le démontage précède la résolution du `import()`, `cancelled = true` sort **avant** l'assignation de `revertGsap`.

### 3.2 — Hypothèses falsifiées : ne les reprends jamais

| Affirmation répandue | Statut |
|---|---|
| « Le garde `querySelector('.aj-sequence__stage')` s'exécute avant l'hydratation d'un chunk séparé » | **FAUX.** `app/page.tsx:9` importe `ApollonGuidedSequence` **statiquement** — pas de `next/dynamic`, pas de `ssr:false`. Le nœud est dans le HTML SSR. Le fichier de preuves le classait en « suspect, non prouvé, à ne pas affirmer » ; six rendus l'ont promu en cause prouvée. |
| « L'anneau de focus est à 1,04:1 sur 1 px » | **FAUX.** `globals.css:66-70` déclare une règle typée `button:focus-visible, a:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid #676dd8 }`, spécificité (0,1,1), qui bat la règle `:where(a, button, summary, select)` de 4302, spécificité (0,1,0). `#676dd8` = 3,90:1 sur `#f3f2ef` et 4,48:1 sur `#0a0a0c`. **Ce qui survit :** `select` n'est pas dans la règle typée ; `<section className="aj-moodboard" tabIndex={0}>` est un arrêt de tabulation sans `role` ni nom accessible ; et `#676dd8` est un périwinkle **hors palette** Rose/Pourpre/Lilas — le vrai défaut est chromatique. |
| « Le moodboard mobile est écrasé en 129/104/129 px sans scroll » | **FAUX.** Le bloc `@media (max-width:760px)` pose `overflow-x: auto`, `scroll-snap-type: x mandatory`, `display:flex`, `width: max-content`, `flex: 0 0 78vw`. Les valeurs `grid-template-columns: 0.82fr 0.66fr 0.82fr` citées comme preuve **n'existent nulle part** dans le fichier. Ne dépense pas une heure là-dessus. |
| « `serveMp4Range` est la cause du hero vidéo vide » | **IMPOSSIBLE.** Le `<video>` mesuré n'a **aucun enfant `<source>`** et `networkState: 0` : il n'émet aucune requête HTTP. Le gate est client (`shouldAttachHeroVideoSource`). Le défaut `arrayBuffer()` (worker/index.ts:2694 et 2703) reste réel mais pas sous ce motif. |
| « 4 collisions de cascade CSS/GSAP » | **2, pas 4.** Vraies collisions sur le même élément : `.aj-product-card` (CSS 4257 vs `gsap.from(".aj-product-card")`) et `.aj-moodboard__item` (4258 vs `gsap.from(".aj-moodboard__item")`). Pour `.aj-shop__heading` et `.aj-story__copy`, le CSS anime le **parent** de 0,72 à 1 pendant que GSAP anime les **enfants** (`> *`, `> div`) en `autoAlpha` 0→1 : les opacités se **multiplient**, l'entrée démarre à 0 et l'enfant hérite d'un `translateY` parent de 12 px non prévu. Défaut différent, correctif différent. |

### 3.3 — Défauts de production : hors périmètre comme critères, à connaître comme contexte

La production `ajluxurystore.com` est **un build différent** de la branche auditée : `gsapPresent: false`, structure `aj-featured` là où la preview expose `aj-sequence`. C'est le **rollback R10 v15**.

Mesures de production (TTFB **2 064 ms**, DCL 2 863 ms, 23 requêtes, **0 `<h1>`**, **0 occurrence de `€`**, `<video>` à **0 Ko** transféré, bouton `ⅡFiger le métal`, 19/38 textes visibles sous 12 px, 13/13 images sans `srcset`) : **elles ne décrivent pas la branche auditée.** Six rendus sur douze les ont importées comme si elles la décrivaient — c'est l'erreur systématique la plus coûteuse du tour précédent.

> **Règle opposable : aucun critère d'acceptation ne peut être énoncé contre la production.** Cela invalide d'office « TTFB < 400 ms », « le prix apparaît en production à ≥28 px », « Rich Results Test sur les trois URL ». Ta ligne de base se prend sur la **preview**, datée, avant la première ligne de code.

### 3.4 — Les défauts de la branche, mesurés

**Typographie.** Une seule famille, « AJ Manrope », weight 200-800, employée de **8 px à 245 px** — rapport **30,6:1**, **sans axe `opsz`**. Sur 190 déclarations `font-size` : **23 × 8 px, 30 × 9 px, 16 × 10 px, 21 × 11 px = 90 déclarations sous 12 px (47,4 %)**. Le plus gros caractère du site est `.aj-proof__material dt` — un pourcentage de fibre — à `clamp(126px, 17vw, 292px)` = **245 px rendus**, weight 260, `letter-spacing: -0,11em` (= −26,9 px), soit **4:1 au-dessus du nom du produit**. Le reproche d'Adam « les infos trop petites et paas beau » est inscrit **90 fois** dans la feuille.

**Premier écran.** Le seul `<h1>` (`app/page.tsx:23`) porte `.aj-film__portrait--sr` = `position:absolute; width:1px; height:1px; clip: rect(0,0,0,0)` (globals.css:3273). La seule phrase de marque visible est `.aj-film__signature` à **10 px**, `letter-spacing: .2em`, avec `background-clip: text; -webkit-text-fill-color: transparent` (3406-3431) — remplissage transparent sur vidéo.

**Le clignotement du hero — absent des douze rendus antérieurs.** `gsap.fromTo(".aj-film__signature > *", {autoAlpha:0, y:18}, {…, delay:0.55})` a `immediateRender: true` par défaut et n'est attaché à **aucun** ScrollTrigger. La signature est rendue par le SSR, donc visible au premier paint ; à la résolution du chunk — **mesurée à 507 ms** — le from-state l'efface, puis elle revient 550 ms plus tard. **La promesse de la marque clignote dans la première seconde.**

**LCP.** `PORTRAIT_POSTER_SIZES = "min(100vw, calc(70svh * 720 / 934))"` (HeroBackgroundVideo.tsx:52). À 900 px de hauteur : `70svh = 630`, `× 720/934 = 486 px`. Le navigateur choisit donc le candidat **480w** pour une boîte réellement peinte à **1539 px** → **upscale ×3,2**. C'est le **mécanisme réel**, pas l'ordre des `<source>` : refaire l'échelle de sources sans corriger `sizes` reproduira exactement le même upscale. Aggravé par `object-fit: contain` + `background: #4c4a4b` (3133, 3151, 3156) : le premier pixel peint est un gris L*32 sur ~51 % de la largeur du hero.

**Couche image.** `next.config.ts` déclare `images: { unoptimized: true }` — **c'est la cause** : avec `unoptimized`, `next/image` n'émet **aucun** `srcset`. Résultat : **17/17 images sans `srcset`**, et `sizes` renseigné sur 6 d'entre elles est du **code mort**. Logo `aj-luxury-logo.webp` : 720×520 natif rendu 106×76 (**×6,8**) pour 43 796 octets. L'image mannequin de la séquence est en `loading="lazy" fetchPriority="low"` alors qu'elle est le sujet de la section.

**Scroll.** `scroll-behavior: smooth` sur `html` (globals.css:38) **et** sur `.home-shell` (1591). GSAP le documente comme incompatible avec ScrollTrigger : il casse ScrollToPlugin, le snap, l'ancrage de refresh, et interdit ScrollSmoother. **Conséquence de méthode : toute mesure par `window.scrollTo` sur ce site est nulle tant que la ligne 38 existe** — une campagne entière a relevé `scrollY` figé à 1590 sur 11 appels successifs, d'où des valeurs « identiques au bit près ». Le bloc `prefers-reduced-motion` (1362-1375) pose déjà `scroll-behavior: auto !important` : la suppression ne casse aucun garde a11y.

**Ordre des chapitres.** `.aj-shop` démarre à **1816** et `.aj-shop__rail` à **1972**, sous un pin dont l'`end` est à **2509**. À la libération, la révélation produit — le seul moment commercial de la page — est déjà scrubbée à **46,9 %**, derrière la section épinglée.

**Langage de mouvement.** **17 durées** distinctes (0,22 / 0,24 / 0,28 / 0,30 / 0,32 / 0,36 / 0,38 / 0,42 / 0,50 / 0,58 / 0,75 / 0,90 / 0,95 / 1,05 / 1,10 / 1,35 / 1,40) et **5 eases** tirés au jugé. **Zéro `@property`** dans les 5757 lignes de `globals.css` — donc `--aj-split` n'est ni typé, ni interpolable, ni compositable par le moteur, et il pilote `left`/`right` sur deux panneaux absolus portant des images 1731×2600 (5264, 5294, 5300) : relayout à chaque frame. Mesure pendant le scrub, 161 frames à la molette réelle : médiane 11,3 ms, p95 20,4 ms, max 36,8 ms, **26 frames > 16,7 ms (16,1 %)**, 0 longtask — ce n'est pas le JS, c'est le layout/paint. Cinq `once: true` figent un état non réversible au resize.

**Rythme et couleur.** `aj-story` = **310 px = 0,34 écran** contre **1,38 écran** de footer cumulé (3 × 412 px). Paragraphe de marque à `clamp(18px, 2.2vw, 34px)` = 31,7 px. `aj-shop` + `aj-moodboard` = **1848 px = 2,05 écrans à 0,3 L\* d'écart**. Quatre noirs dans une plage de 2,8 L\*, trois blancs cassés dans 1,6 L\*. `.aj-section-break` (3088-3092) insère une lamelle de **28 px `#f3f2ef`** bordée à 10 % d'alpha exactement entre le hero (`#070709`, L\*1,96) et `aj-proof` (`#efede9`, L\*93,9) — c'est-à-dire au milieu de la seule coupe franche de la page.

> **Précision opposable :** l'affirmation « aucun fond entre L\*5 et L\*93 » est **fausse** — `.aj-sequence__symbol` `#d5cec9` = L\*82 et `.aj-sequence__stage` `#1a191d` = L\*8,5 existent. L'observation qui survit est plus étroite et suffisante : **aucun fond de _section_ n'est en ton moyen.**

**Accessibilité — les deux échecs qui survivent à vérification.** `.aj-sequence__choices button > span` : 8 px, `rgba(255,255,255,0.4)` sur `rgba(8,8,10,0.9)` = **3,50:1**, échec SC 1.4.3. `.aj-sequence__progress` : `height: 1px`, piste `rgba(255,255,255,0.2)`, remplissage `var(--aj-accent)` — sur la frame 03, `#7d0f52` contre sa propre piste donne **~1,05:1** : le remplissage est littéralement invisible sur sa piste. Ajoute : `aria-live="polite"` sur `.aj-sequence__visuals`, région qui englobe **trois `role="tabpanel"`**, couplée à une auto-avance de **5 600 ms** — un ensemble tablist/tabpanel n'est pas une région live (ARIA APG) ; NVDA est interrompu toutes les 5,6 s sur la section principale. 5 liens `<a>` sans nom accessible.

**Géométrie du pin.** `.aj-sequence__stage { height: clamp(640px, 78svh, 860px) }` (5247) + `.aj-sequence__controls { position:absolute; bottom:0; min-height:74px }` (5376) + `start: "top 8%"`. **À 1280×640** — MacBook 13" en fenêtre non plein écran, la configuration matérielle la plus répandue chez les jurés — le bas du stage tombe à **691 px** pour 640 px de viewport : transport, onglets de coloris et CTA boutique sont **sous la ligne de flottaison pendant les 544 px d'épinglage**.

**Mobile.** Le seul bloc contenant `pin: true` est gaté sur `(min-width: 981px)`. Sous ce seuil : **0 `.pin-spacer`**, plus `display: none` sur les **trois noms de coloris** (`.aj-sequence__choices button > strong`), sur le paragraphe d'introduction et sur la barre de progression, plus `font-size: 8px` **codé en dur** sur la copie. Ce n'est pas une adaptation, c'est une amputation de la proposition produit.

**Parité rompue — vérifiée à l'ouverture des fichiers.** Le mannequin du rose (cheveux foncés attachés, barbe fournie, carnation plus profonde, morphologie plus lourde) et celui du lilas (cheveux bouclés châtains, bouc, chaîne, tatouage pectoral, morphologie plus légère) sont **deux hommes différents**. Le pourpre est identique au rose. **Ratio 2:1.** La parité est un acquis nommé comme contrainte dure, et la section signature la viole.

**Code mort.** `IntroSequence.tsx` et `ApollonHorizontalRail.tsx` sont définis et **importés nulle part**. `globals.css:1377+` porte tout le chapitre `.aj-apollon-myth` (sticky 180svh, rail horizontal, `will-change: transform` statique) pour un composant non monté. `.aj-featured` figure dans le bloc `@supports` et **n'existe pas sur cette branche** : c'est la structure de production. Une seule feuille de style sert deux sites différents. `IntroSequence` est très exactement la chorégraphie d'entrée que l'acte 0 réclame : décide — rebrancher ou archiver.

**Glyphes.** `↗` U+2197, `→` U+2192, `▶` U+25B6 et `Ⅱ` U+2161 sont **hors du `unicode-range`** déclaré (qui ne couvre que U+2191/U+2193 parmi les flèches) et tombent en repli Arial au milieu d'un lettrage Manrope. `Ⅱ` est le **chiffre romain deux employé comme icône pause** — le détail qu'un juré met en capture d'écran.

---

## 4. LA DEMANDE FONCTIONNELLE D'ADAM — ET SA MÉCANIQUE

**Demande, mot pour mot :** intégrer les images IA des caleçons **SANS mannequins À CÔTÉ** de celles **AVEC mannequins**, sur le **MÊME fond**.

### 4.1 — Le fait décisif : c'est déjà photographié, et le CSS le détruit

Les fichiers ont été **ouverts et regardés**, pas seulement lus dans le code :

- `public/images/editorial/isabelle-apollon/apollon-rose-lyre-v1.webp` (**1024×1536, 123 358 octets**) = **le boxer SEUL**, en lévitation au-dessus d'un socle de marbre, lyre dorée à gauche, branche de laurier à droite, arc et carquois en bas, mur de plâtre rose, sol de marbre réfléchissant. La bande jacquard « AJ LUXURY » de 3,5 cm et la plaque métal y sont **grandes et nettes**.
- `public/images/client/apollon-world/apollon-rose-model-world-v1.webp` (**1731×2600, 326 526 octets**) = **le même plateau**, mêmes props, même mur, avec le mannequin.

**Ratios identiques : 1024/1536 = 1731/2600 = 0,6667.** C'est un couple conçu.

> **Ce qu'Adam appelle « les caleçons SANS mannequins », ce sont les `apollon-*-lyre-v1.webp`.** Un audit les a qualifiés d'« images symboliques, pas des packshots » et a prescrit `product-{rose,lilas,pourpre}-front.webp` à la place. **C'est faux deux fois :** (1) `product-pourpre-front.webp` **n'existe pas** — l'inventaire réel est `product-rose-front`, `-detail`, `-profile`, `product-lilas-front`, `-back`, `-detail`, `-model`, `product-pourpre-alt`, `-back`, `-detail`, plus `product-card-{rose,pourpre}` ; la bascule prescrite est irréalisable pour un coloris sur trois. (2) Les fichiers `-lyre` **SONT** le vêtement seul, sur le même plateau.

**Conséquence de gouvernance : la v1 de la mise en regard ne requiert AUCUN nouvel actif, donc AUCUN gate Isabelle. Elle est livrable sur la preview cette semaine.**

### 4.2 — Arbitrage variante A contre variante B : **VARIANTE A, sans condition**

- **A (`?apollon=world`)** : le mannequin **dans le décor** — même lyre, même laurier, même arc, même sol, même mur que le packshot.
- **B (`?apollon=color`)** : cadre identique au pixel de pose près, avec lyre, laurier, arc, carquois, socle et sol de marbre **entièrement supprimés**. Il reste un mur nu. Écart de poids sur le rose : 326 526 → 269 140 octets, soit **57 386 octets**.

**Point décisif que personne n'avait vu : le panneau gauche (`still`) reste le packshot lyre avec tous ses props dans les DEUX variantes.** Donc A place un packshot avec props à côté d'un mannequin **dans les mêmes props** → même fond, nativement. B place un packshot avec props à côté d'un mannequin **sans aucun prop** → **elle détruit activement le « même fond » qu'Adam demande.**

**Exécution :** supprime `conceptMode`, le champ `bodyColor` des trois entrées de `frames`, et le `useEffect` qui lit `new URLSearchParams(window.location.search).get("apollon")` (ApollonGuidedSequence.tsx:65, 146). **Archive — ne supprime pas** les trois `apollon-*-model-color-v1.webp`, conformément à la doctrine workspace. Coût : 57 Ko par coloris. Bénéfice : la seule chose qui distingue visuellement AJ Luxury de n'importe quel e-shop.

### 4.3 — Mécanique recommandée par le jury (détail en C1)

Un seul sol, une seule lumière, **une seule échelle**. Le panneau gauche devient une **fenêtre sur la même plaque**, pas un second cadrage indépendant.

**Interdits explicites, avec leur raison :**
- **Pas deux `object-fit: cover` indépendants.** Sur des panneaux de 30,5 % et 69,5 %, `cover` donne un facteur d'échelle de 0,457 à gauche et 0,545 à droite, appliqué à des sources de 1024 et 1731 px de large : la **lyre partagée — la preuve même du plateau commun — apparaît ~2,2× plus grande à droite**. La prescription détruit exactement la continuité qu'elle prescrit. Et un `cover` naïf sur un panneau de 921×702 pour une source 1731×2600 **décapite le mannequin**. → **Facteur d'échelle identique aux deux panneaux**, exprimé en `--aj-plate-scale`, alignement par `object-position` seul.
- **Pas de `clip-path` comme propriété « compositable ».** **Chromium ne composite que `transform`, `opacity`, `filter` et `backdrop-filter`.** Supprimer `left`/`right` supprime le layout mais reporte le coût sur le **paint** d'une couche 1731×2600 sur le thread principal. → **Deux transforms contra-rotatifs** : parent `overflow: hidden` translaté, enfant translaté de l'opposé. Coût compositeur pur.
- **Pas de reshoot.** La ligne d'horizon (raccord mur/sol de marbre) est à **~70 %** de la hauteur dans le packshot et **~74,5 %** dans le plan mannequin : **4 points d'écart**, corrigeables par `object-position`. La mesure « 78 % contre 95 % » d'un audit portait sur la **base du socle**, pas sur le sol.
- **Supprime l'asymétrie de l'étalonnage, pas l'étalonnage.** Les deux prises partagent le décor **mais pas l'exposition** — vérifié à l'œil : packshot high-key et diffus, mannequin low-key, éclairé de côté, fortement vignetté, mur nettement plus sombre. Un `--aj-grade` unique appliqué **identiquement** aux deux panneaux remplace le voile directionnel de `.aj-sequence__frame::after`.
- **Le socle de marbre central n'existe que dans le packshot.** Une plaque continue le fera apparaître puis disparaître au raccord : traite-le comme un **problème de composition**, pas comme un bug.
- **`--aj-ground` est per-frame, jamais global.** Les trois plateaux ont **trois murs différents** — plâtre rose, ardoise bleu-gris, bordeaux. Un token unique casserait deux coloris sur trois.

---

## 5. LE PLAN — 13 CHANTIERS, IMPACT DÉCROISSANT

Gains en points de la note globale pondérée. Somme C1→C12 = **6,50**. `3,20 + 6,50 = 9,70`.

**C13 ne porte aucun point, et c'est délibéré.** Son défaut est cuit dans un actif vidéo : il ne se
corrige pas par du code, donc il ne peut pas faire monter une note de code. Mais il est **plein écran
avant tout scroll** — aucun juré ne le manquera. C'est un **bloqueur de perception** : le plan peut
atteindre 9,70 avec C13 non résolu, et le site sera quand même recalé. Il est donc obligatoire, et
son livrable est un dossier de décision, pas un correctif.

**Ordre d'exécution imposé pour la première journée : C12 le matin, C1 l'après-midi.**
**C13 se fait en parallèle dès le premier jour** — c'est de l'observation, il ne bloque rien et il
conditionne un arbitrage d'Adam qui a besoin de temps.

---

### C1 — LA PLAQUE : le diptyque Apollon en une seule prise · **+1,10** · DA + Creativity

**À faire :**
- Supprimer `background: #d5cec9` sur `.aj-sequence__symbol` (5296) et `radial-gradient(...), #15151a` sur `.aj-sequence__body` (5303). Fond unique porté par `.aj-sequence__stage` via `--aj-ground` **injecté par frame** à côté de `--aj-accent`.
- Supprimer `.aj-sequence__stage::before` (5259) : un filet de 1 px tourné à `rotate(3deg)` sur un stage de 702 px rate le raccord vertical réel de **±18,4 px** à chaque extrémité (`(702/2) × sin 3°`).
- Supprimer l'**asymétrie** de `.aj-sequence__frame::after` (5327) — le `linear-gradient(90deg, rgba(7,7,9,0.6) …)` ne charge que le packshot — au profit d'un `--aj-grade` unique.
- Une seule échelle : `--aj-plate-scale`, `object-position` seul pour l'alignement.
- Volet, pas fondu : `@property --aj-wipe { syntax: '<percentage>'; inherits: false; initial-value: 100% }` + deux transforms contra-rotatifs.
- Sortir `.aj-sequence__copy` du panneau packshot : `left: clamp(24px,3vw,46px)` + `width: min(29%,390px)` la place de x≈43 à x≈433 pour un split à 518 px, donc **intégralement sur le vêtement**.
- `.aj-sequence__body img` : `object-fit: contain` produit **411 px de fond vide = 51 % de la colonne**. À traiter par l'échelle unique, pas par un `cover` naïf.

**Critères d'acceptation :** horizon du marbre à **≤4 px** entre les deux panneaux à 1440 · hauteur apparente de la lyre partagée à **≤8 %** d'écart · les deux panneaux renvoient le même `background-color` calculé et `background-image: none` · **ΔE2000 < 3** à 5 px de part et d'autre du raccord, à 25/50/75 % de la hauteur · **0 px** de fond vide dans la colonne mannequin · luminance moyenne des deux panneaux à **≤6 %** d'écart · pendant le volet, **0 `Layout` ET 0 `Paint`** attribués aux deux panneaux · **≤2 frames > 16,7 ms sur 120** · **un fondateur nommé par acte**.

---

### C2 — ÉCRIRE LA SÉQUENCE AVANT DE LA CÂBLER : trois actes, une seule horloge · **+1,00** · Creativity + UX

**À faire :**
- Supprimer `FRAME_DURATION = 5600`, `autoplayRef`, le tween de progression avec `onComplete: setActive((c+1)%3)` et le `useEffect [paused, inView, pageVisible, reducedMotion, active]`. **Une séquence guidée n'a qu'une horloge, et sur une page épinglée cette horloge est le scroll.**
- Une timeline, un pin : `scrollTrigger: { trigger: wrapper, start:'top top', end:'+=220%', pin: wrapper, pinSpacing:true, scrub:1, anticipatePin:1, invalidateOnRefresh:true, fastScrollEnd:2500 }` avec `addLabel('rose'|'lilas'|'pourpre')`.
- **`+=220%`, ni `+=85%` ni `+=300%`** : 1980 px pour trois actes = 660 px par acte, chaque acte portant un changement de valeur réel.
- **Épingle le wrapper, jamais le nœud animé** — aujourd'hui `sequenceStage` est à la fois `trigger`, cible de `pin` et cible des tweens `clipPath`/`y`.
- **Pas de `snap: {snapTo:'labelsDirectional'}`** : le snap déplace la position de scroll de l'utilisateur après qu'il a cessé de scroller. C'est l'override de contrôle que le même audit interdit trois prescriptions plus loin. Les onglets restent l'override manuel : `gsap.to(window,{ scrollTo: tl.scrollTrigger.labelToScroll('lilas') })`.
- **Acte 1** : la plaque se révèle, le vêtement seul. **Acte 2** : le volet — le vêtement seul devient le vêtement porté, **la bascule émotionnelle et la demande d'Adam**. **Acte 3** : le coloris change sur un décor tenu.
- Le changement de coloris **n'est pas un crossfade de frames entières** (aujourd'hui `visibility`/`opacity` sur tout l'`<article>`) : tiens la lyre, l'arc et le marbre fixes, ne dissous que le vêtement et la teinte du mur.
- **Instrumente avant de construire.** `tests/motion.e2e.mjs` (Playwright) est le **premier** livrable : `page.mouse.wheel` exclusivement, **jamais** `window.scrollTo`. Log horodaté à l'entrée du callback `media.add("(min-width:981px)…")` : valeur du garde, `gsap.matchMedia().contexts.length`, `ScrollTrigger.getAll()`.

**Critères :** exactement **1 trigger `pin:true`** · 3 labels atteignables au clic **et** au clavier · **10 s d'immobilité → `active` inchangé**, 0 mutation observée sur `.is-active` · `--aj-wipe` varie d'au moins **60 points** entre deux positions atteintes à la molette · `PerformanceObserver('longtask')` = **0** sur la traversée · **un fondateur explicitement assigné à chaque acte**, ratio solo Jérémy / solo Alex = **1,00** sur la section.

---

### C3 — LE PREMIER ÉCRAN · **+0,90** · Direction artistique

Aucun site n'a été Site of the Day sur son deuxième écran. Aucun des six audits n'en avait fait sa priorité.

**À faire :**
- Le `<h1>` sort de `.aj-film__portrait--sr` et **devient la composition** : famille display, ~106-132 px à 1440, trois lignes, révélées par `SplitText.create(el, { type:'lines', mask:'lines', autoSplit:true })` — **libre depuis GSAP 3.13**, et la seule API qui survive au font-swap et au resize sans re-split cassé. **Zéro occurrence de `SplitText` sur toute la branche aujourd'hui.**
- Supprimer `.aj-film__signature p { background-clip:text; -webkit-text-fill-color: transparent }` (3406-3431).
- **Réparer le clignotement :** état `[data-gsap="pending"]` posé côté serveur, ou `immediateRender: false`.
- `object-fit: contain` → `cover` sur `.aj-film__hero-poster img` et `.aj-film__hero-video` ; supprimer les trois occurrences de `background: #4c4a4b` (3133, 3151, 3156).
- **Corriger `PORTRAIT_POSTER_SIZES`** avant toute refonte de l'échelle de sources.

**Critères :** **≥1 nœud de texte visible ≥90 px** dans le premier écran · élément LCP = l'image du poster, `currentSrc` contenant `desktop-1920x1080`, **jamais** `portrait-480x623` · **0 px de `#4c4a4b`** à 1440×900 et à 390×844 · **aucun élément visible au premier paint ne passe à `opacity:0` dans les 2 s suivantes** (trace enregistrée) · 0 ressource préchargée non consommée en console.

---

### C4 — LE SYSTÈME TYPOGRAPHIQUE · **+0,85** · Direction artistique

Réponse littérale et mesurable à « les infos trop petites et paas beau ».

**À faire :**
- **Deux familles.** Display : variable à axe optique réel. **Bodoni Moda VF** (OFL, `opsz` 6-96 + `wght` 400-900) est la réponse libre et juste, et son registre — Didone, Paris, 1798, néoclassicisme — est exactement le registre marbre/lyre/laurier que la marque possède déjà. Montées payantes : Caponi Display (Production Type) ou Signifier (Klim). `font-optical-sizing: auto` **plus** un `font-variation-settings: "opsz" <px>` explicite par palier.
- **Pas `font-display: optional`** : aucune phase de swap, donc au premier chargement — celui du jury — le h1 de 132 px s'affiche dans la police de repli. Et cela contredit le handoff `document.fonts.ready` dont dépend le reveal SplitText. → **`swap` avec `size-adjust` et `ascent-override` calibrés sur Manrope**, CLS < 0,02.
- Échelle modulaire de 8 paliers, base fluide 17→19 px, ratio 1,333, **plafond dur ~142 px**. `.aj-proof__material dt` passe de 245 px rendus au plafond.
- Plancher **15 px bas de casse, 16 px capitales**, verrouillé par `stylelint declaration-property-value-disallowed-list`.
- Table de tracking par palier : ≥96 px −0,03em / 64-96 −0,025 / 40-64 −0,02 / 28-40 −0,015 / 20-28 −0,01 / 15-20 zéro / labels capitales +0,08 maximum.
- Couche glyphes : SVG inline `aria-hidden`, 12×12, `currentColor`, pour `↗ → ▶ Ⅱ`.
- **Ne retiens pas le critère « aucun rect de glyphe ne se chevauche »** : `Range.getClientRects()` renvoie des **boîtes d'avance** ; des caractères adjacents produisent toujours des rects contigus, écart exactement 0. Le critère échoue sur une composition parfaite.

**Critères :** `document.fonts` = **exactement 2 familles** · 0 déclaration de la famille texte au-dessus de 20 px et 0 de la famille display en dessous de 24 px · **0 nœud de texte visible sous 15 px** à 1440×900 · rapport plus-grand/plus-petit corps **≤9,5:1** (aujourd'hui 30,6:1) · 0 caractère U+2150-218F dans le DOM · `↓ → ↗ ▶` résolvent la même `fontFamily` · **CLS < 0,02**.

---

### C5 — LA PARTITION CHROMATIQUE ET LE RYTHME · **+0,75** · Direction artistique

**À faire :**
- Palette **échantillonnée sur les plaques elles-mêmes**, jamais inventée. `--aj-ground` per-frame.
- Introduire le **ton moyen manquant** : aucun fond de **section** n'existe entre L\*5 et L\*93.
- **Le ton moyen ne va ni sur la boutique ni sur le moodboard** : ce sont les deux seules surfaces où l'on lit le produit. Un boxer rose pâle sur un mur `#b8878f` et un lilas sur du bronze éteignent le vêtement. Il appartient à la preuve/manifeste et au récit.
- Supprimer `.aj-section-break` (3088-3092).
- Rythme : `.aj-story` de 0,34 à **≥0,85 écran**, paragraphe de 31,7 px à **≥60 px** ; footer de 1,38 écran cumulé à **≤0,50**.
- Règle opposable : **deux fonds adjacents jamais séparés de moins de 12 L\***.
- **Marge de contraste, jamais le seuil nu.** L'encre `#2a2a2e` sur `#b8878f` donne 4,72:1 et sur `#b08d5e` 4,67:1 : AA franchi de 0,2 point, zéro marge. **Plancher opposable à 5,0:1.**

**Critères :** ≤5 fonds de section distincts · ≥2 sections dans **L\*40-70** · aucune paire adjacente à moins de 12 L\* · aucune suite de sections adjacentes totalisant >1,6 écran dans une plage de 12 L\* (aujourd'hui shop+moodboard = 1848 px = 2,05 écrans à 0,3 L\*) · `.aj-story` **strictement plus haute que le footer** · `.aj-section-break` absent du DOM · toute paire texte/fond **≥5,0:1**.

---

### C6 — LA SÉQUENCE SUR MOBILE · **+0,60** · Design + Usability + Creativity

Le seul endroit où le site passe de « motion faible » à « motion inexistant ». Une marque de sous-vêtement recrute par Instagram et TikTok ; le jury note le mobile comme une dimension propre.

**À faire :**
- **Deux branches `matchMedia`, pas un gate desktop** : desktop split horizontal ; mobile pin vertical, `end:'+=180%'`, volet vertical, plus `ScrollTrigger.normalizeScroll(true)` et `ScrollTrigger.config({ ignoreMobileResize: true })` pour la barre d'URL, unités `svh`/`dvh`.
- **Laisse `pinType` à sa valeur par défaut `fixed`.** `transform` n'est justifié qu'avec un smooth-scroll virtualisé, absent ici — et un ancêtre transformé devient le **bloc conteneur de tout descendant `position: fixed`**, ce qui piégerait toute barre ou overlay persistant dans la scène épinglée.
- Restaurer les trois noms de coloris, le paragraphe d'introduction et la barre de progression.

**Critères :** à **390×844**, `document.querySelectorAll('.pin-spacer').length === 1` · les trois noms de coloris sont rendus (**0 `display:none` sur `> strong`**) · **0 `font-size: 8px`** codé en dur dans le bloc mobile · **CLS < 0,01** à l'apparition et à la disparition de la barre d'URL.

---

### C7 — UNE SEULE AUTORITÉ D'ANIMATION, ET UN LANGAGE DE MOUVEMENT TOKENISÉ · **+0,45** · Creativity

**À faire :**
- Corriger les **2 vraies collisions** (`.aj-product-card`, `.aj-moodboard__item`) et, séparément, le défaut **parent/enfant** de multiplication d'opacité sur `.aj-shop__heading` et `.aj-story__copy`.
- Doctrine cible : **CSS scroll-driven (`animation-timeline: view()`) pour les entrées atomiques non orchestrées ; GSAP exclusivement** pour ce qui est épinglé, scrubbé, séquencé ou dépendant d'un autre chapitre.
- **Tokens de mouvement : 5 durées, 3 eases dont un `CustomEase` de signature, une unité de stagger.** Et **on ne repeint rien avant que la grille soit posée.**
- Remplacer les cinq `once: true` par `ScrollTrigger.batch(..., { overwrite: true })`.
- **Rejette `ScrollTrigger.config({ autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load' })`** : cela retire `resize` de la liste par défaut et contredit frontalement le critère de réversibilité au resize. `ignoreMobileResize: true` seul couvre le cas de la barre d'URL.
- **Rejette le critère `getAll().length ≤ 6`** : le nombre de triggers n'est ni une métrique de qualité ni de performance ; il pousse à fusionner des chapitres indépendants pour satisfaire un chiffre arbitraire.

**Critères :** pour chaque élément animé, **une seule autorité écrit `opacity`/`transform`** — audité en **désactivant la feuille de style et en constatant l'état inline**, jamais par `el.getAnimations().length` qui renvoie aussi les `CSSTransition` (le bloc 4276-4284 en pose une sur `.aj-product-card` précisément) · **≤5 durées distinctes et ≤3 eases** dans tout le code · après un cycle 1440→900→1440, **tous les états d'entrée sont rejoués**.

---

### C8 — LE SCROLL REDEVIENT PILOTABLE, ET LES CHAPITRES S'ORDONNENT · **+0,30** · Usability + Creativity

**À faire :**
- Retirer `scroll-behavior: smooth` de `html` (38) et de `.home-shell` (1591).
- **Ne route pas les ancres via `gsap.to(window,{scrollTo})`** : cela casse la mise à jour du hash, le retour arrière et le contrôle utilisateur pour ~2 Ko de plugin. Les **ancres natives avec `scroll-behavior: auto`** sont la bonne réponse.
- `refreshPriority: 1` sur le trigger épinglé, `-1` sur les triggers boutique ; `start: () => sequenceST.end + 120`, `invalidateOnRefresh: true`, puis `ScrollTrigger.sort()`.
- `await Promise.all([...imgs].map(i => i.decode().catch(()=>{})))` puis `ScrollTrigger.refresh()`.

**Critères :** `getComputedStyle(document.documentElement).scrollBehavior === 'auto'` · **aucun trigger boutique n'a un `start` inférieur au `end` du trigger épinglé** · après `refresh()`, `st.start` et `st.end` varient de **moins de 2 px**.

---

### C9 — LE CONTRÔLE NON VISUEL ET LE CLAVIER · **+0,25** · Usability

**À faire :**
- Retirer `aria-live="polite"` de `.aj-sequence__visuals`. Une fois C2 livré, garder un unique `<p class="sr-only" aria-live="polite" aria-atomic="true">` **alimenté sur activation manuelle seulement**.
- Séparer le **token d'indicateur** du token de marque ; barre à **3 px**.
- Ajouter `select` à la règle typée de focus ; retirer `tabIndex={0}` de `<section className="aj-moodboard">` au profit du nœud réellement défilable, avec `role="region"` et `aria-label`. **Recolorer l'anneau : `#676dd8` est hors palette.**
- `.aj-sequence__copy` est posé sur une **photographie dont la luminance change à chaque coloris** : la SC 1.4.3 y est **indécidable par construction**. Aucun token, aussi bien calculé soit-il, ne garantit un ratio contre une image. Il faut un **scrim déterministe** ou un déplacement sur surface unie — **arbitrage de design, à trancher dans C1**.
- 5 liens `<a>` sans nom accessible ; le logo est un **lien**, il lui faut un **nom de lien**, pas un `alt` d'image.
- **N'ajoute pas d'`alt` aux deux posters hero ni à l'overlay d'identité** : `HeroComposition.tsx` rend déjà `<figure className="aj-film__portrait--sr"><figcaption>AJ Luxury — Jérémy, Alex — Apollon Lilas Céleste</figcaption></figure>` ; les nommer produirait **trois annonces du même contenu**.
- `prefers-reduced-motion: reduce` doit livrer une **variante réduite**, pas une page vide : trois actes statiques empilés, même contenu, ancres, `alt` complet sur les trois frames.

**Critères :** **NVDA + Chrome, 60 s sur le chapitre sans interaction = 0 annonce spontanée** · axe-core = **0 violation serious ou critical** à 390/768/1024/1280/1440/1920 **plus 1280×640** · chaque arrêt de focus présente un anneau **≥3:1 contre les deux fonds adjacents** · chaque élément focalisé vérifie `0 <= getBoundingClientRect().top <= innerHeight`.

---

### C10 — LA GÉOMÉTRIE DU PIN ET LA COUCHE IMAGE · **+0,15** · Usability

**À faire :**
- Lier la hauteur du stage à `min(78svh, 100svh - hauteurControls - 2×gutter)`.
- **Arbitre le chemin `srcset` par écrit avant d'énoncer un critère.** Avec `images.unoptimized: true`, `next/image` n'émet **aucun** `srcset`. Deux chemins seulement : réactiver un runtime d'images sur Cloudflare Workers — **choix explicitement rejeté dans le dépôt** — ou pré-générer les dérivés au build avec `sharp`. **Tant que cet arbitrage n'est pas écrit, « 17/17 avec srcset » est un critère sans chemin.**
- Régénérer le logo en **212×153**.
- Passer la frame active de la séquence en `loading="eager" fetchPriority="high"`.

**Critères :** à **1280×640**, toute la barre de contrôle reste dans le viewport pendant **l'intégralité** du pin · **0 image avec `naturalWidth > clientWidth × devicePixelRatio × 1,15`** · l'arbitrage `srcset` est **consigné par écrit, daté, avec un décideur nommé**.

---

### C11 — LA MARQUE PARLE · **+0,10** · Content + Design

**À faire :**
- Retirer « Reveal Your Inner Beauty » comme signature — **mais pas pour l'argument de traduction, qui est faux** : une signature premium reste légitimement dans une seule langue ; une signature qui mute par locale n'est plus une signature, c'est une accroche. Les deux raisons qui tiennent : **registre cosmétique de consolation**, et **éloge descriptif générique dont le périmètre de protection en classe 25 est quasi nul**.
- **Aucune ligne de remplacement n'est adoptée.** « Beauty begins underneath » est reprenable mot pour mot par CDLP ou Le Slip Français ; « Le luxe le plus près de la peau » est le positionnement littéral de Sunspel et Hanro. → **OPEN DECISION — décideur : Adam.** Test opposable écrit : **la phrase retenue ne doit pas pouvoir être reprise sans modification par CDLP, Le Slip Français ou Hanro.** Propose trois candidates qui passent ce test ; n'en adopte aucune sans Adam.
- **Nommer les fondateurs dans le texte visible.** Aujourd'hui Jérémy et Alex n'apparaissent que dans des `alt` de `editorial-moodboard.ts` et dans un `<figcaption>` enfermé sous `.aj-film__portrait--sr`.
- Unifier le nommage : `Pourpre Impérial` / `Lilas Céleste` / `Rose Velours` = impérial / céleste / textile — **trois systèmes sémantiques pour trois références**. Soit le registre apollinien intégral, soit le registre nu. Un quatrième coloris doit être nommable par déduction.
- Supprimer `.aj-shop__close`, doublon verbatim de `.aj-proof` deux écrans plus haut.

**Critères :** la signature retenue **échoue le test de substitution** pour les trois marques nommées · les prénoms **Jérémy et Alex figurent dans le texte visible** de l'accueil · les trois noms de coloris partagent un registre identifiable · **aucune chaîne de ≥15 caractères n'apparaît deux fois** dans le texte visible.

---

### C12 — LE HARNAIS, LA BRANCHE, L'URL DE SOUMISSION · **+0,05 direct — condition de démontrabilité des douze autres**

**Premier livrable. Avant toute ligne de C1.**

- `tests/motion.e2e.mjs` devient **rouge** si le pin est retiré, si `scroll-behavior: smooth` revient, ou si un sélecteur repasse sous double autorité CSS + GSAP.
- **Ligne de base sur la PREVIEW**, datée : TTFB / LCP / INP / CLS. Aucun critère contre la production.
- **Gouvernance de branche : la branche existe déjà, ne la recrée pas.** `claude/front-awwwards-20260817`, coupée à `59d595e`, checkout fait, poussée sur `origin`. Aucune écriture sur `codex/ajl-awwwards-experience-20260815`. **Aucun des douze rendus antérieurs n'avait nommé la branche de destination** — d'où cette ligne.
- Inventaire du code mort avant reconstruction : `IntroSequence.tsx`, `ApollonHorizontalRail.tsx`, `.aj-apollon-myth`, `.aj-featured`. **Décide : rebrancher ou archiver.**
- **Une seule URL de soumission, sans paramètre de requête.** `?apollon=` ne doit pas survivre.

**Critères :** le harnais est **commité, vert sur la branche corrigée, rouge sur chacune des trois régressions** · une **ligne de base TTFB/LCP/INP/CLS existe sur la preview, datée** · `git branch --show-current` renvoie **`claude/front-awwwards-20260817`** · un **arbitrage écrit et daté** existe pour chacun de : variante A/B, chemin `srcset`, signature, composants morts.

---

### C13 — LA DÉCOUPE DES VISAGES DANS LA VIDÉO HERO · **0 point — bloqueur de perception** · DA + Content

**Premier plan du site, plein écran, avant tout scroll. Aucun jury ne dépasse ça.**
Relevé par Adam. **Absent des douze rendus experts et testeurs.**

**Constat, grossissements CSS ×2,6 puis ×4,2 sur `ajluxurystore.com` :**
- silhouette des cheveux **détourée en dur** sur les deux mannequins, **aucun détail de mèche** contre
  le fond métallique — le bord est géométrique, pas photographique ;
- **liseré clair** le long de la chevelure du mannequin de gauche ;
- **rupture de raccord mâchoire / cou** : la tête est posée sur le buste ;
- **désaccord de température et de direction de lumière** entre visage et torse — visage frontal et
  froid, corps éclairé de côté et plus chaud ;
- **visage nettement plus mou que le corps**, dont la définition musculaire est nette.

*Réserve honnête, à conserver dans ton rapport : à ×4,2 sur une source 1440×810, le manque de piqué
est amplifié par l'agrandissement. **Le bord géométrique de la chevelure et l'absence totale de détail
de mèche, eux, ne sont pas des artefacts d'agrandissement.***

**Ce que tu ne peux PAS faire.** Le défaut est **cuit dans le fichier mp4**. Vérifié sur la page de
production : `overlayPngUtilise: []` — aucun `hero-identity-overlay-*.png` n'est chargé, le hero
n'est composé que de `.aj-film__hero-video` (z-index 1) au-dessus de ses posters.
**Aucun filtre, masque, `mix-blend-mode` ou correction CSS ne réparera un détourage raté dans la
source.** N'essaie pas : tu ne ferais que déplacer l'artefact et perdre une journée.

**À faire :**
- **Constater et documenter, sans corriger.** Captures à 1440×900 et 390×844, aux timecodes où les
  deux visages sont les plus lisibles, plus un grossissement sur chaque tête.
- **Chiffrer le coût de perception** : à quelle taille de rendu la découpe devient invisible, et si un
  **recadrage plus large** — qui éloigne les visages — atténue suffisamment en attendant un nouveau rendu.
- **Proposer le recadrage comme mesure provisoire uniquement**, en écrivant noir sur blanc que c'est
  un pansement et non une correction.
- **Vérifier si le défaut existe aussi sur la preview** ou seulement sur le build de production —
  les deux servent des `.mp4` du même lot, mais ne le suppose pas : mesure-le.
- **Ne commande aucun nouveau rendu.**

**Contrainte dure de gouvernance.** La vidéo v4 est un actif d'**Isabelle**, sous autorisation
archivée pour le site AJ Luxury. **Un nouveau rendu est un nouvel actif** →
`PROPOSED — ISABELLE NOT YET CONFIRMED`, accord direct requis avant toute production.
**Tu prépares la décision, tu ne la prends pas.** Décideur : Adam.

**Critères :** un dossier de constat opposable — captures, timecodes, points de rupture nommés ·
une réponse mesurée à « la preview est-elle affectée aussi ? » · une recommandation chiffrée entre
**recadrer** et **re-rendre**, avec le coût de chacune · **zéro octet modifié sur un actif vidéo**.

---

## 6. LA GAUNTLET LOOP — À EXÉCUTER, PAS À RÉSUMER

### 6.1 — Phase 1 : les neuf agents experts

Lance-les **en parallèle**, chacun avec le présent document en entrée. Niveau exigé pour tous : **expert mondial de référence, état de l'art août 2026 / 2027**. Une recommandation qui pourrait s'appliquer à n'importe quel site est une recommandation nulle.

| # | Agent | Discipline et mandat | Chantiers |
|---|---|---|---|
| **E1** | **Ingénieur motion GSAP** | GSAP 3.15 / ScrollTrigger / SplitText / Flip + scroll-driven animations natives (`view()`, `scroll()`). Doit connaître ce que Chromium composite réellement. | C2, C7, C8 |
| **E2** | **Directeur artistique digital** | Webdesign niveau Awwwards SOTD. Composition, échelle, lumière, raccord photographique. | C1, C3, C5 |
| **E2b** | **Retoucheur / compositeur d'image** | Détourage, raccord de carnation, cohérence de lumière, artefacts de compositing sur séquence animée. **Doit regarder l'image, pas le DOM.** | **C13** |
| **E3** | **Typographe / designer de systèmes** | Fontes variables, axes `opsz`/`wght`, échelles modulaires, métriques de substitution (`size-adjust`, `ascent-override`), tracking par palier. | C4 |
| **E4** | **Directeur UX / scrollytelling** | Budget de scroll par beat, contrôle utilisateur, chapitrage, override manuel. | C2, C6, C8 |
| **E5** | **Ingénieur front mobile / tactile** | Pin en scroll natif tactile, `svh`/`dvh`, barre d'URL, `normalizeScroll`, `pinType`, budget de frames sur milieu de gamme. | C6, C10 |
| **E6** | **Stratégiste de marque** | Sous-vêtement masculin premium. Positionnement, verbal, nommage, opposabilité d'une signature, parité fondateurs. | C11, parité C1/C2 |
| **E7** | **Expert perf / a11y / grille Awwwards** | Core Web Vitals, WCAG 2.2 (1.4.3, 1.4.11, 2.4.13, 2.5.8), ARIA APG, pondération jury. | C3, C9, C10, C12 |
| **E8** | **Ingénieur qualité / harnais** | Playwright, instrumentation DevTools reproductible, non-régression, gouvernance de branche. | C12, preuves §8 |

**Consigne commune, non négociable, à recopier dans chaque brief d'agent :**
1. **Vérifie avant d'affirmer.** Toute prémisse doit être mesurée ou lue dans la source, avec ligne et fichier. La §3.2 liste cinq affirmations falsifiées : les reprendre est un échec automatique.
2. **Ne cite jamais une mesure de production comme description de la branche.** Six rendus sur douze l'ont fait.
3. **Chaque prescription porte un critère d'acceptation exécutable.** Pas de taux sur un site sans trafic. Pas d'outil qui ne peut pas atteindre le terrain.
4. **Aucun actif à créer sans le gate.** Vérifie l'inventaire par `git ls-tree` avant de citer un fichier. `product-pourpre-front.webp` n'existe pas.
5. **Design 40 % + Creativity 20 %.** Si ton rendu ne déplace que Usability et Content, il ne sert à rien.

### 6.2 — Phase 2 : les neuf mêmes en agents testeurs adversariaux

**Ne saute pas cette phase.** Verdict du tour précédent : **les testeurs ont surpassé les experts.** Chacun des six experts avait construit au moins une prescription phare sur une prémisse non vérifiée — trois sur la **même** hypothèse d'hydratation falsifiée. Chacun des six testeurs a attrapé au moins un critère d'acceptation inopérant. La couche adversariale s'est payée.

Chaque testeur `T1..T8` plus `T2b` reprend la discipline de son expert `E1..E8` plus `E2b` et rend **strictement** :
- **Prescriptions validées** — avec la vérification qui les valide (fichier, ligne, mesure).
- **Prescriptions rejetées** — avec le motif technique du rejet. Une prescription auto-contradictoire, un chemin inexistant, un critère non falsifiable, un mécanisme mal attribué : rejet.
- **Manques critiques** — ce que l'expert n'a pas vu, et pourquoi c'est bloquant.
- **Note du travail expert / 10.**

**Critères connus comme inopérants — un testeur qui les laisse passer a échoué :** chevauchement de `getClientRects()` · `getAll().length ≤ 6` · `getAnimations().length + inline === 1` · tout taux (`size_selected/product_view`, panier moyen) sur un site sans trafic · Rich Results Test sur une preview privée · TTFB contre une baseline de production · « contraste ≥ 4,5:1 sur le prix » (déjà ~6,3:1) · « 4 garanties sans scroll à 390×844 » incompatible avec le plancher typographique du même audit.

### 6.3 — Phase 3 : le jury final

Le jury reçoit les 9 rendus experts + les 9 contre-tests. Il produit :
1. **Une note par discipline et une note globale**, calculée explicitement à la pondération `Design 0,40 · Usability 0,30 · Creativity 0,20 · Content 0,10`.
2. **Sa tranche sur chaque désaccord expert/testeur non résolu**, avec la vérification qui la fonde.
3. **La liste de ce qui reste sous le seuil.**

**Seuil : 9,7/10.**

**Boucle de reprise :** tant que la note globale est `< 9,7`, le jury renvoie **nominativement** les chantiers déficitaires aux agents concernés, avec le delta de points manquant et la raison exacte. Ceux-ci reprennent, leurs testeurs recontrôlent, le jury renote. **Trois tours maximum.** Au troisième échec sur le même chantier, arrête et remonte à Adam les positions en présence — c'est la règle anti-boucle du workspace, et les chaînes multi-agents séquentielles se dégradent fortement au-delà.

**Le jury ne peut pas inflater une note pour atteindre le seuil.** Un plan de qualité peut passer pendant que la preuve de terrain reste faible. L'issue honnête « le plan passe, le site reste à démontrer » est une issue valide et doit être écrite telle quelle.

---

## 7. CONTRAINTES DURES ET INTERDITS ABSOLUS

**Interdits — aucune exception, aucune reformulation.**

1. **Aucune mise en production.** Commerce fermé, **rollback R10 v15 live**, aucun paiement, transporteur ou e-mail réel connecté. **La preview Cloudflare privée est le seul terrain.**
2. **Aucune écriture sur `codex/ajl-awwwards-experience-20260815`** ni sur aucune branche `codex/*`. Un repo, une branche, un agent. Ce travail vit sur **`claude/front-awwwards-20260817`**, déjà créée et déjà active — voir §0.
3. **Aucun engagement commercial ou opérationnel inventé.** Interdits nommément : le SKU « Trio Apollon » à 79 €, tout prix dégressif, l'échange de taille offert, le libellé bancaire neutre, tout délai de livraison chiffré, toute extension de `CLIENT_VALIDATED_PARCEL_MAX_ITEMS` ou création d'`AJL_ENVELOPE_{4,5,6}_ITEMS_V1`. *(Note de lecture : le plafond réel est `currentQuantity >= 5 || (runtimeMode === 'production' && itemCount >= 3)` — le 3 ne s'applique qu'à la production, qui est fermée. Le « panier maximum de 89,97 € par construction » n'existe pas sur le terrain de test.)*
4. **Aucun nouvel actif créatif sans gate.** Tout ce qui n'existe pas déjà dans le dépôt est **`PROPOSED — ISABELLE NOT YET CONFIRMED`** : packshot supplémentaire (dos, macro ceinture), régénération des plans rose et pourpre dans la lumière du lilas, **et tout élargissement d'usage des actifs `editorial/isabelle-apollon/*` au-delà du web** — grille Instagram, carton, encart colis, print. **Le gate le plus manqué est le dernier :** passer d'un usage web interne à un usage packaging et réseaux est un changement de périmètre, de crédit et de licence. *(Une licence typographique, elle, est un contrat éditeur : n'invoque pas le consentement d'Isabelle dessus — cela dilue un garde-fou qui doit rester exact pour rester crédible.)*
5. **La parité Jérémy / Alex est un acquis.** Elle est **aujourd'hui rompue** dans la section signature (ratio 2:1, vérifié à l'ouverture des frames). Elle entre dans les critères de C1 et C2, pas dans une note de bas de page.
6. **La vidéo hero fonctionne — n'y touche pas.** ~~Le `<video>` de production est vide~~ : **constat retiré le 2026-08-17**, voir §0 bis ①. Mesure : `readyState: 4`, `1440×810`, 7,04 s joués, lecture unique par conception. `docs/PROJECT-BACKLOG.md` AJ-105 est exact. **Le seul défaut réel de la vidéo est la découpe des visages, traitée en C13 — et il est cuit dans le mp4, donc hors de portée du code.** Aucune prescription sur la disponibilité, le chargement ou le format de la vidéo.
7. **Zéro heure sur le débogage de l'ancien pin.** C2 le rend caduc, C12 tranche le fait.
8. **Ne re-rends aucun actif vidéo ou image, et n'en commande aucun.** C13 prépare la décision, il ne l'exécute pas. Le décideur est Adam, après accord direct d'Isabelle.

**Hors périmètre, et pourquoi — ne dépense rien là-dessus.**

- Tout ce qui est **en aval de l'ajout au panier**. Restent dedans, parce que ce sont des corrections à coût nul : prix sur `/shop` (une ligne), `<h1>` unique et descriptif par PDP, plancher typographique transactionnel (absorbé par C4).
- Le **guide des tailles comme tâche de développement** : la table rend quatre fois « Mesure à confirmer » parce que personne n'a les mesures. Livrable réel : un composant à trois colonnes **plus** une demande de mesures datée au fabricant. Et ancrer le guide sur les mensurations de Jérémy et Alex exige leur **consentement écrit préalable** — des mensurations nominatives d'individus identifiés sont des données personnelles.
- **JSON-LD** : `generateMetadata` du PDP pose déjà `robots: { index:false, follow:false }`. Aucun dommage actuel, item de porte de lancement. Le jury Awwwards ne lit pas le JSON-LD.
- **Réécriture WebGPU/TSL du champ métallique** (equirectangulaire RGBE en KTX2, GGX anisotrope, dispersion, SDF metaballs, bruit bleu). Trois motifs : actif créatif nouveau sans gate ; **il n'y a pas de plateau à photographier, ce sont des images IA** ; et cela remplace un composant qui porte `prefers-reduced-motion`, un kill mobile, `MAX_FPS 30` et un fallback CSS par un pipeline à 4 ms GPU/frame sur un fond décoratif, sans budget INP/LCP. Le métal se corrige dans C5 par l'étalonnage et le dé-banding.
- **Fabrication de props physiques, macro ceinture, favicon, embossage carton, encart colis.** Hors budget, hors terrain — et partiellement fondé sur un fait faux : la ceinture et sa plaque **sont déjà photographiées, grandes et nettes**.
- **Reshoot intégral des prises portées.** L'actif **lilas est déjà le clair-obscur latéral doux** que la critique réclame : c'est le contre-exemple qui invalide la généralisation. Voie courte : régénérer rose et pourpre **dans la lumière du lilas**, et faire du lilas la référence de direction photo.
- **`experimental.viewTransition` et le canal React expérimental.** Déplacer la base de rendu d'un site client gelé sous rollback pour un effet de transition. Les cross-document view transitions et le `<ViewTransition>` same-document sont des chemins **exclusifs**, pas cumulatifs. Même verdict pour `document.startViewTransition` sur le changement de coloris : les trois `<article>` coexistent en permanence dans le DOM, donc des `view-transition-name` dupliqués dans un même instantané font **avorter** la transition.
- **Le moodboard mobile.** Il fonctionne. Voir §3.2.

---

## 8. CRITÈRES DE PREUVE — COMMENT TU DÉMONTRES CHAQUE LIVRABLE

**Rien n'est livré tant que ce n'est pas prouvé. Une capture d'écran seule ne prouve rien ; une mesure sans commande reproductible ne prouve rien.**

### 8.1 — Le harnais, avant tout le reste

```
tests/motion.e2e.mjs        # Playwright, page.mouse.wheel EXCLUSIVEMENT
npm run test:motion         # vert sur la branche corrigée
```

Il doit passer au **rouge** sur chacune de ces trois régressions injectées volontairement, et tu joins la sortie des trois runs :
1. suppression du `pin: true` ;
2. réintroduction de `scroll-behavior: smooth` sur `html` ;
3. remise d'un sélecteur sous double autorité CSS + GSAP.

**Interdiction absolue de `window.scrollTo` dans toute mesure de ce projet** tant que `globals.css:38` existe. Toute campagne qui l'utilise est nulle et sera rejetée.

### 8.2 — Ligne de base, datée, sur la preview

```bash
git branch --show-current          # doit renvoyer claude/front-awwwards-20260817
git log -1 --format="%H %ad"
curl -sSo /dev/null -w "%{time_starttransfer}\n" <preview-url>   # ×5, médiane
```

Plus une trace Lighthouse (5 runs, médiane) desktop 1440×900 **et** mobile : **TTFB / LCP / INP / CLS**, avant et après. Tout chiffre de performance non pris sur la preview est irrecevable.

### 8.3 — Preuve par chantier

| Chantier | Preuve exigée |
|---|---|
| **C1** | Script d'échantillonnage **ΔE2000** à 5 px de part et d'autre du raccord, aux hauteurs 25/50/75 %, sortie JSON jointe · trace **DevTools Performance** de 5 s de volet, montrant **0 `Layout` et 0 `Paint`** sur les deux panneaux, plus l'histogramme de frames · captures 1440×900 **avant / après**, côte à côte · script de mesure de l'horizon et de la hauteur apparente de la lyre, sortie jointe |
| **C2** | `ScrollTrigger.getAll().filter(t=>t.pin).length === 1` · relevé de `--aj-wipe` à 3 positions atteintes **à la molette** · test d'immobilité 10 s avec `MutationObserver` sur `.is-active`, log joint · `PerformanceObserver('longtask')` sur la traversée complète · tableau **acte → fondateur** |
| **C3** | `document.querySelector('.aj-film__hero-poster img').currentSrc` · trace de chargement horodatée prouvant qu'**aucun élément visible au premier paint ne passe à `opacity:0` dans les 2 s** · scan de pixels `#4c4a4b` à 1440×900 et 390×844 · console sans avertissement « preloaded but not used » |
| **C4** | `[...document.fonts].map(f=>f.family)` dédupliqué · audit `getComputedStyle` de tous les nœuds feuilles avec texte, sortie triée par `font-size` · scan `U+2150-218F` du DOM · CLS mesuré au chargement à froid |
| **C5** | Table L\* de tous les fonds de section, calculée, jointe · matrice des paires adjacentes avec ΔL\* · matrice de contraste de toutes les paires texte/fond, **plancher 5,0:1** · hauteurs `.aj-story` vs footer |
| **C6** | Captures **390×844** de la traversée complète · `document.querySelectorAll('.pin-spacer').length` · relevé CLS à l'apparition **et** à la disparition de la barre d'URL · grep prouvant `0 font-size: 8px` dans le bloc mobile |
| **C7** | Audit **feuille de style désactivée**, état inline relevé par élément animé — **jamais** `getAnimations().length` · inventaire des durées et eases, ≤5 et ≤3 · replay complet après cycle 1440→900→1440 |
| **C8** | `getComputedStyle(document.documentElement).scrollBehavior` · table `start`/`end` de tous les triggers, avant/après `refresh()` |
| **C9** | **Enregistrement NVDA + Chrome, 60 s sans interaction**, transcription jointe · rapport `axe-core` aux **7 breakpoints, 1280×640 inclus** · parcours Tab complet avec `getBoundingClientRect().top` de chaque arrêt · matrice de contraste de l'anneau contre les deux fonds adjacents |
| **C10** | Capture **1280×640** pendant l'intégralité du pin · script `naturalWidth > clientWidth × dPR × 1,15` · **fichier d'arbitrage `srcset` daté, décideur nommé** |
| **C11** | Test de substitution écrit, appliqué à CDLP / Le Slip Français / Hanro, résultat par candidate · grep « Jérémy » et « Alex » dans le texte visible rendu · scan des chaînes ≥15 caractères en doublon |
| **C12** | Les trois runs rouges du harnais · fichier de ligne de base daté · `git branch --show-current` · les **quatre arbitrages écrits et datés** |
| **C13** | Captures **1440×900 et 390×844** aux timecodes retenus, plus un grossissement par tête · relevé `overlayPngUtilise` prouvant qu'aucun PNG d'overlay n'intervient · mesure comparée **preview vs production** · note de recommandation **recadrer / re-rendre** chiffrée, décideur nommé · `git diff --stat` sur `public/videos/` = **vide** |

### 8.4 — Forme du rendu final

Pour chaque chantier, dans cet ordre, sans exception :
**(a)** le diff · **(b)** la commande exacte qui prouve le critère · **(c)** sa sortie brute · **(d)** la capture avant/après quand le critère est visuel · **(e)** le statut : `ATTEINT` / `PARTIEL, delta = X points` / `BLOQUÉ, blocage = …, décideur = …`.

**Un critère non prouvé compte comme non atteint.** Un critère prouvé sur la production compte comme non atteint. Un critère dont le chiffre de départ est faux est rejeté et te coûte le chantier entier.

---

**En une ligne pour lundi :** C12 le matin — le harnais, la branche, la ligne de base. C1 l'après-midi — la plaque. C'est le seul chantier qui répond littéralement à la demande d'Adam, il est constructible avec les actifs existants, il ne requiert aucun consentement, et il vaut à lui seul plus de points que les six audits e-commerce réunis.

---

## 9. EN UNE LIGNE POUR LUNDI

**Matin — C12 :** le harnais, la ligne de base sur la preview. La branche est déjà prête, vérifie-la
et n'en crée pas d'autre.

**Après-midi — C1 :** la plaque. C'est le seul chantier qui répond **littéralement** à la demande
d'Adam, il est constructible avec les actifs déjà présents sur le disque, il ne requiert **aucun
consentement**, et il vaut à lui seul plus de points que les six audits e-commerce réunis.

**En parallèle, dès le premier jour — C13 :** regarde le hero, documente la découpe, ne corrige rien.
L'arbitrage d'Adam a besoin de temps, et ce chantier est de l'observation pure.

---

## 10. LES QUATRE FAÇONS DE RATER CETTE MISSION

Elles sont toutes déjà arrivées lors du tour précédent. Relis-les avant chaque rendu.

1. **Citer une mesure de production comme description de la branche.** Six rendus sur douze l'ont
   fait. La production et la preview sont **deux builds différents** : la production n'a même pas de
   GSAP. Toute mesure doit être prise sur la preview, et datée.
2. **Bâtir une prescription phare sur une prémisse non vérifiée.** Chacun des six experts l'a fait,
   trois sur la **même** hypothèse falsifiée. Ouvre le fichier, lis la ligne, mesure la valeur —
   avant d'écrire la recommandation, pas après.
3. **Écrire un critère d'acceptation inopérant.** Chacun des six testeurs en a attrapé au moins un.
   La §6.2 en liste huit connus : les reproduire est un échec automatique.
4. **Ne pas regarder le rendu.** C'est ainsi que treize agents ont manqué un défaut plein écran que
   le client a vu en trois secondes. **Une mesure verte n'est pas une preuve visuelle.**

---

*Document préparé le 2026-08-17. Terrain vérifié, branche active, actifs sur disque, hook de
sauvegarde armé. Il ne te manque rien pour commencer.*

---

# ADDENDUM 2 — LA CAUSE RACINE DU P0, TROUVÉE LE 2026-08-17

**Ceci remplace toutes les hypothèses de la §3.1 sur le pin. La §3.1 disait « deux suspects, non
prouvés ». Le vrai coupable n'était dans aucune des deux listes.**

## Le conteneur de défilement n'est pas la fenêtre

`app/globals.css`, règle `.home-shell` :

```css
.home-shell {
  position: relative;
  height: 100svh;          /* ← la coquille fait exactement un écran */
  overflow-x: hidden;
  overflow-y: auto;        /* ← ET c'est ELLE qui défile */
  scroll-behavior: smooth;
  scroll-snap-type: y mandatory;
}
```

**C'est `.home-shell` qui défile, pas le document.** ScrollTrigger observe `window` par défaut.
Il ne voit donc **jamais** le scroll de l'utilisateur : aucun `scrub` ne progresse, aucune timeline
épinglée n'avance, et `--aj-split` reste figé à sa valeur initiale — exactement le symptôme mesuré.

Cela explique d'un coup :
- pourquoi la timeline épinglée ne produisait rien alors que GSAP, ScrollTrigger, les sélecteurs et
  la media query étaient tous corrects ;
- pourquoi `window.scrollY` restait bloqué à **1590** sur des appels successifs — la fenêtre ne
  défile pas, c'est la coquille qui défile ;
- pourquoi deux campagnes DevTools se « contredisaient » : elles mesuraient toutes deux la mauvaise
  cible.

## Trois aggravants sur le même élément

1. **`scroll-snap-type: y mandatory`** sur le conteneur de défilement. Un snap obligatoire se bat
   frontalement avec une scène épinglée et scrubbée : le navigateur ramène la position de scroll
   pendant que la timeline essaie de la lire.
2. **`scroll-behavior: smooth`** — déjà documenté par GSAP comme incompatible avec ScrollTrigger.
3. **`.aj-home { overflow: hidden }`** — crée un second conteneur de défilement au-dessus de
   l'élément épinglé. `overflow-x: clip` coupe le débordement horizontal sans créer ce conteneur.

## Ce que tu dois trancher, et c'est un arbitrage d'architecture

Deux chemins, **exclusifs** :

**A — Le document redevient le scroller.** Retirer `height: 100svh`, `overflow-y: auto` et
`scroll-snap-type` de `.home-shell`. C'est l'architecture de tous les sites ScrollTrigger, et c'est
ce que suppose le reste du plan (C2, C6, C8, C10). Coût : le site perd son modèle « deck à snap
vertical », qu'il faut réécrire là où il servait.

**B — ScrollTrigger apprend le vrai scroller.** `ScrollTrigger.defaults({ scroller: '.home-shell' })`,
ou `scroller` par trigger. Moins invasif, mais tu conserves un snap obligatoire qui restera en
conflit avec chaque scène scrubbée, et `ScrollSmoother` restera inutilisable.

**Recommandation : A.** Écris l'arbitrage, daté, décideur nommé — il rejoint les quatre arbitrages
exigés en C12.

## État de la branche à la remise

`claude/front-awwwards-20260817` porte une **première passe de diagnostic**, écrite par Claude Code
avant qu'Adam ne recadre le partage des rôles. **Tu n'es pas tenu de la conserver** : traite-la comme
une preuve que le terrain répond, pas comme une base de départ imposée.

Ce qu'elle contient : réécriture de `ApollonGuidedSequence.tsx` en une timeline épinglée unique
(plaque unique, volet par deux transforms contra-rotatifs, `@property --aj-wipe`, `--aj-ground`
per-frame, plus d'auto-avance, plus de `?apollon=`), retrait du pin concurrent dans
`HomeGsapExperience.tsx`, `overflow-x: clip` sur `.aj-home`, retrait des deux
`scroll-behavior: smooth`, et suppression des surcharges mobiles mortes.

**Résultat mesuré après déploiement : `.pin-spacer` passe de 0 à 1.** Le pin s'instancie enfin.
Le scrub, lui, reste bloqué tant que le conflit de scroller ci-dessus n'est pas tranché.

`git log claude/front-awwwards-20260817` donne le détail. `git revert` si tu préfères repartir nu.

---

# ADDENDUM 3 — CORRECTION DE L'ADDENDUM 2. IL ÉTAIT FAUX.

**L'ADDENDUM 2 affirmait que `.home-shell` était le conteneur de défilement et que c'était la cause
racine du P0. C'est faux. Ne l'applique pas.** Il est conservé au-dessus comme trace, barré par
celui-ci.

## Ce qui a été vérifié, en source et sur la preview déployée

| Contrôle | Résultat |
|---|---|
| `home-shell` dans un `.tsx` / `.ts` / `.js` | **0 occurrence.** La classe n'existe que dans `globals.css` et dans ces documents. |
| `page.tsx:19` | monte `<main className="aj-home">` puis les sections directement — aucun conteneur défilant intermédiaire |
| `document.querySelectorAll('.home-shell').length` sur la preview | **0** |
| `document.scrollingElement === document.documentElement` | **true** — le document EST le scroller |
| `getComputedStyle(html).scrollBehavior` | `auto` |
| `.aj-home` overflow-x | `clip` |
| `.pin-spacer` | **1** — le pin s'instancie |

**Le réglage par défaut de ScrollTrigger, qui observe `window`, est donc le bon.** Le chemin A de
l'addendum 2 est un no-op sur du code mort ; le chemin B pointerait un `scroller` sur un sélecteur
vide et serait une régression. Les quatre `scroll-snap-type: y mandatory` sont portés par ces mêmes
règles mortes.

Crédit : c'est Claude Design qui a démonté cette fausse piste en lisant la source plutôt qu'en
faisant confiance au document. C'est exactement le comportement que la §6.1 exige.

## Le vrai symptôme, mesuré sur la preview déployée

Scroll réel de 1 590 à 3 590 px, `scroll-behavior: auto`, 8 relevés :

- **`--aj-plate-scale` évolue** — la timeline progresse donc bien ;
- **`--aj-wipe` reste figé à `100%`** sur toute la traversée ;
- le coloris actif ne change pas.

**Conclusion : ce n'est pas un problème d'architecture de scroll, c'est un problème
d'interpolation de propriété personnalisée.** `--aj-wipe` est déclarée
`@property { syntax: "<percentage>" }` et animée par GSAP. La piste à instrumenter en premier est
la façon dont GSAP écrit cette variable — valeur avec unité, `CSSPlugin`, ou le fait que la valeur
posée soit invalide et que le moteur retombe sur l'`initial-value` de `@property`.

Un contournement connu, à évaluer et non à appliquer aveuglément : animer un objet proxy et écrire
la variable dans un `onUpdate` via `style.setProperty()`, ce qui contourne toute question de
parsing GSAP.

## La leçon, et elle vaut pour toi comme pour moi

L'ADDENDUM 2 a été écrit à partir d'une lecture de `globals.css` sans vérifier qu'un composant
rendait la classe. **Une règle CSS n'est pas une preuve qu'un élément existe.** La §6.1 point 1 le
disait déjà : « toute prémisse doit être mesurée ou lue dans la source, avec ligne et fichier ».
Je ne l'ai pas appliquée à moi-même.
