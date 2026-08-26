Tu prends la direction artistique et le motion du front d'AJ Luxury, marque française de
sous-vêtements masculins premium. Objectif : **Awwwards Site of the Day**, seuil jury **9,7/10**,
pondération Design 40 % · Usability 30 % · Creativity 20 % · Content 10 %. Note actuelle mesurée : **3,2/10**.

Je t'ai uploadé les fichiers dont tu as besoin (voir §5). Travaille avec eux. Si tu obtiens en plus
l'accès au dépôt `arochab/aj-luxury` branche `claude/front-awwwards-20260817`, tant mieux — mais ne
bloque pas dessus, et n'invente jamais un fichier que tu n'as pas sous les yeux.

## 1. CE QU'ADAM DEMANDE, MOT POUR MOT

**Les images IA des caleçons SANS mannequins À CÔTÉ de celles AVEC mannequins, sur le MÊME fond.**

Le fait décisif : ce sont **deux prises du même plateau** — même mur, même sol de marbre, même lyre,
même laurier, même arc, même carquois. Ratios identiques, 0,6667. Ouvre les six `.webp` et tu le
verras. Le CSS actuel fabrique deux fonds artificiels pour les séparer : `#d5cec9` d'un côté, un
`radial-gradient` sur `#15151a` de l'autre. **Ton travail est de laisser voir la plaque.**

Trois interdits techniques, chacun avec sa raison :
- **Une seule échelle pour les deux panneaux.** Deux `object-fit: cover` indépendants sur des
  panneaux de 30,5 % et 69,5 % donnent des facteurs 0,457 et 0,545 : la lyre partagée — la preuve
  même du plateau commun — apparaît ~2,2× plus grande à droite. Ça détruit exactement la continuité
  qu'on construit. Facteur unique, alignement par `object-position` seul.
- **Pas de `clip-path` comme propriété « compositable ».** Chromium ne composite que `transform`,
  `opacity`, `filter` et `backdrop-filter`. Le volet se fait par deux transforms contra-rotatifs :
  fenêtre `overflow: hidden` translatée, contenu translaté de l'opposé.
- **Le fond est per-frame, jamais global.** Les trois plateaux ont trois murs différents : plâtre
  rose, ardoise bleu-gris, bordeaux. Un token unique casserait deux coloris sur trois.

Un socle de marbre n'existe que dans le packshot : au raccord il apparaîtra puis disparaîtra.
C'est un problème de composition à résoudre, pas un bug.

## 2. L'ÉTAT RÉEL, MESURÉ — PAS DES IMPRESSIONS

Sur la preview Cloudflare privée déjà déployée, viewport 1440×900,
`prefers-reduced-motion: no-preference` :

| Fait | Valeur |
|---|---|
| `document.scrollingElement === documentElement` | **true** — le document est le scroller |
| `getComputedStyle(html).scrollBehavior` | `auto` |
| `.home-shell` dans le DOM | **0** — c'est du CSS mort, aucun composant ne la rend |
| `.pin-spacer` | **1** — le pin s'instancie |
| `--aj-plate-scale` sur 2 000 px de scroll | **évolue** — la timeline progresse |
| `--aj-wipe` sur 2 000 px de scroll | **figé à `100%`** |
| coloris actif | ne change pas |

**Le blocage n'est donc pas architectural : c'est une interpolation de propriété personnalisée.**
`--aj-wipe` est déclarée `@property { syntax: "<percentage>" }` et animée par GSAP ; la valeur posée
n'atteint jamais le rendu. Piste à instrumenter en premier : la façon dont GSAP écrit la variable.
Contournement connu, à évaluer et non à appliquer aveuglément : animer un objet proxy et écrire la
variable dans un `onUpdate` via `style.setProperty()`.

⚠️ Un document antérieur affirmait que `.home-shell` était le conteneur de défilement et la cause
racine. **C'était faux, c'est corrigé, ne le reprends pas.**

## 3. LE NIVEAU ATTENDU

Du **full GSAP**, état de l'art août 2026/2027 : scène épinglée, scrubbée, chapitrée, qui tient aussi
sur mobile. Pas du fade-and-rise. Le site charge aujourd'hui 46 Ko de GSAP + ScrollTrigger pour un
`opacity .72 → 1` sur 12 px — un réglage par défaut de thème, pas une intention.

Trois actes, une seule horloge — le scroll, jamais un minuteur :
1. **la plaque se révèle**, le vêtement seul ;
2. **le volet** — le vêtement seul devient le vêtement porté. C'est la bascule émotionnelle et c'est
   la demande d'Adam ;
3. **le coloris change** sur un décor tenu : la lyre, l'arc et le marbre restent fixes, seuls le
   vêtement et la teinte du mur se dissolvent.

Défauts à corriger, tous mesurés : une seule famille typographique employée de 8 px à 245 px
(rapport 30,6:1, **90 déclarations sous 12 px sur 190**) — c'est le reproche d'Adam « les infos trop
petites et paas beau », inscrit 90 fois dans la feuille. Le seul `<h1>` est en
`clip: rect(0,0,0,0)`. La section « histoire » de la marque fait 0,34 écran quand le pied de page en
fait 1,38. Aucun fond de section en ton moyen. Et la parité Jérémy/Alex est rompue dans la section
signature : ratio 2:1, le rose et le lilas montrent deux hommes différents.

**Ton budget va au Design (40 %) et à la Creativity (20 %).** Six audits antérieurs ont dépensé ~70 %
de leur effort sur Usability et Content, soit 40 % de la pondération : les exécuter intégralement
amènerait ce site à 5,5, jamais à 9,7.

## 4. LA GAUNTLET LOOP — EXÉCUTE-LA, NE LA RÉSUME PAS

**9 agents experts mondiaux en parallèle**, niveau état de l'art août 2026/2027 : motion GSAP,
direction artistique digitale, retouche et compositing d'image, typographie et systèmes, UX
scrollytelling, front mobile tactile, stratégie de marque sous-vêtement premium, perf/a11y/grille
Awwwards, qualité et harnais de test.

Puis **les 9 mêmes en testeurs adversariaux**. Chacun rend : prescriptions validées avec la
vérification qui les fonde, prescriptions rejetées avec le motif technique, manques critiques, note
du travail expert sur 10. Au tour précédent, **les testeurs ont surpassé les experts** : chacun des
six experts avait bâti une prescription phare sur une prémisse non vérifiée.

Puis le **jury final** : note par discipline et note globale calculée à la pondération, tranche sur
chaque désaccord, liste de ce qui reste sous le seuil. **Seuil 9,7.** Boucle de reprise tant que la
note est en dessous, **trois tours maximum**, puis remontée à Adam.

Règles qui font échouer d'office :
- Une recommandation qui pourrait s'appliquer à n'importe quel site est une recommandation nulle.
- Toute prémisse doit être **mesurée ou lue dans la source**. Une règle CSS n'est pas une preuve
  qu'un élément existe — c'est exactement l'erreur qui a produit la fausse piste du §2.
- Aucun critère d'acceptation sur du trafic : ce site n'en a pas.
- Le jury ne peut pas gonfler une note pour atteindre le seuil. « Le plan passe, le site reste à
  démontrer » est une issue valide et doit être écrite telle quelle.

## 5. CE QUE JE T'AI UPLOADÉ

- **`apollon-{rose,lilas,pourpre}-lyre-v1.webp`** — les caleçons **seuls**, 1024×1536.
- **`apollon-{rose,lilas,pourpre}-model-world-v1.webp`** — les caleçons **portés**, 1731×2600,
  même plateau.
- **`ApollonGuidedSequence.tsx`** — le composant actuel de la séquence.
- **`sequence.css`** — le bloc CSS actuel de la séquence.

Regarde les images avant de concevoir quoi que ce soit. Tout le raisonnement du §1 s'effondre ou se
confirme en les ouvrant.

## 6. CE QUE TU LIVRES

1. **Une maquette jouable en HTML autonome** : la plaque et les trois actes, GSAP réel, scroll réel,
   avec les vraies images. Pas de placeholder.
2. **Les notes d'implémentation, chantier par chantier**, pour que l'agent code les porte dans le
   dépôt Next.js : quel fichier, quelle règle, quelle valeur, et le critère d'acceptation mesurable
   de chacune.
3. **Le rendu du jury** : notes par discipline, désaccords tranchés, ce qui reste sous 9,7.
4. Les viewports à tenir : **1440×900, 1920×1080, 1280×640, 768×1024, 390×844**.
   Le 1280×640 est la configuration la plus répandue chez les jurés et c'est celle où la barre de
   contrôle sortait du viewport pendant le pin.

## 7. INTERDITS ABSOLUS

- **Tu ne déploies pas.** La mise en ligne Cloudflare est faite par Claude Code sur demande d'Adam.
  Ne lance ni `wrangler`, ni build de release.
- **Aucune mise en production.** Commerce fermé, rollback R10 v15 live. La preview privée est le
  seul terrain.
- **Aucun nouvel actif créatif.** Tout ce qui n'est pas dans les fichiers fournis est
  `PROPOSED — ISABELLE NOT YET CONFIRMED`. Ne re-rends aucune vidéo, n'en commande aucune.
- **Aucune mesure prise sur `ajluxurystore.com`** ne décrit cette branche : la production est un
  autre build, elle n'a même pas de GSAP.
- **La parité Jérémy / Alex est une contrainte dure**, pas une préférence. Elle entre dans tes
  critères d'acceptation, pas dans une note de bas de page.

## 8. LA RÈGLE QUI A COÛTÉ LE PLUS CHER

Treize agents ont manqué un défaut plein écran — une découpe de visages ratée dans la vidéo du hero,
cheveux détourés en dur sans détail de mèche — parce qu'ils regardaient le DOM, le CSS calculé et les
timings. Personne n'a regardé l'image. Adam l'a vu en trois secondes.

**À chaque livrable, regarde le rendu. Une mesure verte n'est pas une preuve visuelle.**

**Commence par ouvrir les six images. Puis conçois.**
