# Reprise — refonte front, hero v7

Session Claude Code du 21 août 2026. Branche : `claude/front-awwwards-20260817`.
Dernière mise à jour : deuxième pause, à la demande d'Adam.

Ce fichier ne remplace pas `HANDOFF-2026-08-21.md`, qui reste le récit des
cinq chantiers précédents. Il ne couvre que la passe de refonte en cours.

## Où on en est, en une phrase

**Le premier écran est refait, vérifié et livré.** Le reste de l'accueil est
diagnostiqué mais pas encore repris. Tout est commité et poussé, zéro écart
avec GitHub.

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
