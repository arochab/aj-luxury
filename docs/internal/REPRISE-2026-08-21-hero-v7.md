# Reprise — refonte front, hero v7

Session Claude Code du 21 août 2026. Branche : `claude/front-awwwards-20260817`.
Dernière mise à jour : deuxième pause, à la demande d'Adam.

Ce fichier ne remplace pas `HANDOFF-2026-08-21.md`, qui reste le récit des
cinq chantiers précédents. Il ne couvre que la passe de refonte en cours.

---

# Le premier écran — état à la pause du 21/08 (départ en avion)

## Ce que le hero est

```
    fond    = MÉTAL LIQUIDE, synthétique, calculé au navigateur
    marque  = LE LOGO DE LA MAISON, en grand, entre les deux
    figures = LES DEUX CORPS RÉELS, découpés
```

Master unique : `public/images/client/campaign-duo-lilas-seated.webp`, la vraie
prise de studio. **Les masters ChatGPT restent refusés** (visages déformés,
décor kitsch) : ne jamais les réutiliser ni en regénérer.

**La garantie sur les visages est structurelle et verrouillée par test.** Un
modèle GÉNÉRATIF redessine les pixels ; un modèle de SEGMENTATION ne produit
qu'un canal alpha et ne peut pas modifier un visage.
`tests/awwwards-experience.test.mjs` exige que `scripts/build_hero_figures.py`
lise le master approuvé et appelle `only_mask=True`.

## Les trois demandes d'Adam, traitées

1. **Le vrai logo, pas la typo.** Premier essai : lettrage reconstruit en
   Manrope à l'interlettrage relevé au pixel sur le fichier (capitale 69 px,
   écart moyen 43 px, soit 0,63 em calibré au navigateur). Fidèle, et pourtant
   un pastiche — le monogramme AJ est un dessin, aucune fonte ne le rend. Le
   premier écran sert donc l'actif de marque lui-même. **Bénéfice non prévu :
   l'atterrissage dans la barre devient un vrai changement d'échelle**, même
   fichier, au lieu d'un fondu entre deux objets.

2. **Le métal renforcé, en deux passes.** Le baisser à 42 % était le mauvais
   levier : le défaut n'était pas l'intensité mais le CONTRASTE. Contraste
   porté à 3,4, opacité rendue à 1, cadence lente → normale. Puis, le filtre
   ayant atteint sa limite, **deux changements dans le shader** : fréquence des
   plis 8,4 → 13,2, et spéculaire resserrée de 0,74-0,86 à 0,795-0,845 avec
   intensité 0,48 → 0,66. Termes spatiaux : la périodicité de la boucle n'est
   pas touchée, le test le confirme.

3. **Le mot rentre à la maison.** En défilant, le grand logo vient se poser
   dans la barre, qui s'efface tant qu'il est à l'écran.

## Cinq défauts trouvés PAR L'INSPECTION IMAGE PAR IMAGE

C'est la méthode qu'Adam a demandée, et elle a payé cinq fois :

1. **Le vol se terminait à mi-course.** Un tween sans durée prend 0,5 s ; dans
   une timeline au scrub il ne couvrait que la moitié du défilement. Relevé à
   p=0,5 : largeur finale atteinte, puis glissement à vide. `duration: 1`.
2. **La barre se dérobait pendant le vol** : le logo atterrissait sur une barre
   partie. Contrat `data-aj-tete-seuil` : elle tient tant que le premier écran
   est là.
3. **L'état initial de l'opacité de la barre n'était jamais appliqué** :
   `gsap.set` n'écrit une propriété personnalisée qu'au premier rendu du tween
   qui la porte, et le nôtre est en `immediateRender: false`. Posé en DOM.
4. **Le lockup disparaissait derrière les corps** à 46cqi et mordait la copie
   de 50 px. Trois bornes désormais. En portrait, le terme de hauteur était
   calibré sur du lettrage : le logo mordait la copie de 72 px à 390 et 255 px
   à 768.
5. **L'à-coup de prise en main de GSAP, en pleine vue.** Le module arrive en
   import dynamique vers 430 ms, après que le CSS a peint la composition
   finale ; il posait alors ses valeurs de départ et **la scène sautait** (les
   corps passaient de y=72 à y=3) alors que le volet en était déjà à 83 %
   d'ouverture. Le volet attend maintenant que GSAP ait pris la main et s'ouvre
   dans la même timeline. **Vérifié image par image** : à t=263 ms le saut a
   lieu sous un volet encore à 100 %, qui ne s'ouvre qu'à 1,2 s sur une scène
   déjà en mouvement. Un filet CSS à 1,7 s garde la page juste si le module
   n'arrive jamais.

## État de la recette

- **Neuf tailles d'AGENTS.md** : zéro débordement horizontal, zéro pied rogné,
  zéro collision, tous les écarts positifs.
- `lint` OK · `build` OK · **60/61 tests front**.
- Seul rouge : `synthetic health ... four zones ready` (503 local), **connu et
  préexistant**, périmètre backend.

## À faire à la reprise, dans l'ordre

1. `npm run dev`, port 3000. Rappel : `build` et `rendered-html` exigent
   `APP_ENV=preproduction` et `PREPROD_TARGET_PROJECT_ID` = le `project_id` de
   `.openai/hosting.json`. **Laisser 3,5 s après `goto` avant toute mesure** :
   l'arrivée dure ~2,7 s et fausse toute capture prise avant.
2. **Non vérifié depuis le dernier correctif du volet** : le mouvement réduit
   et le balayage des neuf tailles ont été validés AVANT ce correctif. Les
   refaire en premier — le volet a un nouveau chemin (`data-anime="pret"`).
3. Ensuite : les écrans 2 à 6 de l'accueil, dont le diagnostic est plus bas.

## Dette assumée

Les actifs v6 (4 MP4 + posters) et v7 (8 images) sont **encore dans `public/`**
alors que plus rien ne les sert : ~3,3 Mo de poids mort. Conservés comme retour
arrière tant qu'Adam n'a pas validé à l'écran. Leur suppression exigera de
réécrire `tests/hero-video.test.mjs`, qui vérifie encore leurs budgets d'octets.

---

# Déploiement de prévisualisation — 22/08/2026

**Version `402e6ff5-e090-4385-af0f-08027bcbff05`**, déployée sur
`https://aj-luxury-awwwards-branch-preview.adam-chabbi94.workers.dev`
depuis `cloudflare.awwwards-preview.jsonc` (`APP_ENV=preview`, donc mode
commerce `closed`). **La production n'est pas touchée** : elle exige la
validation explicite d'Adam puis de Jérémy.

## Vérifié EN LIGNE, pas seulement en local

- **13 routes** : statuts corrects (dont deux 404 servant la page dessinée),
  un seul `h1` par page, zéro débordement horizontal.
- Premier écran : `data-hero-version=v8`, logo à 954 px, `hero-figures.avif`
  servi, logo de barre à l'opacité 0 — la marque n'est écrite qu'une fois.
- Mentions légales : SIREN et SIRET du siège présents, **SIRET fermé absent**,
  **aucun numéro de TVA affirmé**, Belmont et RNE présents.
- Fiche produit : prix qualifié, **aucune mention TTC**.
- 150 images par seconde sur le premier écran.

## PIÈGE DE MESURE À CONNAÎTRE — il m'a fait conclure faux

Après une longue session Playwright, le navigateur de test **se dégrade à
1 image par seconde**. Conséquence : la première capture du déploiement
montrait un premier écran NOIR, et j'en ai conclu que le volet ne se levait
pas en ligne. C'était faux.

Le contrôle qui a tranché : mesurer les images par seconde **en local ET en
ligne**. Les deux donnaient 1 fps, et retirer le canvas WebGL n'y changeait
rien — donc le défaut n'était ni le métal, ni le déploiement, mais le
harnais. Après redémarrage du navigateur : 150 fps et volet entièrement
ouvert.

**Règle pour les prochaines sessions : avant de conclure à un défaut de
performance ou à un écran noir, redémarrer le navigateur et re-mesurer.**

## État de la suite complète

`npm test` — six lots front **tous verts** : 121, 24, 12, 1, 1, 59.

Le septième lot (backend/préprod, 48 tests) porte 6 rouges, **aucun causé par
cette session** :

- `the real current source branch is governed…` échoue **par construction**
  sur une branche Claude : la liste `allowed_source_branches` de
  `.openai/preprod-demo-only.json` ne contient que cinq branches `codex/*`, et
  ce fichier n'a jamais été modifié ici ;
- les cinq autres sont la famille D1/préprod qui exige les quatre zones
  provisionnées, déjà documentée comme dépendante de l'environnement.

## Vérifié APRÈS le correctif du volet (reprise du 21/08 au soir)

- **Mouvement réduit** : volet jamais posé, aucune échelle, composition
  complète, et la barre garde son logo puisque le vol ne joue pas.
- **Neuf tailles** : zéro débordement, zéro pied rogné, zéro débordement du
  logo ou des corps, tous les écarts positifs, `anime=pret` partout.
- **Un défaut trouvé au passage et corrigé** : le hero servait
  `/media/images/aj-luxury-logo.webp?v=v8` quand la barre sert
  `/images/aj-luxury-logo.webp` — deux entrées de cache pour un seul fichier,
  donc deux téléchargements du même dessin. Et le `fetchPriority="high"` du
  logo faisait émettre par React un préchargement de l'actif 720 px que le
  navigateur n'utilisait jamais, puisque le srcSet lui fait choisir le @2x.
  Le LCP de cet écran, ce sont les CORPS. Avertissement console éliminé.
- `lint` OK · `build` OK · **60/61** tests front.

## L'accueil, écrans 2 à 6 — état au 21/08 au soir

### Corrigé et vérifié

1. **Prix et « Découvrir » absents sur 67 % de chaque panneau.** Ils ne
   s'assemblaient qu'au dernier quart du PALIER : mesuré, `visibility:hidden`
   pendant 1 700 px de défilement sur le panneau 01. La phase la plus longue
   tenait un panneau en train de s'écrire, quand le brief exige que le
   visiteur comprenne toujours le prix et le chemin d'achat. Le commerce monte
   désormais pendant le dévoilement ; le palier commence sur un panneau
   entier. Vérifié sur les trois panneaux.
2. **Cadre vide sur téléphone.** La carte de copie était peinte aux dimensions
   de tout son contenu, révélé ou non : 190 px de rectangle sombre sur du
   vide, 79 % de la carte. Le voile ne peint plus que la hauteur révélée,
   plancher de 34 % qui couvre le titre.
3. **La photographie du téléphone était une miniature.** 183x275 px sur un
   écran de 844, soit 33 % de la hauteur, contre 93 % à 1440. Elle fait
   maintenant 266x399 — **+111 % de surface**. Piège rencontré : en
   dimensionnant par la hauteur, le flex écrasait le rapport à 0,46 au lieu de
   0,666 et `object-fit: cover` rognait le produit. D'où `flex: 0 0 auto`.
4. **La clôture était centrée** (x=162) quand toute la page part de la
   gouttière (58). Elle s'aligne. Et ses deux actions avaient le même poids au
   pixel : la boutique prend le rang principal, le récit reste en lien de
   texte.
5. **Deux libellés pour `/shop`** sur le même écran. Un seul désormais.

### Écarté après vérification — NE PAS ROUVRIR

- **Légendes de l'éditorial « désalignées » à 22 px.** Elles sont ancrées à
  LEUR PROPRE image dans un triptyque pleine largeur. Les caler sur la
  gouttière n'alignerait que la première. Faux positif.
- **« Deux marges droites concurrentes » dans la séquence.** Le diptyque
  remplit exactement de la colonne de copie au bord de l'écran : c'est un
  plein-bord assumé, comme le triptyque éditorial. La barre d'onglets, elle,
  est de l'interface et garde la gouttière. Faux positif.
- **Bande vide entre le titre et la photo sur téléphone.** C'est la zone de
  copie réservée et non peinte — donc le correctif 2 qui fonctionne.
- **Couture absente entre clôture et pied de page.** Exception documentée par
  la règle elle-même : aucune image ne borde cette jonction.

### Signalé, NON corrigé — décision à prendre par Adam

**La colonne de copie de la séquence fait 216 px à 1440, soit 21 signes par
ligne sur 4 lignes.** C'est très serré typographiquement (le confort commence
vers 45). Mais cette largeur est le produit d'une décision mesurée : la copie
ne peut pas se poser sur la nature morte — la luminance maximale sous le bloc
vaut 0,949, il faudrait un voile noir à 85 % pour tenir 5:1, c'est-à-dire
exactement la plaque opaque que la composition refuse. La colonne est donc
retranchée de la largeur avant que la hauteur du diptyque n'en soit déduite.
L'élargir coûte de la photographie. **Je n'ai pas renversé cette décision sur
un argument typographique seul.**

### Recette d'ensemble après tous ces changements

- **72 contrôles** (9 tailles x 8 positions de défilement) : zéro débordement
  horizontal.
- Descente et remontée complètes de la page : **zéro erreur console**, et le
  retour en haut restitue l'état exact (logo hero 954 px, opacité 1, logo de
  barre à 0).
- `lint` OK · `build` OK.
- Deux rouges, tous deux **préexistants et vérifiés comme tels** :
  `synthetic health` (503 local, périmètre backend) et
  `homepage product portraits`, qui porte sur `.aj-product-card__image`, une
  classe retirée par une session antérieure.

## La reprise, dans l'ordre

1. `npm run dev` à la racine du dépôt, port 3000. Compter ~40 s de démarrage.
2. Rappel : `npm run build` et les tests `rendered-html` exigent
   `APP_ENV=preproduction` et `PREPROD_TARGET_PROJECT_ID` = le `project_id`
   de `.openai/hosting.json`. **Les tests tournent contre l'artefact
   construit** : rebâtir avant de les lire, sinon ils jugent l'ancien front.
3. Attaquer les défauts du tableau ci-dessus, écran par écran, à l'œil au
   navigateur. Laisser au moins 3,5 s de repos après `goto` avant toute
   mesure : l'arrivée du hero dure 2,7 s et fausse toute capture prise avant.

## Rouges connus, préexistants, hors périmètre

- `synthetic health ... four zones ready` (503) : l'environnement local ne
  provisionne pas les quatre zones préprod. Périmètre backend.
- `homepage product portraits preserve the full head area` : porte sur des
  règles de `globals.css` inchangées depuis le commit `090bc60`, antérieur à
  cette session.

## Ce qu'il ne faut pas refaire

`HANDOFF-2026-08-21.md` §5 est confirmé : **les agents mesurent bien et
dessinent mal**. Sur cette session, l'inspection déléguée a été utile — elle a
produit un vrai diagnostic — mais elle a aussi rendu quatre P0 dont deux
étaient des captures prises en pleine animation et deux des décisions
documentées qu'elle ignorait. Toute alerte d'agent se vérifie avant d'être
corrigée.

## Garde-fous respectés

- Aucune écriture hors du dépôt, aucun fichier sur le Bureau.
- Production non touchée, aucun déploiement, aucun secret lu.
- Branche `claude/*`, worktree Codex `codex/ajl-sendcloud-controlled-20260817`
  laissé intact.
- Les actifs et composants v6 (`lib/hero-video.ts`, `HeroComposition`,
  `HeroBackgroundVideo`, les quatre MP4) sont **conservés volontairement** :
  ils sont le chemin de retour arrière tant qu'Adam n'a pas validé la v7. Ne
  pas les supprimer avant cette validation.

---

# Identité légale et corrections — 22/08/2026

## TVA : le numéro est publié

Adam a redonné le numéro le 22/08 après que j'ai refusé de le publier la
veille. C'est sa décision, elle est appliquée.

Ce qui est **vérifié** : la clé de contrôle. `(12 + 3 × (944996487 mod 97)) mod
97 = 58`. `FR58944996487` est donc bien le numéro intracommunautaire que la
règle française attache à ce SIREN — pas un numéro plausible, *le* numéro de
cette entreprise.

Ce qui **ne l'est pas** : son activation. L'API officielle
`recherche-entreprises.api.gouv.fr` renvoie encore `tva: null` au 22/08. VIES
n'a pas répondu — erreur de service `MS_MAX_CONCURRENT_REQ`, qui n'est **pas**
un verdict d'invalidité, et qu'il ne faut pas lire comme tel. C'est le
comportement attendu d'une entreprise en franchise en base : le numéro existe,
il n'est pas activé pour les échanges intracommunautaires.

**L'étiquette du prix reste donc en suspens, et c'est une question distincte.**
Le montant affiché est le même sous les deux régimes ; seule sa mention change
— « TTC » si assujetti, « TVA non applicable, article 293 B du CGI » si
franchise en base. Deux `assert.doesNotMatch` empêchent désormais de trancher
par inadvertance.

## Téléphone : aucun, et la ligne est omise

Adam confirme le 22/08 qu'aucune ligne n'est ouverte. L'article 6 III 1 a) de
la LCEN en demande un pour un éditeur personne physique. **Il manque donc une
mention légale, et aucun code ne peut la fabriquer.**

Le choix retenu : `LEGAL_CONTACT.phone = null`, et la ligne « Téléphone » de
l'éditeur n'est pas rendue. Un « à compléter avant l'ouverture des ventes »
visible sur des mentions légales en ligne ne satisfait pas davantage la loi et
signale en plus une marque qui n'est pas prête. Le manque est porté par
`PRELAUNCH_BLOCKERS`, là où il peut être traité.

Piège vérifié au test : l'hébergeur, lui, **affiche** un téléphone, celui de
Cloudflare France. Interdire la chaîne « Téléphone » ferait échouer le test
pour la mauvaise raison. L'assertion compte les lignes et exige qu'il n'en
reste qu'une.

## Activité déclarée

`activite_principale: "59.11B"` — production de films. Confirmé par l'API
officielle le 22/08. La vente de vêtements n'est pas l'activité enregistrée.
Ce n'est pas un défaut du site et rien n'est à corriger dans le code ; c'est un
point à traiter au guichet unique INPI avant l'ouverture des ventes. Ajouté aux
bloqueurs.

## DEUX CORRECTIONS DE MES PROPRES COMPTES RENDUS

Je les écris ici parce qu'elles ont été communiquées à Adam sous une forme
fausse, et qu'un chiffre faux dans un rapport vaut moins que pas de rapport.

**1. « Six lots front verts » était inexact.** Le test
`homepage product portraits preserve the full head area` était **rouge depuis
le commit `81bb776` du 16/08**, donc avant même cette session. Il exigeait
`object-position: center top` sur `.aj-product-card__image img` ; ce commit
avait fait passer la règle en `object-fit: contain` et remis l'ancrage à
`center`. Pire : `.aj-product-card` n'est plus rendue par **aucun** markup
depuis la refonte — le test gardait du CSS mort.

Il est reporté sur le contrat vivant, `.prise` et `.priseVoisine` dans
`Accueil.module.css`, et renforcé : `contain` n'est pas un ancrage plus fin,
c'est une garantie d'une autre nature, l'image entière entre dans le cadre donc
aucun recadrage n'est possible. `cover` est interdit sur ces éléments.

**2. Ma raison pour les 6 rouges backend était fausse.** J'avais écrit que cinq
d'entre eux « exigent les quatre zones provisionnées ». C'est faux pour au
moins `synthetic health exposes simulations…` : ce test **simule intégralement
la base**, zones comprises. Il échoue parce que le worker répond **503 au lieu
de 200** sur `/api/preprod/health`. La cause est donc *dans le worker*, pas
dans l'environnement.

Vérifié rigoureusement : rouge au `HEAD` `efebf4b`, sur arbre propre, avec un
build neuf. **Préexistant, donc — mais pas pour la raison que j'avais donnée.**
Le prochain qui prendra ce sujet doit partir du 503, pas des zones.

---

# PAUSE — 22/08/2026, reprise sur GO d'Adam

Branche `claude/front-awwwards-20260817`, HEAD `66e956f`, arbre propre, zéro
divergence avec `origin`. Rien en cours d'écriture, rien à récupérer.

## Ce qui bloque, et sur qui

### 1. LE STOCK — bloquant, et il n'appartient qu'à Adam

Adam a dit « 730 pièces, iso en nombre par taille ». **Le dépôt en déclare 756**,
avec une courbe transmise par le client :

| Coloris | S | M | L | XL | Total |
|---|---|---|---|---|---|
| Pourpre Impérial | 26 | 103 | 87 | 36 | 252 |
| Rose Velours | 26 | 103 | 87 | 36 | 252 |
| Lilas Céleste | 26 | 102 | 88 | 36 | 252 |

`docs/BACKEND-LOT-2-ACTION-PLAN.md:48` dit « le stock physique **transmis** ».
C'est une donnée client, pas une hypothèse. Elle est verrouillée par des
assertions dans quatre fichiers de tests (`backend-core`, `last-mile-ops`,
`production-commerce-api`) et par `db/seed.ts`.

**Hypothèse la plus probable, à confirmer** : « iso par taille » signifie *iso
entre les trois coloris*, ce que le dépôt fait déjà — Pourpre et Rose sont
identiques, Lilas ne déplace qu'une unité de M vers L. Et 730 serait un
souvenir approximatif de 756.

**Ne pas écraser 756 par 60/60/60/60.** Les conséquences sont asymétriques :
porter S de 26 à 60 vendrait 34 pièces inexistantes par coloris ; ramener M de
103 à 60 refuserait des ventes sur la taille la plus demandée. Si Jérémy a
recompté, il faut **le détail par taille**, pas le total.

Tant que ce point n'est pas tranché, le manifeste de stock ne peut pas être
écrit, et trois verrous de la porte de production restent fermés.

### 2. LES SECRETS — Adam seul, et jamais par le chat

Les comptes Stripe, Sendcloud et Resend sont ouverts (Adam, 22/08). Les clés
ne doivent transiter ni par le chat, ni par un fichier. Elles s'installent
directement depuis son terminal :

```
npx wrangler secret put STRIPE_SECRET_KEY --config cloudflare.production.jsonc
npx wrangler secret put STRIPE_WEBHOOK_SECRET --config cloudflare.production.jsonc
npx wrangler secret put SENDCLOUD_PUBLIC_KEY --config cloudflare.production.jsonc
npx wrangler secret put SENDCLOUD_SECRET_KEY --config cloudflare.production.jsonc
npx wrangler secret put RESEND_API_KEY --config cloudflare.production.jsonc
npx wrangler secret put RESEND_WEBHOOK_SECRET --config cloudflare.production.jsonc
```

**En mode `sandbox`, la clé Stripe doit commencer par `sk_test_`.** La porte
refuse une clé `sk_live_` à ce stade, et c'est voulu : aucun argent réel ne
peut circuler avant l'étape suivante.

⚠️ **Ces commandes exigent que le worker existe déjà sur le compte.** Il
n'existe pas : je ne l'ai pas déployé, faute de l'accord de Jérémy. Provisionner
un worker **sans route ni domaine** ne l'expose à personne et débloquerait
l'installation des secrets. C'est une décision d'Adam, elle n'a pas été prise.

### 3. L'ACCORD DE JÉRÉMY — manquant

`AGENTS.md` : la version candidate se valide par Adam d'abord, par Jérémy
ensuite. **Adam a donné la sienne le 22/08. Celle de Jérémy manque.** Sans
elle, aucun déploiement de production, même fermé.

## Ce qui a été fait pendant cette séance

- **Base de production créée** : `aj-luxury-production`, région WEUR, id
  `b02e8fc8-7309-43f7-a596-78fa51dc110d`. Le compte n'en portait aucune pour
  AJ Luxury. 16 migrations appliquées en distant, **45 tables vérifiées par
  requête**, migration préprod 0008 correctement exclue.
- **`cloudflare.production.jsonc` écrit, PAS déployé.** Aucune route, aucun
  domaine : brancher `ajluxurystore.com` est l'acte d'ouverture, il se décide.
  `COMMERCE_MODE` démarre à `sandbox`.
- **Bug Windows corrigé** : `spawnSync npx.cmd` échouait en EINVAL depuis le
  correctif de la CVE-2024-27980. Le chemin de migration de production était
  purement inutilisable sur la machine d'Adam. Résolu sans `shell: true`, qui
  aurait rouvert ce que la CVE ferme.
- **Le 503 du point de santé est résolu.** Ce n'était ni l'environnement ni
  des zones non provisionnées — c'était le mock de schéma qui avait onze
  objets de retard sur les migrations 0010, 0011 et 0014. Le worker avait
  raison de fermer.
- **TVA publiée**, téléphone retiré des mentions légales, activité 59.11B
  ajoutée aux bloqueurs. Déployé et vérifié en ligne, version `803b1c8a`.

## État des tests

Lot front rendu : **58 sur 58**, vert pour la première fois.
Lot backend et préproduction : **81 sur 82**.

Le seul rouge restant échoue **par construction** sur une branche Claude : la
liste `allowed_source_branches` de `.openai/preprod-demo-only.json` ne contient
que cinq branches `codex/*`. Ce n'est pas un défaut, et il ne faut pas le
« réparer » en modifiant cette liste.

Une exécution de `npm test` complète tournait en arrière-plan au moment de la
pause. Elle n'a pas été lue. **La relancer à la reprise** plutôt que se fier à
ce qui précède, qui vient d'exécutions par lots.

## À faire à la reprise, dans cet ordre

1. Relancer `npm test` et confirmer les chiffres ci-dessus.
2. Obtenir d'Adam la décision sur le stock — 756 avec la courbe transmise, ou
   un recomptage détaillé par taille.
3. Écrire le manifeste de stock une fois le chiffre tranché, puis le faire
   approuver par Jérémy (`STOCK_MANIFEST_APPROVED_BY` doit valoir `jeremy`).
4. Décider avec Adam s'il provisionne le worker sans route pour installer les
   secrets.
5. Reste à ma charge et non commencé : les alertes de supervision et
   l'exercice de restauration de sauvegarde, deux verrous de la porte.

## Ce qu'il ne faut pas faire

- Ne pas déployer `cloudflare.production.jsonc` sans l'accord de Jérémy.
- Ne pas écrire de secret dans un fichier, y compris un `.env` local.
- Ne pas toucher à `.openai/preprod-demo-only.json` pour faire passer le test.
- Ne pas modifier `db/seed.ts` avant la décision d'Adam sur le stock.

## ADDENDUM — la suite complète a fini, et elle corrige le relais ci-dessus

Lancée en arrière-plan pendant la pause, terminée. **`npm test` sort en code 1.**

### Correction 1 — les chiffres du relais ne décrivent pas la suite

J'ai écrit « 58 sur 58 » et « 81 sur 82 ». Ces nombres restent vrais **pour les
lots concernés, lancés séparément**. Ils ne décrivent pas `npm test`, et il ne
faut pas les présenter comme tels.

`npm test` est une chaîne `&&` : elle s'arrête au premier maillon rouge. Elle
s'est arrêtée à `tests/d1-migrations.test.mjs`. **Tout ce qui suit n'a jamais
été exécuté** : `test:email-data-d1`, `test:fulfillment`, `test:gate-c`,
`test:preprod-demo`, `test:last-mile`, le lot i18n et HTML rendu, et
`test:lot2-policies`.

Autrement dit, aucune exécution de bout en bout n'existe à ce jour. Il faut la
produire avant toute affirmation globale sur l'état des tests.

### Correction 2 — le test de gouvernance de branche a PASSÉ

J'ai affirmé à deux reprises qu'il échoue « par construction » sur une branche
Claude, la liste `allowed_source_branches` ne contenant que des branches
`codex/*`.

**C'est contredit.** `tests/backend-core.test.mjs` se trouve dans le premier
maillon de la chaîne. Il a été exécuté, il est passé, et la chaîne a continué
jusqu'à `test:email-data`. S'il avait échoué, rien après lui n'aurait tourné.

La différence avec mon exécution par lots vingt minutes plus tôt : **l'arbre
était sale à ce moment-là** (modifications de tests non commitées), il est
propre maintenant. C'est la piste, pas la conclusion.

**Ne pas reprendre mon explication « échoue par construction » sans l'avoir
revérifiée.** Elle est probablement fausse.

### Le seul rouge, décrit exactement

```
tests/d1-migrations.test.mjs:351
Wrangler applies the canonical D1 chain 0000 to 0007 on empty and
journaled databases, then replays as a no-op
  AssertionError: actual 'ETIMEDOUT', expected undefined
  durée : 14 952 279 ms, soit 4 h 09
```

Ce qui est **établi** :

- L'échec est un `ETIMEDOUT` de `spawnSync`, plafonné à 60 s par appel dans
  `runWrangler`. Ce n'est pas une assertion métier : le test a gelé.
- La base visée est **locale**, pas distante — la sortie dit `Resource
  location: local`. Aucun lien avec la base de production créée aujourd'hui.
- **Ce n'est pas le bug Windows corrigé ce matin.** Ce test utilise déjà
  `spawnSync(process.execPath, [wranglerCliPath, ...])`, exactement le motif
  vers lequel j'ai fait converger `scripts/production-d1-migrations.mjs`.
- Wrangler démarre ici en **1,3 s à chaud, 8,7 s à froid**, mesuré trois fois.
  Un plafond de 60 s n'est donc pas atteint par une lenteur ordinaire.

Ce qui n'est **pas** établi, et qu'il ne faut pas inventer :

- La cause du gel. Attente sur une entrée interactive sans terminal, accès
  réseau bloqué par le bac à sable, ou pathologie d'entrées-sorties : aucune
  des trois n'est démontrée.
- Si l'échec préexiste à cette séance. **À vérifier en premier**, sur un
  commit antérieur, avant de chercher un coupable dans le travail du jour.

Piste à explorer sans s'y enfermer : `executeD1` lance **un processus wrangler
par commande SQL**, à l'intérieur de boucles. Le volume d'invocations est le
premier suspect de la durée, pas nécessairement du gel lui-même.

### Ce que cela change pour la reprise

Rien sur les trois blocages — stock, secrets, accord de Jérémy. Ils restent
intacts et prioritaires.

Cela ajoute une tâche, à ma charge : obtenir une exécution complète de
`npm test`, et savoir si ce gel préexiste. Tant qu'elle n'existe pas, **aucune
affirmation globale sur l'état des tests ne doit être faite**, ni par moi ni
dans un document remis à Jérémy.
