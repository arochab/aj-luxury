# Reprise — refonte front, hero v7

Session Claude Code du 21 août 2026. Branche : `claude/front-awwwards-20260817`.
Dernière mise à jour : deuxième pause, à la demande d'Adam.

Ce fichier ne remplace pas `HANDOFF-2026-08-21.md`, qui reste le récit des
cinq chantiers précédents. Il ne couvre que la passe de refonte en cours.

---

# Le premier écran — direction v8, LIVRÉE

**Décision d'Adam du 21/08 : les masters ChatGPT sont refusés** — visages
déformés, décor kitsch. Ne jamais les réutiliser ni en regénérer. La v8 est
la réponse, et elle est appliquée.

## Ce que le hero est maintenant

```
    fond    = MÉTAL LIQUIDE, synthétique, calculé au navigateur
    marque  = AJ LUXURY, entre les deux
    figures = LES DEUX CORPS RÉELS, découpés
```

Master unique : `public/images/client/campaign-duo-lilas-seated.webp`
(1484x2229), la vraie prise de studio, déjà au dépôt et déjà validée client.

**La garantie sur les visages est structurelle, pas déclarative.** Un modèle
GÉNÉRATIF redessine les pixels : c'est la cause des visages déformés, pas un
problème de prompt. Un modèle de SEGMENTATION ne produit qu'un canal alpha —
il choisit quels pixels garder, jamais à quoi ils ressemblent. Les corps
servis sont donc, au sens strict, les pixels de la photographie.

Ce contrat est **verrouillé par un test** : `tests/awwwards-experience.test.mjs`
exige que `scripts/build_hero_figures.py` lise le master approuvé et appelle
`only_mask=True`.

## Trois gains

1. **Le plafond de résolution a disparu.** Seuls les corps viennent d'un
   fichier ; le fond est calculé, donc net à toute taille et à tout DPR. Le
   compromis « 1,72x d'agrandissement » de la v7 n'existe plus.
2. **Un seul actif pour toutes les tailles.** Les figures sont un SUJET, pas
   une scène : on ne les recadre pas, on les place. Plus de masters portrait
   et paysage à tenir synchronisés.
3. **Le mot-marque a enfin un fond qui lui appartient.**

## Décisions d'Adam appliquées

- **Le socle noir est CONSERVÉ**, en socle mat sur le métal.
- **La composition paysage est redessinée**, au même niveau que le portrait,
  et non dérivée de lui.

## Ce qui a été trouvé à l'œil et corrigé

- Le champ de métal à pleine intensité lisait « fumée », pas « chrome », et
  disputait le premier plan aux corps ; le contraste du mot variait d'un bout
  à l'autre. Rendu à **42 %** sur le noir de marque : le métal redevient une
  ambiance, l'ouverture redevient sombre.
- L'origine de `transform` au centre poussait le bas de scène sous la
  fenêtre : **pieds rognés de 10 px à 390x844**, interdit par AGENTS.md.
  Origine passée en bas de cadre.
- Sur écran étroit, le mot derrière les corps ne montrait plus que « A »,
  « L » et « RY ». Il passe **au-dessus, en cartouche**, sur le métal sombre.
  Ce n'est pas le bureau rétréci : le geste du bureau y serait illisible.
- À **768x1024**, le plafond fixe de 62svh laissait exactement 135 px pour un
  mot de 135 px. La hauteur des corps est devenue un **reste calculé**
  (écran − barre − 17,9cqi − 190px), borné par la largeur.

## Recette tenue sur cette passe

- **Neuf tailles d'AGENTS.md** : zéro débordement horizontal, zéro pied rogné,
  zéro débordement des corps ou du mot, zéro collision.
- **Mouvement réduit** vérifié sous émulation : volet supprimé, aucune
  échelle, métal figé sans `requestAnimationFrame`, composition complète.
- `lint` OK · `build` OK · `rendered-html` 36/37 · `awwwards` OK ·
  `hero-video` + `motion-lifecycle` 24/24.
- Seul rouge : `synthetic health ... four zones ready` (503 local), **connu et
  préexistant**, périmètre backend.

## Dette assumée, à traiter APRÈS validation d'Adam

Les actifs v6 (4 MP4 + posters) et v7 (8 images) sont **encore dans
`public/`** alors que plus rien ne les sert : ~3,3 Mo de poids mort dans le
déploiement. Ils sont conservés volontairement comme chemin de retour arrière
tant qu'Adam n'a pas validé la v8 à l'écran.

Leur suppression exigera aussi de réécrire `tests/hero-video.test.mjs`, qui
vérifie encore leurs budgets d'octets — c'est pour cela que ce n'est pas fait
dans la même passe.

## Où on en est, en une phrase

**Le premier écran est refait sur la vraie photographie, vérifié et livré.**
Le reste de l'accueil est diagnostiqué mais pas encore repris. Tout est
commité et poussé, zéro écart avec GitHub.

## Ce qui est LIVRÉ et vérifié

### Le hero v7 — la photographie vivante

La vidéo v6 est remplacée par une photographie en calques, animée en
DOM/CSS/GSAP. Le geste central : **le mot AJ LUXURY passe derrière les corps**,
parce que le fond et les corps sont deux calques distincts.

- 173 Ko pour le premier écran de bureau contre 742 Ko pour le seul MP4 v6.
- Ordre des calques : `plate` → `metal` → `marque` → `figures`.
- Réglages relevés au navigateur, jamais estimés : largeur de boîte du mot
  mesurée à 4,72 em d'où `100cqi / 4.77` ; `cqi` et non `vw`, car `100vw`
  inclut la barre de défilement et décentrait le mot de 11 px ; le mot est
  calé SUR la copie et non sur la fenêtre, l'écart mesuré restant constant
  de 900 à 1080 px de haut.

### Le métal liquide — la réponse au problème des visages

Fait validé avec Adam : **un modèle génératif redessine ce qu'on lui donne**,
donc les visages dérivent à chaque passe. Ce n'est pas un problème de prompt.
La solution retenue est de RETIRER LE GÉNÉRATEUR DU CHEMIN.

Les corps sont les pixels approuvés, découpés par séparation chromatique et
reposés par-dessus. Rien ne les redessine. Ce qui bouge est derrière eux : le
sol, là où le métal liquide est physiquement chez lui.

Mesuré au navigateur, 4 s d'écart : sol 62,4 % de pixels animés (écart moyen
9,17 niveaux), torses 8,3 % (0,85), visages 1,5 à 1,8 — ce résidu est la
respiration de la caméra sur tout le plan. Coût nul : médiane 6,1 ms avec le
champ contre 6,1 ms sans, zéro image perdue.

Le champ réutilise `DeferredMetallicField`, déjà écrit pour ce rôle et
inutilisé : montage différé à l'intersection donc hors chemin du LCP, 30 i/s
au plafond, repli CSS sans WebGL, retiré entièrement en mouvement réduit.

### Le colophon de l'accueil

Le bloc de spécifications portait le seul aplat blanc de la page et disait
tailles et composition une troisième fois en 900 px. Refait : 303 → 185 px,
trois faits dits une seule fois, aucun cadre.

### Recette tenue

- Neuf tailles d'AGENTS.md balayées : zéro débordement horizontal partout.
- **Deux fautes trouvées et corrigées** : têtes coupées à 768x1024 (`cover`
  basculait en rognage vertical de 289 px) ; collision mot/copie à 320 px.
- **Trois bugs de mouvement corrigés** : dérive et défilement se disputaient
  `scale` ; les tweens de scroll relevaient leur valeur de départ en pleine
  arrivée, donc le retour en haut de page rendait le premier écran VIDE.
- Mouvement réduit vérifié sous émulation.
- `lint` OK, `build` OK, contrats de test réécrits sur la v7 et renforcés.

## Décisions d'Adam prises pendant la session

1. **Priorité : finir l'accueil** avant la boutique et les fiches produit.
2. **Résolution : on reste en 1672x941.** Le plafond est assumé et documenté,
   aucun upscale génératif sur de vrais visages. Un vrai palier supposerait de
   regénérer les masters en 4K.
3. **Écart signalé, toujours non tranché** : les deux images jointes par Adam
   sont toutes deux en PAYSAGE 1672x941, pas une paire paysage/portrait.
   Hypothèse en vigueur : A pour le bureau, B recadrée en 704x941 pour le
   téléphone. À confirmer.

## Ce qui reste ouvert — l'accueil, écrans 2 à 6

Un jury hostile a inspecté les 27 captures de l'accueil (14 en 1440, 13 en
390). Défauts retenus après vérification :

| Zone | Défaut | Gravité |
|---|---|---|
| Séquence Apollon | panneau de copie sur un voile aux bords flous | majeur |
| Séquence Apollon | colonne de gauche vide au-dessus du bloc de texte | majeur |
| Clôture | retrait à x=163 quand tout le site part à x=57 ; 220 px de noir vide sous les liens | majeur |
| Éditorial | légendes « Jérémy / Alex » dans le style des libellés de navigation | mineur |
| Toute la page | huit appels à l'action, dont « Découvrir » quatre fois | mineur |
| Pied de page | « Reveal Your Inner Beauty » répété depuis le hero | mineur |
| Téléphone | séquence Apollon = version rétrécie du bureau, photo à 275 px | majeur |

**Deux faux positifs écartés après vérification, ne pas les rouvrir :**

- « portrait sans visage » sur l'écran matière : c'est un **détail produit
  volontaire** (ceinture, plaque logo), photographie client approuvée ;
- « neuf écrans quasi identiques » dans la séquence : la durée est **mesurée
  contre le site étalon** et documentée dans `ApollonGuidedSequence.tsx`
  (sections d'observation d'objet de 4 à 13,25 écrans). Raccourcir
  recréerait le défaut corrigé le 21/08, où le lecteur traversait la
  révélation sans jamais s'y arrêter.

Le voile de la copie de séquence est lui aussi **déjà argumenté et mesuré**
(contraste plancher 7,78:1, fondu sur deux axes pour ne pas redevenir un
rectangle). Ne pas le refaire sans arbitrage d'Adam : c'est un désaccord de
goût contre une décision documentée.

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
