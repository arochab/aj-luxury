# JURY FINAL — AJ Luxury, gauntlet loop du 2026-08-17

Vérifications propres effectuées avant jugement (lecture seule, aucune modification) : fichier de preuves intégral, `HomeGsapExperience.tsx`, `ApollonGuidedSequence.tsx`, `page.tsx`, `globals.css` (5757 lignes), `git ls-tree` des actifs, et **ouverture visuelle** de `apollon-rose-lyre-v1.webp`, `apollon-rose-model-world-v1.webp`, `apollon-rose-model-color-v1.webp`, `apollon-lilas-model-world-v1.webp`.

---

## 1. NOTE DU FRONT ACTUEL

| Discipline | Note | Justification en une phrase opposable |
|---|---:|---|
| Motion GSAP | **2,5** | 46 Ko de bibliothèque pour un `opacity .72 → 1` sur 12 px ; le seul chapitre « cinématique » offre 765 px de scroll pour déplacer un séparateur de 7 points ; zéro motion sous 981 px ; et un `gsap.fromTo` sans ScrollTrigger efface la signature de marque déjà peinte, à t≈507 ms. |
| Direction artistique | **3,5** | Une grotesque d'interface étirée de 8 px à 245 px (30,6:1, sans axe `opsz`), 90 déclarations `font-size` sous 12 px sur 190, le seul `<h1>` en `clip: rect(0,0,0,0)`, la phrase de marque en 10 px à remplissage transparent, et un LCP qui est un portrait 480×623 étiré ×3,2 en `contain` sur `#4c4a4b`. |
| UX / scrollytelling | **3,0** | Une seule position `sticky` dans 5,96 écrans, et c'est une barre de 1 px ; le chapitre signature avance sur une horloge de 5 600 ms, pas sur le scroll ; `aria-live="polite"` sur trois `tabpanel` auto-avançants ; l'histoire de la marque fait 0,34 écran contre 1,38 de pied de page. |
| Marque | **4,0** | La note la plus haute parce que la marque possède une idée réellement incopiable, **déjà photographiée** — et la plus basse possible au-dessus de 4 parce que la parité Jérémy/Alex est rompue dans la section signature (vérifié : rose et lilas sont deux hommes différents), les fondateurs ne sont nommés que dans des `alt`, et trois logiques de nommage cohabitent sur trois références. |
| Conversion e-commerce | **3,0** | Aucun prix sur `/shop`, la seule page appelée Boutique ; le guide des tailles ouvre une modale à piège de focus pour afficher quatre fois « Mesure à confirmer » ; CTA d'achat rendu à 10,4 px. Architecture commerce sous-jacente sérieuse — mais commerce fermé par contrainte, donc largement hors périmètre (§6). |
| Technique / perf / a11y | **3,0** | `srcset` absent sur 17/17 images parce que `images.unoptimized: true` ; `--aj-split` non typé pilotant `left`/`right`, donc layout à chaque frame ; deux échecs de contraste confirmés (3,50:1 et un remplissage de barre à 1,05:1 sur sa propre piste). |

**GLOBAL : 3,2 / 10.** Calcul à la pondération du jury Awwwards, Design 40 % / Usability 30 % / Creativity 20 % / Content 10 % :
`(3,5 × 0,40) + (3,0 × 0,30) + (2,5 × 0,20) + (4,0 × 0,10) = 1,40 + 0,90 + 0,50 + 0,40 = 3,20`

**Trois constats de jury que personne n'a formulés :**

**a.** Les douze rendus dépensent environ 70 % de leur effort sur Usability et Content, soit 40 % de la pondération. Exécuter l'intégralité des six audits amène ce site autour de 5,5. **La majorité du budget doit aller au Design (40 %) et à la Creativity (20 %).** Mon plan est pondéré ainsi.

**b.** Le bug du pin n'est pas le P0. Que la timeline s'instancie ou non, 765 px de pin pour un séparateur qui glisse de 7 points ne vaut rien. **Le P0 est qu'il n'existe aucune scène qui mérite d'être épinglée.** Réécrire la scène rend la question caduque.

**c.** La demande d'Adam est **intégralement réalisable aujourd'hui, avec zéro nouvel actif, donc zéro gate Isabelle sur la v1.** J'ai ouvert les fichiers : `apollon-rose-lyre-v1.webp` est le boxer seul en lévitation au-dessus d'un socle de marbre, lyre dorée à gauche, laurier à droite, arc et carquois en bas, mur de plâtre rose, sol de marbre réfléchissant — et `apollon-rose-model-world-v1.webp` est **le même plateau**, mêmes props, même mur. La bande jacquard « AJ LUXURY » de 3,5 cm et la plaque métal y sont grandes et nettes. Le CSS fabrique deux fonds artificiels pour séparer deux prises d'une même pièce.

---

## 2 et 3. PLAN D'ÉVOLUTION VERS 9,7 — 12 CHANTIERS, IMPACT DÉCROISSANT

Seuil d'acceptation 9,7. Tout ce qui n'y contribue pas est coupé (§6). Gains exprimés en points de la note globale pondérée. Somme = 6,50. `3,20 + 6,50 = 9,70`.

---

### C1 — LA PLAQUE : le diptyque Apollon en une seule prise
**Discipline :** Direction artistique + Creativity · **Gain : +1,10**

Un seul sol, une seule lumière, une seule échelle. Les deux images sont deux prises d'un même plateau ; la tâche est de le laisser voir.

**Technique exacte :**
- Supprimer `background: #d5cec9` sur `.aj-sequence__symbol` (5296) et `radial-gradient(...), #15151a` sur `.aj-sequence__body` (5303). Fond unique porté par `.aj-sequence__stage`, via `--aj-ground` **injecté par frame** à côté de `--aj-accent` : les trois plateaux ont trois murs différents — plâtre rose, ardoise bleu-gris, bordeaux. Un token global casserait deux coloris sur trois.
- Supprimer `.aj-sequence__stage::before` (5259) : un filet de 1 px tourné à `rotate(3deg)` sur un stage de 702 px rate le raccord vertical réel de ±18,4 px à chaque extrémité.
- Supprimer **l'asymétrie** de `.aj-sequence__frame::after` (5327), pas l'étalonnage : le `linear-gradient(90deg, rgba(7,7,9,0.6) …)` ne charge que le packshot. Les deux prises partagent le décor **mais pas l'exposition** — vérifié à l'œil : packshot high-key et diffus, mannequin low-key, éclairé de côté, fortement vignetté, mur nettement plus sombre. Un `--aj-grade` unique appliqué identiquement aux deux panneaux remplace le voile directionnel.
- **Une seule échelle, jamais deux `cover` indépendants.** Les deux sources partagent le ratio 0,6667 (1024/1536 et 1731/2600). Deux `cover` à 30,5 % / 69,5 % font apparaître la lyre partagée ~2,2× plus grande à droite — cela détruit exactement la continuité qu'on construit. Facteur d'échelle identique exprimé en `--aj-plate-scale`, le panneau gauche devenant une fenêtre sur la même plaque, alignement par `object-position` seul.
- **Aucun reshoot.** La ligne d'horizon (raccord mur/sol de marbre) est à ~70 % de la hauteur dans le packshot et ~74,5 % dans le plan mannequin : 4 points d'écart, corrigeables par `object-position`. La mesure « 78 % contre 95 % » de l'audit marque portait sur la base du socle, pas sur le sol.
- **Le volet, pas le fondu.** `@property --aj-wipe { syntax: '<percentage>'; inherits: false; initial-value: 100% }` — zéro `@property` dans les 5757 lignes actuelles, donc `--aj-split` n'est ni interpolable ni compositable par le moteur. Ne pas animer `left`/`right` (5264, 5294, 5300 : relayout de deux panneaux absolus portant des images 1731×2600) **et ne pas compter sur `clip-path` comme propriété compositable** : Chromium ne composite que `transform`, `opacity`, `filter` et `backdrop-filter`. Technique correcte : deux transforms contra-rotatifs — parent `overflow: hidden` translaté, enfant translaté de l'opposé — coût compositeur pur.
- Sortir `.aj-sequence__copy` du panneau packshot : `left: clamp(24px,3vw,46px)`, `width: min(29%,390px)` la place de x≈43 à x≈433 pour un split à 518 px, donc intégralement sur le vêtement.
- **Le socle de marbre central n'existe que dans le packshot.** Une plaque continue le fera apparaître puis disparaître au raccord : à traiter comme un problème de composition, pas comme un bug.

**Critère d'acceptation mesurable :** horizon du marbre à ≤4 px entre les deux panneaux à 1440 ; hauteur apparente de la lyre partagée à ≤8 % d'écart entre panneaux ; les deux panneaux renvoient le même `background-color` calculé et `background-image: none` ; ΔE2000 < 3 à 5 px de part et d'autre du raccord, à 25/50/75 % de la hauteur ; 0 px de fond vide dans la colonne mannequin (aujourd'hui ~411 px = 51 % de la colonne) ; luminance moyenne des deux panneaux à ≤6 % d'écart ; pendant le volet, **0 `Layout` ET 0 `Paint`** attribués aux deux panneaux ; ≤2 frames > 16,7 ms sur 120 ; **un fondateur nommé par acte** (voir C2).

---

### C2 — ÉCRIRE LA SÉQUENCE AVANT DE LA CÂBLER : trois actes, une seule horloge
**Discipline :** Creativity + UX · **Gain : +1,00**

**Technique exacte :**
- Supprimer `FRAME_DURATION = 5600`, `autoplayRef`, le tween de progression avec `onComplete: setActive((c+1)%3)` et le `useEffect [paused, inView, pageVisible, reducedMotion, active]`. **Une séquence guidée n'a qu'une horloge, et sur une page épinglée cette horloge est le scroll.**
- Une timeline, un pin : `scrollTrigger: { trigger: wrapper, start:'top top', end:'+=220%', pin: wrapper, pinSpacing:true, scrub:1, anticipatePin:1, invalidateOnRefresh:true, fastScrollEnd:2500 }` avec `addLabel('rose'|'lilas'|'pourpre')`. **`+=220%`, ni `+=85%` ni `+=300%`** : 1980 px pour trois actes = 660 px par acte, chaque acte portant un changement de valeur réel. Épingler le **wrapper**, jamais le nœud animé — aujourd'hui `sequenceStage` est à la fois `trigger`, cible de `pin` et cible des tweens `clipPath`/`y`.
- **Pas de `snap: {snapTo:'labelsDirectional'}`** : le snap déplace la position de scroll de l'utilisateur après qu'il a cessé de scroller. C'est l'override de contrôle que le même audit interdit trois prescriptions plus loin. Les onglets restent l'override manuel : `gsap.to(window,{ scrollTo: tl.scrollTrigger.labelToScroll('lilas') })`.
- Acte 1 : la plaque se révèle, le vêtement seul. Acte 2 : le volet, le vêtement seul devient le vêtement porté — **la bascule émotionnelle, et la demande d'Adam**. Acte 3 : le coloris change sur un décor tenu.
- **Le changement de coloris n'est pas un crossfade de frames entières** (aujourd'hui `visibility`/`opacity` sur tout l'`<article>`) : tenir la lyre, l'arc et le marbre fixes, ne dissoudre que le vêtement et la teinte du mur. Une seule pièce, trois registres.
- **Instrumenter avant de construire.** `tests/motion.e2e.mjs` (Playwright) est le **premier** livrable, pas le dixième : `page.mouse.wheel` exclusivement, jamais `window.scrollTo`. Log horodaté à l'entrée du callback `media.add("(min-width:981px)…")` : valeur du garde, `gsap.matchMedia().contexts.length`, `ScrollTrigger.getAll()`.

**Critère d'acceptation mesurable :** exactement 1 trigger `pin:true` ; 3 labels atteignables au clic et au clavier ; 10 s d'immobilité → `active` inchangé, 0 mutation observée sur `.is-active` ; `--aj-wipe` varie d'au moins 60 points entre deux positions atteintes à la molette ; `PerformanceObserver('longtask')` = 0 sur la traversée complète ; **un fondateur explicitement assigné à chaque acte**, ratio solo Jérémy / solo Alex = 1,00 sur la section.

---

### C3 — LE PREMIER ÉCRAN
**Discipline :** Direction artistique · **Gain : +0,90**

Aucun site n'a été Site of the Day sur son deuxième écran. Aucun des six audits n'en a fait sa priorité.

**Technique exacte :**
- Le `<h1>` sort de `.aj-film__portrait--sr` (`position:absolute; width:1px; height:1px; clip:rect(0,0,0,0)`, ligne 3273) et devient la composition : famille display, ~106-132 px à 1440, trois lignes, révélées par `SplitText.create(el, { type:'lines', mask:'lines', autoSplit:true })` — libre depuis GSAP 3.13, et la seule API qui survive au font-swap et au resize sans re-split cassé. Zéro occurrence de `SplitText` sur toute la branche aujourd'hui.
- Supprimer `.aj-film__signature p { background-clip:text; -webkit-text-fill-color: transparent }` (3406-3431) : remplissage transparent avec `drop-shadow` sur vidéo, à 10 px, tracking +0,2em.
- **Réparer le clignotement du hero — absent des douze rendus.** `gsap.fromTo(".aj-film__signature > *", {autoAlpha:0, y:18}, {…, delay:0.55})` a `immediateRender: true` par défaut et n'est attaché à **aucun** ScrollTrigger. La signature est rendue par le SSR, donc visible au premier paint ; à la résolution du chunk — mesurée à 507 ms — le from-state l'efface, puis elle revient 550 ms plus tard. La promesse de la marque clignote dans la première seconde. Correctif : état `[data-gsap="pending"]` posé côté serveur, ou `immediateRender: false`.
- `object-fit: contain` → `cover` sur `.aj-film__hero-poster img` et `.aj-film__hero-video` ; supprimer les trois occurrences de `background: #4c4a4b` (3133, 3151, 3156).
- **Le vrai mécanisme de l'upscale ×3,2 est la formule `sizes`, pas l'ordre des `<source>`.** `PORTRAIT_POSTER_SIZES = "min(100vw, calc(70svh * 720 / 934))"` : à 900 px de hauteur, `70svh = 630`, `×720/934 = 486 px`. Le navigateur choisit donc le candidat 480w pour une boîte réellement peinte à 1539 px. Refaire l'échelle de sources sans corriger `sizes` reproduira exactement le même upscale. C'est la découverte la plus précise des douze rendus.

**Critère d'acceptation mesurable :** ≥1 nœud de texte visible ≥90 px dans le premier écran ; élément LCP = l'image du poster, `currentSrc` contenant `desktop-1920x1080`, jamais `portrait-480x623` ; 0 px de `#4c4a4b` à 1440×900 et à 390×844 ; **aucun élément visible au premier paint ne passe à `opacity:0` dans les 2 s suivantes** (trace enregistrée) ; 0 ressource préchargée non consommée en console.

---

### C4 — LE SYSTÈME TYPOGRAPHIQUE
**Discipline :** Direction artistique · **Gain : +0,85**

Réponse littérale et mesurable à « les infos trop petites et paas beau ». Le reproche est inscrit **90 fois** dans la feuille : 23 × 8 px, 30 × 9 px, 16 × 10 px, 21 × 11 px sur 190 déclarations `font-size` (comptage refait, exact).

**Technique exacte :**
- Deux familles. Aujourd'hui une seule, « AJ Manrope », weight 200-800, de 8 px à 245 px, sans axe `opsz`. Une grotesque d'interface dessinée pour 14-18 px ne tient pas 245 px à graisse 260 avec un `%` de tableur.
- Display : variable à axe optique réel. **Bodoni Moda VF** (OFL, `opsz` 6-96 + `wght` 400-900) est la réponse libre et juste, et son registre historique — Didone, Paris, 1798, néoclassicisme — est exactement le registre marbre/lyre/laurier que la marque possède déjà. Montées payantes : Caponi Display (Production Type) ou Signifier (Klim). `font-optical-sizing: auto` **plus** un `font-variation-settings: "opsz" <px>` explicite par palier.
- **Pas `font-display: optional`** : aucune phase de swap, donc au premier chargement — celui du jury — le h1 de 132 px s'affiche dans la police de repli. `swap` avec `size-adjust` et `ascent-override` calibrés sur Manrope, CLS < 0,02.
- Échelle modulaire de 8 paliers, base fluide 17→19 px, ratio 1,333, **plafond dur ~142 px**. `.aj-proof__material dt` passe de `clamp(126px, 17vw, 292px)` (245 px rendus) au plafond : aujourd'hui le plus gros caractère du site est un pourcentage de fibre, à 4:1 au-dessus du nom du produit.
- Plancher 15 px bas de casse, 16 px capitales, verrouillé par `stylelint declaration-property-value-disallowed-list`.
- Table de tracking par palier : ≥96 px −0,03em / 64-96 −0,025 / 40-64 −0,02 / 28-40 −0,015 / 20-28 −0,01 / 15-20 zéro / labels capitales +0,08 maximum. Aujourd'hui −0,075em à 68 px et −0,11em à 245 px.
- Couche glyphes : `↗` U+2197, `→` U+2192, `▶` U+25B6 et `Ⅱ` U+2161 sont hors du `unicode-range` déclaré (qui ne couvre que U+2191/U+2193 parmi les flèches) et tombent en repli Arial au milieu d'un lettrage Manrope. SVG inline `aria-hidden`, 12×12, `currentColor`. **`Ⅱ` est le chiffre romain deux employé comme icône pause** — le détail qu'un juré met en capture d'écran.
- **Ne pas retenir le critère « aucun rect de glyphe ne se chevauche »** : `Range.getClientRects()` renvoie des boîtes d'avance ; des caractères adjacents produisent toujours des rects contigus, écart exactement 0. Le critère échoue sur une composition parfaite.

**Critère d'acceptation mesurable :** `document.fonts` = exactement 2 familles ; 0 déclaration de la famille texte au-dessus de 20 px et 0 de la famille display en dessous de 24 px ; 0 nœud de texte visible sous 15 px à 1440×900 ; rapport plus-grand/plus-petit corps ≤9,5:1 (aujourd'hui 30,6:1) ; 0 caractère U+2150-218F dans le DOM ; `↓ → ↗ ▶` résolvent la même `fontFamily` ; CLS < 0,02.

---

### C5 — LA PARTITION CHROMATIQUE ET LE RYTHME
**Discipline :** Direction artistique · **Gain : +0,75**

**Technique exacte :**
- Palette échantillonnée **sur les plaques elles-mêmes**, jamais inventée. Les trois plateaux ont trois murs différents : `--aj-ground` est per-frame.
- Introduire le ton moyen manquant : aucun fond de **section** n'existe entre L*5 et L*93. (La formulation absolue de l'audit DA était fausse — `.aj-sequence__symbol` #d5cec9 = L*82 et `.aj-sequence__stage` #1a191d = L*8,5 existent bel et bien. L'observation qui survit est plus étroite et suffisante.) Quatre noirs dans une plage de 2,8 L* et trois blancs cassés dans 1,6 L* font s'effondrer six sections en quatre blocs perçus.
- **Le ton moyen ne va ni sur la boutique ni sur le moodboard** : ce sont les deux seules surfaces où l'on lit le produit. Un boxer rose pâle sur un mur `#b8878f` et un lilas sur du bronze éteignent le vêtement. Le ton moyen appartient à la preuve/manifeste et au récit.
- Supprimer `.aj-section-break` (3088-3092) : une lamelle de 28 px `#f3f2ef` bordée à 10 % d'alpha, insérée entre le hero (#070709, L*1,96) et `aj-proof` (#efede9, L*93,9), c'est-à-dire au milieu de la seule coupe franche de la page.
- Rythme : `.aj-story` de `clamp(310px, 34svh, 360px)` (0,34 écran) à ≥0,85 écran, paragraphe de `clamp(18px, 2.2vw, 34px)` (31,7 px) à ≥60 px ; footer de 1,38 écran cumulé à ≤0,50. Une marque qui donne quatre fois plus de hauteur à ses mentions légales qu'à son récit n'a pas de point de vue.
- Règle opposable : deux fonds adjacents jamais séparés de moins de 12 L*.
- **Marge de contraste, jamais le seuil nu.** L'encre `#2a2a2e` sur `#b8878f` donne 4,72:1 et sur `#b08d5e` 4,67:1 : AA franchi de 0,2 point, zéro marge. Plancher opposable à 5,0:1.

**Critère d'acceptation mesurable :** ≤5 fonds de section distincts ; ≥2 sections dans L*40-70 ; aucune paire adjacente à moins de 12 L* ; aucune suite de sections adjacentes totalisant >1,6 écran dans une plage de 12 L* (aujourd'hui shop+moodboard = 1848 px = 2,05 écrans à 0,3 L*) ; `.aj-story` strictement plus haute que le footer ; `.aj-section-break` absent du DOM ; toute paire texte/fond ≥5,0:1.

---

### C6 — LA SÉQUENCE SUR MOBILE
**Discipline :** Design + Usability + Creativity · **Gain : +0,60**

Le seul endroit où le site passe de « motion faible » à « motion inexistant ». Une marque de sous-vêtement recrute par Instagram et TikTok ; le jury note le mobile comme une dimension propre.

**Technique exacte :**
- Le seul bloc contenant `pin: true` est gaté sur `(min-width: 981px)`. Sous ce seuil : 0 `.pin-spacer`, et le bloc mobile fait en plus `display: none` sur les trois **noms de coloris** (`.aj-sequence__choices button > strong`), sur le paragraphe d'introduction et sur la barre de progression, et code en dur `font-size: 8px` sur la copie. Ce n'est pas une adaptation, c'est une amputation de la proposition produit.
- Deux branches `matchMedia`, pas un gate desktop : desktop split horizontal ; mobile pin vertical, `end:'+=180%'`, volet vertical, plus `ScrollTrigger.normalizeScroll(true)` et `ScrollTrigger.config({ ignoreMobileResize: true })` pour la barre d'URL, unités `svh`/`dvh`.
- **Laisser `pinType` à sa valeur par défaut `fixed`.** `transform` n'est justifié qu'avec un smooth-scroll virtualisé, absent ici — et un ancêtre transformé devient le bloc conteneur de tout descendant `position: fixed`, ce qui piégerait toute barre ou overlay persistant dans la scène épinglée.
- **Pour le compte rendu :** le constat « moodboard écrasé en 129/104/129 px dans un conteneur `overflow:hidden` sans scroll » est **faux**. Le bloc `@media (max-width:760px)` pose `overflow-x: auto`, `scroll-snap-type: x mandatory`, `display:flex`, `width: max-content` et `flex: 0 0 78vw` par vignette. Les valeurs `grid-template-columns: 0.82fr 0.66fr 0.82fr` citées comme preuve n'existent nulle part dans le fichier. Ne pas dépenser une journée à réparer un défaut qui n'existe pas.

**Critère d'acceptation mesurable :** à 390×844, `document.querySelectorAll('.pin-spacer').length === 1` ; les trois noms de coloris sont rendus (0 `display:none` sur `> strong`) ; 0 `font-size: 8px` codé en dur dans le bloc mobile ; CLS < 0,01 à l'apparition et à la disparition de la barre d'URL.

---

### C7 — UNE SEULE AUTORITÉ D'ANIMATION, ET UN LANGAGE DE MOUVEMENT TOKENISÉ
**Discipline :** Creativity · **Gain : +0,45**

**Technique exacte :**
- **Deux vraies collisions de cascade, pas quatre** (vérifié ligne à ligne) : `.aj-product-card` (CSS 4257 contre `gsap.from(".aj-product-card")`) et `.aj-moodboard__item` (4258 contre `gsap.from(".aj-moodboard__item")`). Sur celles-là, l'origine « animation » bat le style inline non-`!important` : GSAP écrit des styles que le moteur ignore.
- Pour `.aj-shop__heading` et `.aj-story__copy`, ce n'est **pas** une collision : le CSS anime le **parent** de 0,72 à 1, GSAP anime les **enfants** (`> *`, `> div`) en `autoAlpha` 0→1. Les opacités se multiplient : l'entrée réelle démarre à 0, et l'enfant hérite d'un `translateY` parent de 12 px non prévu. Défaut différent, correctif différent.
- Doctrine cible : CSS scroll-driven (`animation-timeline: view()`) pour les entrées atomiques non orchestrées ; GSAP exclusivement pour ce qui est épinglé, scrubbé, séquencé ou dépendant d'un autre chapitre.
- Noter que `.aj-featured` figure dans ce bloc `@supports` et **n'existe pas sur cette branche** : c'est la structure de production. Une seule feuille de style sert deux sites différents.
- **Tokens de mouvement.** Aujourd'hui : `power3.out`, `power4.out`, `power2.out`, `power2.inOut`, `none`, et des durées à 0,22 / 0,24 / 0,28 / 0,30 / 0,32 / 0,36 / 0,38 / 0,42 / 0,50 / 0,58 / 0,75 / 0,90 / 0,95 / 1,05 / 1,10 / 1,35 / 1,40 — dix-sept durées et cinq eases tirés au jugé. Le jury note la cohérence d'un langage, pas la difficulté d'un effet isolé. Cinq durées, trois eases dont un `CustomEase` de signature, une unité de stagger — **et on ne repeint rien avant que la grille soit posée.**
- Remplacer les cinq `once: true` par `ScrollTrigger.batch(..., { overwrite: true })` : `once` fige un état non réversible au resize, et un jury redimensionne systématiquement.
- **Rejeter `ScrollTrigger.config({ autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load' })`** : cela retire `resize` de la liste par défaut et contredit frontalement le critère de réversibilité au resize du même audit. `ignoreMobileResize: true` seul couvre le cas de la barre d'URL.
- **Rejeter le critère `getAll().length ≤ 6`** : le nombre de triggers n'est ni une métrique de qualité ni une métrique de performance ; il pousse à fusionner des chapitres indépendants pour satisfaire un chiffre arbitraire.

**Critère d'acceptation mesurable :** pour chaque élément animé, une seule autorité écrit `opacity`/`transform` — **audité en désactivant la feuille de style et en constatant l'état inline**, jamais par `el.getAnimations().length` qui renvoie aussi les `CSSTransition` (le bloc 4276-4284 en pose une sur `.aj-product-card` précisément) ; ≤5 durées distinctes et ≤3 eases dans tout le code ; après un cycle 1440→900→1440, tous les états d'entrée sont rejoués.

---

### C8 — LE SCROLL REDEVIENT PILOTABLE, ET LES CHAPITRES S'ORDONNENT
**Discipline :** Usability + Creativity · **Gain : +0,30**

**Technique exacte :**
- Retirer `scroll-behavior: smooth` de `html` (ligne 38) et de `.home-shell` (1591). GSAP le documente comme incompatible avec ScrollTrigger : il casse ScrollToPlugin, le snap, l'ancrage de refresh, et interdit ScrollSmoother. C'est aussi ce qui a produit une campagne de mesure entièrement faussée (11 appels `window.scrollTo` successifs laissant `scrollY` figé à 1590, d'où des valeurs « identiques au bit près »). **Toute mesure par `scrollTo` sur ce site est nulle tant que la ligne 38 existe.** Le bloc `prefers-reduced-motion` (1362-1375) pose déjà `scroll-behavior: auto !important` : la suppression ne casse aucun garde a11y.
- **Ne pas router les ancres via `gsap.to(window,{scrollTo})`** : cela casse la mise à jour du hash, le retour arrière et le contrôle utilisateur pour ~2 Ko de plugin. Les ancres natives avec `scroll-behavior: auto` sont la bonne réponse.
- Ordonner les chapitres : `refreshPriority: 1` sur le trigger épinglé, `-1` sur les triggers boutique, et exprimer les `start` en fonction de la fin réelle du pin (`start: () => sequenceST.end + 120`, `invalidateOnRefresh: true`), puis `ScrollTrigger.sort()`. Aujourd'hui `.aj-shop` démarre à 1816 et `.aj-shop__rail` à 1972 sous un pin dont l'`end` est à 2509 : à la libération, la révélation produit — le seul moment commercial de la page — est déjà scrubbée à 46,9 %, derrière la section épinglée.
- Fiabiliser après médias : `await Promise.all([...imgs].map(i => i.decode().catch(()=>{})))` puis `ScrollTrigger.refresh()`.

**Critère d'acceptation mesurable :** `getComputedStyle(document.documentElement).scrollBehavior === 'auto'` ; aucun trigger boutique n'a un `start` inférieur au `end` du trigger épinglé ; après `refresh()`, `st.start` et `st.end` varient de moins de 2 px.

---

### C9 — LE CONTRÔLE NON VISUEL ET LE CLAVIER
**Discipline :** Usability · **Gain : +0,25**

**Technique exacte :**
- Retirer `aria-live="polite"` de `.aj-sequence__visuals` : la région englobe trois `role="tabpanel"`. Un ensemble tablist/tabpanel n'est pas une région live (ARIA APG) ; couplé à l'auto-avance de 5 600 ms, cela interrompt NVDA toutes les 5,6 secondes sur la section principale. Une fois C2 livré, la région n'a plus d'objet : garder un unique `<p class="sr-only" aria-live="polite" aria-atomic="true">` alimenté sur activation manuelle seulement.
- Les deux échecs de contraste qui **survivent** à vérification : `.aj-sequence__choices button > span` — 8 px, `rgba(255,255,255,0.4)` sur `rgba(8,8,10,0.9)` = **3,50:1**, échec 1.4.3 ; et `.aj-sequence__progress` — `height: 1px`, piste `rgba(255,255,255,0.2)`, remplissage `var(--aj-accent)` : sur la frame 03, `#7d0f52` contre sa propre piste donne **~1,05:1**, le remplissage est littéralement invisible sur sa piste. Séparer le token d'indicateur du token de marque, barre à 3 px.
- **Le P0 « anneau de focus à 1,04:1 sur 1 px » est FAUX.** `globals.css:66-70` déclare une règle typée `button:focus-visible, a:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid #676dd8 }`, spécificité (0,1,1), qui bat la règle `:where(a, button, summary, select)` de la ligne 4302, spécificité (0,1,0). `#676dd8` donne 3,90:1 sur `#f3f2ef` et 4,48:1 sur `#0a0a0c` : conforme, 2 px. Ce qui survit : `select` n'est pas dans la règle typée, et `<section className="aj-moodboard" tabIndex={0}>` est un arrêt de tabulation sans `role` ni nom accessible. Et le vrai défaut est **chromatique** : `#676dd8` est un périwinkle hors palette Rose/Pourpre/Lilas.
- `.aj-sequence__copy` est posé sur une photographie dont la luminance change à chaque coloris : **la SC 1.4.3 y est indécidable par construction.** Aucun token, aussi bien calculé soit-il, ne garantit un ratio contre une image. Il faut un scrim déterministe ou un déplacement sur surface unie — arbitrage de design, à trancher dans C1.
- 5 liens `<a>` sans nom accessible ; le logo est un **lien**, il lui faut un nom de lien, pas un `alt` d'image. **Ne pas ajouter d'`alt` aux deux posters hero ni à l'overlay d'identité** : `HeroComposition.tsx` rend déjà `<figure className="aj-film__portrait--sr"><figcaption>AJ Luxury — Jérémy, Alex — Apollon Lilas Céleste</figcaption></figure>` ; les nommer produirait trois annonces du même contenu.
- `prefers-reduced-motion: reduce` doit livrer une **variante réduite**, pas une page vide : trois actes statiques empilés, même contenu, ancres, `alt` complet sur les trois frames (aujourd'hui `alt=""` sur les non-actives).

**Critère d'acceptation mesurable :** NVDA + Chrome, 60 s sur le chapitre sans interaction = 0 annonce spontanée ; axe-core = 0 violation serious ou critical à 390/768/1024/1280/1440/1920 **plus 1280×640** ; chaque arrêt de focus présente un anneau ≥3:1 contre les deux fonds adjacents ; chaque élément focalisé vérifie `0 <= getBoundingClientRect().top <= innerHeight`.

---

### C10 — LA GÉOMÉTRIE DU PIN ET LA COUCHE IMAGE
**Discipline :** Usability · **Gain : +0,15**

**Technique exacte :**
- `.aj-sequence__stage { height: clamp(640px, 78svh, 860px) }` (5247) avec `.aj-sequence__controls { position:absolute; bottom:0; min-height:74px }` (5376) et `start: "top 8%"`. À **1280×640**, le bas du stage tombe à 691 px pour 640 px de viewport : transport, onglets de coloris et CTA boutique sont sous la ligne de flottaison pendant les 544 px d'épinglage. C'est la configuration matérielle la plus répandue chez les jurés — MacBook 13" en fenêtre non plein écran. Lier la hauteur du stage à `min(78svh, 100svh - hauteurControls - 2×gutter)`.
- **Le mécanisme de l'absence de `srcset` est `next.config.ts: images.unoptimized: true`.** Avec `unoptimized`, `next/image` n'émet aucun `srcset` — c'est la cause, et aucun des six audits ne la nomme alors que tous prescrivent le symptôme. `sizes` renseigné sur 6 images sans `srcset` est du code mort. Deux chemins seulement : réactiver un runtime d'images sur Cloudflare Workers — choix explicitement rejeté dans le dépôt — ou pré-générer les dérivés au build avec `sharp`. **Tant que cet arbitrage n'est pas écrit, « 17/17 avec srcset » est un critère sans chemin.**
- Logo `aj-luxury-logo.webp` : 720×520 natif rendu en 106×76 (×6,8) pour 43 796 octets. Régénérer en 212×153.
- L'image mannequin de la séquence est en `loading="lazy" fetchPriority="low"` alors qu'elle est le sujet de la section.

**Critère d'acceptation mesurable :** à 1280×640, toute la barre de contrôle reste dans le viewport pendant l'intégralité du pin ; 0 image avec `naturalWidth > clientWidth × devicePixelRatio × 1,15` ; l'arbitrage `srcset` est consigné par écrit, daté, avec un décideur nommé.

---

### C11 — LA MARQUE PARLE
**Discipline :** Content + Design · **Gain : +0,10**

**Technique exacte :**
- Retirer « Reveal Your Inner Beauty » comme signature — **mais pas pour l'argument de traduction**, qui est faux : une signature premium reste légitimement dans une seule langue ; une signature qui mute par locale n'est plus une signature, c'est une accroche. Les deux raisons qui tiennent : registre cosmétique de consolation, et éloge descriptif générique dont le périmètre de protection en classe 25 est quasi nul.
- **Aucune ligne de remplacement n'est adoptée par ce jury.** Les deux propositions échouent leur propre test d'opposabilité : « Beauty begins underneath » est reprenable mot pour mot par CDLP ou Le Slip Français, et « Le luxe le plus près de la peau » est le positionnement littéral de Sunspel et Hanro. **OPEN DECISION — décideur : Adam.** Test opposable écrit : la phrase retenue ne doit pas pouvoir être reprise sans modification par CDLP, Le Slip Français ou Hanro.
- Nommer les fondateurs dans le texte visible. Aujourd'hui Jérémy et Alex n'apparaissent que dans des `alt` de `editorial-moodboard.ts` et dans un `<figcaption>` enfermé sous `.aj-film__portrait--sr`. La seule chose qu'aucun concurrent français ne peut copier est traitée comme une mention légale.
- Unifier le nommage : `Pourpre Impérial` / `Lilas Céleste` / `Rose Velours` = impérial / céleste / textile. Trois systèmes sémantiques pour trois références. Soit le registre apollinien intégral, soit le registre nu. Un quatrième coloris doit être nommable par déduction.
- Supprimer `.aj-shop__close`, doublon verbatim de `.aj-proof` deux écrans plus haut.

**Critère d'acceptation mesurable :** la signature retenue échoue le test de substitution pour les trois marques nommées ; les prénoms Jérémy et Alex figurent dans le texte visible de l'accueil ; les trois noms de coloris partagent un registre identifiable ; aucune chaîne de ≥15 caractères n'apparaît deux fois dans le texte visible.

---

### C12 — LE HARNAIS, LA GOUVERNANCE DE BRANCHE, L'URL DE SOUMISSION
**Discipline :** Prérequis · **Gain direct : +0,05 — condition de démontrabilité des onze autres**

**Technique exacte :**
- Le harnais est le **premier** livrable. Deux campagnes DevTools instrumentées se contredisent sur un fait binaire (`.pin-spacer.length` : 0 contre 1) et rien dans le dépôt ne permet de trancher. `tests/motion.e2e.mjs` devient rouge si le pin est retiré, si `scroll-behavior: smooth` revient, ou si un sélecteur repasse sous double autorité CSS + GSAP.
- **Ligne de base sur la PREVIEW.** Tous les chiffres de performance en circulation — TTFB 2 064 ms, DCL 2 863 ms, 23 requêtes, 0 `<h1>`, 0 `€`, `ⅡFiger le métal` — sont mesurés sur `ajluxurystore.com`, dont §B5 établit que c'est un build **différent** (`gsapPresent: false`, `aj-featured` au lieu de `aj-sequence` : le rollback R10 v15). **Six des douze rendus importent des mesures de production comme si elles décrivaient la branche auditée.** Aucun critère d'acceptation ne peut être énoncé contre la production.
- Gouvernance de branche : les douze rendus prescrivent des écritures sur `codex/ajl-awwwards-experience-20260815`, une branche `codex/*`. Un repo, une branche, un agent. Ce travail atterrit sur `claude/ajl-*` coupée à ce SHA, ou dans un worktree dédié. **Aucun des douze rendus n'a nommé la branche de destination.**
- Inventaire du code mort avant reconstruction : `IntroSequence.tsx` et `ApollonHorizontalRail.tsx` sont définis et importés nulle part ; `globals.css:1377+` porte tout le chapitre `.aj-apollon-myth` (sticky 180svh, rail horizontal, `will-change: transform` statique) pour un composant non monté ; `.aj-featured` appartient à la production. `IntroSequence` est très exactement la chorégraphie d'entrée que l'acte 0 réclame : décider, rebrancher ou archiver.
- **Une seule URL de soumission, sans paramètre de requête.** `?apollon=` ne doit pas survivre.

**Critère d'acceptation mesurable :** le harnais est commité, vert sur la branche corrigée, rouge sur chacune des trois régressions ; une ligne de base TTFB/LCP/INP/CLS existe sur la preview, datée ; la branche de travail est `claude/*` ; un arbitrage écrit et daté existe pour chacun de : variante A/B, chemin `srcset`, signature, composants morts.

---

## 4. ARBITRAGE VARIANTE A CONTRE VARIANTE B

**Ce que sont réellement les deux variantes** — vérifié en ouvrant les fichiers, pas en lisant le code :

- **A (`?apollon=world`)** : le mannequin **dans le décor**. Même lyre dorée, même branche de laurier, même arc et carquois, même sol de marbre, même mur — que le packshot `apollon-*-lyre-v1.webp`. Les deux images sont deux prises d'un même plateau.
- **B (`?apollon=color`)** : le cadre **identique** au pixel de pose près, avec la lyre, le laurier, l'arc, le carquois, le socle et le sol de marbre **entièrement supprimés**. Il reste un mur nu. Écart de poids : 326 526 → 269 140 octets, soit 57 386 octets.

**Correction au cadrage de la question.** La variante B n'est pas « boxer fantôme + mannequins sur fond harmonisé ». Il n'existe aucun actif de boxer fantôme dans le dépôt. Et — point décisif — **le panneau gauche (`still`) reste le packshot lyre avec tous ses props dans les DEUX variantes.** Donc :

- la variante A place un packshot avec props à côté d'un mannequin **dans les mêmes props** → même fond, nativement ;
- la variante B place un packshot avec props à côté d'un mannequin **sans aucun prop** → **elle détruit activement le « même fond » qu'Adam demande.**

**RECOMMANDATION : VARIANTE A, sans condition.** Supprimer `conceptMode`, le champ `bodyColor` des trois entrées de `frames`, et le `useEffect` qui lit `new URLSearchParams(window.location.search).get("apollon")`. Archiver — ne pas supprimer — les trois `apollon-*-model-color-v1.webp`. Coût de la décision : 57 Ko par coloris. Bénéfice : la seule chose qui distingue visuellement AJ Luxury de n'importe quel e-shop.

**Arbitrage de second rang, et il compte autant.** Ce qu'Adam appelle « les caleçons SANS mannequins », **ce sont les `apollon-*-lyre-v1.webp`.** L'audit UX les a qualifiés d'« images symboliques, pas des packshots » et a prescrit `product-{rose,lilas,pourpre}-front.webp` à la place. C'est faux deux fois :

1. **`product-pourpre-front.webp` n'existe pas.** Inventaire réel vérifié par `git ls-tree` : `product-rose-front`, `product-rose-detail`, `product-rose-profile`, `product-lilas-front`, `product-lilas-back`, `product-lilas-detail`, `product-lilas-model`, `product-pourpre-alt`, `product-pourpre-back`, `product-pourpre-detail`, plus `product-card-{rose,pourpre}`. La bascule émotionnelle prescrite est irréalisable pour un coloris sur trois.
2. **Les fichiers `-lyre` SONT le vêtement seul**, sur le même plateau, avec la bande jacquard « AJ LUXURY » de 3,5 cm et la plaque métal grandes et parfaitement nettes. Je les ai ouverts.

**Conséquence de gouvernance : la v1 de la mise en regard ne requiert AUCUN nouvel actif, donc AUCUN gate Isabelle.** Elle est livrable sur la preview cette semaine. Restent `PROPOSED — ISABELLE NOT YET CONFIRMED` : tout packshot supplémentaire (dos, macro ceinture) sur le même plateau, toute régénération des plans rose et pourpre dans la lumière du lilas, **et tout élargissement d'usage des actifs `editorial/isabelle-apollon/*` au-delà du web** — grille Instagram, carton, encart colis, print. Le nom de dossier lui attribue ces images ; passer d'un usage web interne à un usage packaging et réseaux est un changement de périmètre, de crédit et de licence.

---

## 5. DÉSACCORDS NON RÉSOLUS ENTRE EXPERTS ET TESTEURS — MA TRANCHE

| # | Désaccord | Ma tranche |
|---|---|---|
| 1 | **La timeline épinglée s'instancie-t-elle ?** Expert GSAP : oui (9 triggers, 1 pin-spacer, `--aj-split` 36 → 29,0055 → 33,9998). Fichier de preuves + 4 rendus : non (0 pin-spacer à 7 offsets et après cycle de resize). | **NON TRANCHÉ, ET RENDU CADUC.** Le mécanisme avancé par l'expert (`scroll-behavior: smooth`) ne peut pas l'expliquer : un `.pin-spacer` est créé à l'**instanciation** du ScrollTrigger, pas au scroll. Aucune des deux campagnes n'a nommé la variable divergente (build dev/prod, StrictMode, état d'hydratation, cache). **Décision : zéro heure de plus sur l'ancien câblage.** C2 réécrit le trigger, C12 tranche le fait de façon permanente. Deux candidats jamais explorés, à instrumenter par le harnais : `overflow: hidden` sur `.aj-home` (3083) **et** sur `.aj-sequence` (5203) — deux ancêtres clippants au-dessus de l'élément épinglé, pathologie ScrollTrigger classique, remède `overflow-x: clip` qui ne crée pas de conteneur de défilement contrairement à `hidden` qui force l'autre axe à `auto` ; et le chemin où, si le démontage précède la résolution du `import()`, `cancelled = true` sort **avant** l'assignation de `revertGsap`. |
| 2 | **Cause du pin manquant : « le garde s'exécute avant l'hydratation du chunk séparé ».** Trois rendus la posent en cause prouvée. | **FALSIFIÉE.** `page.tsx:9` importe `ApollonGuidedSequence` **statiquement** — pas de `next/dynamic`, pas de `ssr:false`. `.aj-sequence__stage` est dans le HTML SSR, et le fichier de preuves relève lui-même `.aj-sequence__stage présent : 1` et `22/22 sélecteurs résolvent`. **Le fichier de preuves classait ce point en « suspect à instrumenter, non prouvé, à ne pas affirmer ».** C'est l'erreur la plus répétée des douze rendus. |
| 3 | **Anneau de focus à 1,04:1 sur 1 px, P0 phare.** | **FAUX, testeur gagne.** La règle typée 66-70 (`2px solid #676dd8`, spécificité (0,1,1)) bat la règle `:where(...)` de 4302 (spécificité (0,1,0)). 3,90:1 sur fond clair, 4,48:1 sur fond sombre : conforme. Survit : `select` non couvert, et `tabIndex={0}` sans `role` ni nom sur `.aj-moodboard`. Le vrai défaut est chromatique. |
| 4 | **Nombre de collisions cascade CSS/GSAP : 4 (expert) contre 2 (testeur).** | **2, testeur gagne**, vérifié dans le fichier. `.aj-shop__heading` / `.aj-story__copy` sont un défaut parent/enfant de multiplication d'opacité — réel, mais différent. L'inflation du chiffre affaiblissait un diagnostic par ailleurs correct. |
| 5 | **`object-fit: cover` sur les deux panneaux du diptyque, split 30,5/69,5.** | **Rejeté, testeur gagne, et j'étends.** Deux `cover` indépendants font apparaître la lyre partagée ~2,2× plus grande à droite : la prescription détruit la continuité qu'elle prescrit. Et un `cover` naïf sur un panneau de 921×702 pour une source 1731×2600 décapite le mannequin. Méthode correcte : **un facteur d'échelle identique aux deux panneaux.** J'ajoute : la mesure « horizon à 78 % contre 95 % » de l'audit marque portait sur la base du socle, pas sur le sol — le sol de marbre est à ~70 % et ~74,5 %, soit 4 points. **Aucun reshoot requis.** |
| 6 | **Supprimer le scrim et le `filter: saturate(0.88) contrast(1.02)`.** | **Testeur gagne sur le fond.** Vérifié à l'œil : les deux prises partagent le décor mais pas l'exposition. Supprimer **l'asymétrie** (0,6 d'un côté, 0,08 de l'autre), pas l'étalonnage. J'ajoute le point que ni l'un ni l'autre n'a vu : **le socle de marbre central n'existe pas dans le plan mannequin.** |
| 7 | **`snap: {snapTo:'labelsDirectional'}`.** | **Rejeté, testeur gagne.** Le snap déplace le scroll après que l'utilisateur a cessé de scroller — override de contrôle, interdit par la prescription 8 du même auteur. |
| 8 | **`clip-path` comme propriété compositable, critère « 0 Layout ».** | **Rejeté, testeur gagne.** Chromium ne composite pas `clip-path`. Le coût passe du layout au **paint** d'une couche 1731×2600 sur le thread principal, et le critère valide une solution potentiellement aussi lente. Deux transforms contra-rotatifs, et le critère doit budgéter le paint. |
| 9 | **`pinType: 'transform'`.** | **Rejeté, testeur gagne.** `fixed` est le mode stable sur le scroller racine en scroll natif, et un ancêtre transformé devient le bloc conteneur de tout `position: fixed` descendant. |
| 10 | **`autoRefreshEvents` sans `resize`.** | **Rejeté, testeur gagne.** Contredit le critère de réversibilité au resize du même audit. `ignoreMobileResize: true` suffit. |
| 11 | **`font-display: optional`.** | **Rejeté, testeur gagne.** Pas de phase de swap : au premier chargement, celui du jury, le h1 de 132 px s'affiche en police de repli. Et cela contredit le handoff `document.fonts.ready` dont dépend le reveal SplitText du même plan. |
| 12 | **Gate Isabelle sur une licence de fonte.** | **Rejeté, testeur gagne.** Une licence typographique est un contrat éditeur. Invoquer son consentement ici dilue un garde-fou qui doit rester exact pour rester crédible. **Le gate que les audits ont manqué** : l'élargissement d'usage de `editorial/isabelle-apollon/*` du web au packaging/print/réseaux, et toute equirectangulaire « photographiée dans le décor » — ces plans sont des images IA, il n'y a pas de plateau à photographier. |
| 13 | **Ligne de signature de remplacement.** | **Aucune adoptée.** Les deux propositions échouent le test d'opposabilité que le même audit énonce trois lignes plus bas. OPEN DECISION, décideur Adam, test écrit. |
| 14 | **Critères non opérants** : chevauchement de `getClientRects()`, `getAll().length ≤ 6`, `getAnimations().length + inline === 1`, « 70 % de `size_selected/product_view` au premier run de préproduction », « Rich Results Test sur la preview privée », « TTFB < 400 ms » contre une baseline de production, « contraste ≥ 4,5:1 sur le prix » (déjà ~6,3:1), « 4 garanties sans scroll à 390×844 » incompatible avec le plancher 14 px du même audit. | **Tous rejetés.** Un critère dont le chiffre de départ est faux, dont l'outil ne peut pas atteindre le terrain, ou qui échoue sur une implémentation correcte, n'est pas un critère. Chaque testeur en a attrapé au moins un ; collectivement ils les ont tous attrapés. **C'est la contribution la plus forte de la couche adversariale.** |
| 15 | **Moodboard mobile « écrasé en 129/104/129 px ».** | **FAUX, testeur gagne**, vérifié : le bloc `max-width:760px` est un carrousel flex `overflow-x: auto` à `78vw` par vignette avec `scroll-snap-type: x mandatory`. Les valeurs de grille citées n'existent pas dans le fichier. |
| 16 | **Vidéo hero et `serveMp4Range`.** | **Testeur gagne.** §B1 relève `<source>` sans aucun enfant et `networkState 0` : un élément sans enfant `<source>` n'émet aucune requête HTTP, donc un handler de Range côté Worker ne peut pas être en cause. Le gate est client (`shouldAttachHeroVideoSource`). Et la mesure est prise sur la **production**, que §B5 prouve être un autre build. **Conséquence de pilotage : « la vidéo hero est un acquis à préserver » n'a pas d'objet mesuré aujourd'hui** — c'est une régression à reconfirmer sur la preview dans un navigateur ordinaire avant toute prescription. Le défaut `arrayBuffer()` (worker/index.ts:2694 et 2703) reste réel et à corriger, mais pas sous ce motif. |
| 17 | **Parité Jérémy/Alex dans la séquence.** Aucun expert ne l'a vérifiée ; un seul testeur l'a soulevée. | **PARITÉ ROMPUE — confirmé par moi.** J'ai ouvert les frames : le mannequin du rose (cheveux foncés attachés, barbe fournie, carnation plus profonde, morphologie plus lourde) et celui du lilas (cheveux bouclés châtains, bouc, chaîne, tatouage pectoral, morphologie plus légère) sont **deux hommes différents**. Le testeur marque rapporte pourpre identique au rose, soit un ratio 2:1. La parité est un acquis nommé comme contrainte dure, et la section signature la viole. **Le critère de parité entre dans C1 et C2, pas dans une note de bas de page.** |

**Verdict sur la boucle elle-même :** les testeurs ont surpassé les experts. Chacun des six experts a construit au moins une prescription phare sur une prémisse non vérifiée — trois sur la **même** hypothèse d'hydratation falsifiée. Chacun des six testeurs a attrapé au moins un critère d'acceptation inopérant. La couche adversariale s'est payée. Meilleure trouvaille des douze : la formule `PORTRAIT_POSTER_SIZES` comme mécanisme réel de l'upscale ×3,2 du LCP. Erreur systématique la plus coûteuse : importer les mesures de production §B comme descriptions de la branche auditée — six rendus l'ont fait.

---

## 6. HORS PÉRIMÈTRE, ET POURQUOI

1. **Toute mise en production, et tout critère d'acceptation énoncé contre `ajluxurystore.com`.** Commerce fermé, rollback R10 v15 live, aucun paiement, transporteur ou e-mail connecté. La preview Cloudflare privée est le seul terrain. Cela invalide comme critères : « TTFB < 400/600 ms », « le prix apparaît en production à ≥28 px », « Rich Results Test sur les trois URL », et chaque mesure §B utilisée pour décrire la branche.

2. **Tout ce qui est en aval de l'ajout au panier.** Restent dedans, parce que ce sont des corrections de contenu à coût nul : prix sur `/shop` (une ligne), `<h1>` unique et descriptif par PDP, plancher typographique transactionnel (absorbé par C4). Sortent : porter `CLIENT_VALIDATED_PARCEL_MAX_ITEMS` de 3 à 6 et inventer `AJL_ENVELOPE_{4,5,6}_ITEMS_V1` fabrique des données colis « validées client » sans transporteur, tarif ni bordereau connectés ; le « Trio Apollon » à 79 € à prix unitaire dégressif invente une offre commerciale et une remise ; les quatre garanties nommées (enveloppe opaque, libellé bancaire neutre, échange de taille offert, délai chiffré) créent des engagements commerciaux et opérationnels qu'aucun principal n'a autorisés. **Note de lecture** : le plafond réel est `currentQuantity >= 5 || (runtimeMode === 'production' && itemCount >= 3)` — le 3 ne s'applique qu'à la production, qui est fermée ; sur la preview la borne est 5 par ligne. Le « panier maximum de 89,97 € par construction » n'existe pas sur le terrain de test.

3. **Le guide des tailles comme tâche de développement.** La table rend quatre fois « Mesure à confirmer » parce que personne n'a les mesures. Adam ne peut pas les inventer. Livrable réel : un composant à trois colonnes **plus** une demande de mesures datée au fabricant. Et ancrer le guide sur les mensurations de Jérémy et Alex exige leur consentement écrit préalable — des mensurations nominatives d'individus identifiés sont des données personnelles. Aucun audit ne mentionne ce gate une seule fois.

4. **JSON-LD et données structurées.** Réel, mais `generateMetadata` du PDP pose déjà `robots: { index:false, follow:false }` : il n'y a aucun dommage actuel, c'est un item de porte de lancement. Et le jury Awwwards ne lit pas le JSON-LD. Rétrogradé de P0 à ligne de checklist.

5. **La réécriture WebGPU/TSL du champ métallique** (equirectangulaire RGBE en KTX2, GGX anisotrope, dispersion à 3 échantillons, SDF metaballs, bruit bleu void-and-cluster). Trois motifs : l'environnement « photographié dans le décor » est un actif créatif nouveau dérivé de l'univers d'Isabelle, sans gate appliqué ; il n'y a pas de plateau à photographier, ce sont des images IA ; et cela remplace un composant qui porte aujourd'hui `prefers-reduced-motion`, un kill mobile, `MAX_FPS 30` et un fallback CSS par un pipeline à 4 ms GPU/frame sur un fond décoratif, sans budget INP/LCP. Usability pèse 30 %. Le métal se corrige dans C5 par l'étalonnage et le dé-banding ; il n'obtient pas un nouveau renderer avant que le diptyque, la typographie et la séquence mobile existent.

6. **Fabrication de props physiques, macro ceinture, favicon, embossage carton, encart colis.** Engagements de dépense et de production hors terrain autorisé, sans budget ni fournisseur. Et partiellement fondés sur un fait faux : **la ceinture de 3,5 cm et sa plaque métal SONT déjà photographiées, grandes et nettes, dans les trois `apollon-*-lyre-v1.webp`** — je les ai regardées.

7. **Le reshoot intégral des prises portées** (octabox, 85-135 mm, quatre cadrages canoniques, trois coloris). La critique de lumière est juste pour rose et pourpre. Mais **l'actif lilas est déjà le clair-obscur latéral doux que l'audit réclame** : c'est le contre-exemple qui invalide la généralisation. Voie courte : régénérer rose et pourpre dans la lumière du lilas, et faire du lilas la référence de direction photo. Des semaines bloquées sur un consentement contre une correction livrable cette semaine.

8. **`experimental.viewTransition` et le canal React expérimental** pour la transition carte → PDP. Déplacer la base de rendu d'un site client gelé sous rollback R10 v15 pour un effet de transition. Les cross-document view transitions et le `<ViewTransition>` same-document sont des chemins exclusifs, pas cumulatifs. Même verdict pour `document.startViewTransition` sur le changement de coloris : les trois `<article>` coexistent en permanence dans le DOM, donc des `view-transition-name` dupliqués dans un même instantané font **avorter** la transition. Le mécanisme est sous-spécifié et la timeline de C2 fait le travail.

9. **Le débogage du pin existant.** Voir tranche 1. La réécriture le rend caduc, le harnais tranche le fait. Zéro heure supplémentaire.

10. **Toute écriture sur `codex/ajl-awwwards-experience-20260815`.** Un repo, une branche, un agent. Ce travail est coupé sur `claude/ajl-*` à ce SHA, ou dans un worktree dédié.

---

**En une ligne pour lundi :** C12 (le harnais et la branche) le matin, C1 (la plaque) l'après-midi — c'est le seul chantier qui répond littéralement à la demande d'Adam, il est constructible avec les actifs existants, il ne requiert aucun consentement, et il vaut à lui seul plus de points que les six audits e-commerce réunis.