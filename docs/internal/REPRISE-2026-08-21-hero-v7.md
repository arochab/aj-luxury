# Reprise — refonte front, hero v7

Session Claude Code du 21 août 2026. Branche : `claude/front-awwwards-20260817`.
Dernière mise à jour : deuxième pause, à la demande d'Adam.

Ce fichier ne remplace pas `HANDOFF-2026-08-21.md`, qui reste le récit des
cinq chantiers précédents. Il ne couvre que la passe de refonte en cours.

---

# ⚠️ CHANGEMENT DE DIRECTION — À LIRE EN PREMIER

**Décision d'Adam, 21/08, juste avant la pause. Elle prime sur tout ce qui
suit dans ce fichier.**

## Les images ChatGPT sont REFUSÉES

Les deux masters `_design-reference/hero-v7-sources/hero-v7-source-{A,B}-*.png`
et, avant eux, toute la direction « salle de chrome » de la v6 sont **invalides** :

- **les visages sont déformés** — c'est le défaut rédhibitoire, une faute sur
  la personne ;
- **le fond est kitsch** — colonnes, statue, laurier, lyre, socle APOLLO.

Ne pas les réutiliser, ne pas essayer de les rattraper, ne pas en regénérer.

## Le seul master valide

```
public/images/client/campaign-duo-lilas-seated.webp
```

1484x2229, ratio 0,666, portrait. C'est la **vraie photographie de studio**
des deux modèles — celle que le handoff du 21/08 §3 avait identifiée comme
`IMG_5466.JPG`, la prise dont les corps avaient servi au composite chrome.
Fond de studio gris/mauve dégradé, aucun décor.

Elle est déjà dans le dépôt et déjà utilisée par `lib/editorial-moodboard.ts`
et `lib/products.ts` — donc déjà validée client.

## Le concept qui en découle, et pourquoi il est meilleur

Adam avait donné la clé dans son message précédent : « on peut l'intégrer à
une image des deux modèles préexistantes **en fond animé, en isolant
parfaitement leurs silhouettes** ». Avec la vraie photo, ça devient l'évidence :

```
    fond           = MÉTAL LIQUIDE animé, plein cadre, synthétique
    silhouettes    = les deux corps réels, détourés, posés par-dessus
    AJ LUXURY      = entre les deux
```

Trois gains décisifs sur la direction précédente :

1. **Aucun générateur ne touche les personnes.** La garantie d'architecture
   déjà acquise sur la v7 est conservée telle quelle.
2. **Le plafond de résolution disparaît.** Seuls les CORPS viennent de la
   photo ; le fond est du WebGL, donc net à toute taille et à tout DPR. Le
   compromis « 1672x941, 1,72x d'agrandissement » que nous venions d'assumer
   n'a plus lieu d'être.
3. **Le geste du mot-marque derrière les corps devient plus fort**, pas plus
   faible : sur un champ de métal, les lettres ont enfin un fond qui leur
   appartient au lieu d'une architecture chargée.

## L'obstacle réel, mesuré — NE PAS SOUS-ESTIMER

Le détourage par simple séparation chromatique **ne suffit PAS sur cette
photo**, contrairement au composite. Mesures du 21/08 :

| Zone | Chroma moyen |
|---|---|
| Fond de studio, partie éclairée | 17,7 à 19,6 |
| Fond de studio, partie sombre | 3,5 |
| Peau modèle droit | 80,9 |
| Peau modèle gauche | 55,4 |
| Boxer lilas | 46,4 |
| Tissu noir du siège | 29,1 |

Le fond éclairé monte à ~20, il faut donc seuiller haut ; et ce seuil **mange
le modèle de gauche**, plus pâle. Essai fait, aperçu conservé dans
`work/hero-v7/REEL-matte-preview.png` : **des trous dans les deux visages**
(yeux, barbe, joues), cheveux partiellement perdus. Inutilisable en l'état.

**Pistes pour la reprise, par ordre de préférence :**

1. **Modélisation du fond puis soustraction.** Le fond est un dégradé lisse :
   l'estimer (par ajustement polynomial depuis les bords, ou remplissage
   depuis les quatre coins) et soustraire donne une séparation bien plus
   franche qu'un seuil global. C'est la voie la plus propre et la plus
   déterministe.
2. **Un modèle de SEGMENTATION local** (type `rembg`/U²-Net). À noter, et
   c'est ce qui le rend acceptable ici : un modèle de matting **ne redessine
   aucun pixel**, il ne produit qu'un masque. Il ne viole donc pas la
   contrainte d'Adam sur les visages. À vérifier avant install.
3. Chroma + luminance combinés, avec affinage de bord — le repli.

Quelle que soit la voie : **contrôle à 100 % sur les deux visages, les
cheveux, les mains et les ceintures avant de committer un matte.**

## Questions ouvertes pour Adam

1. **Le siège.** Le modèle de gauche est assis sur une caisse recouverte de
   tissu noir. Le retirer le fait flotter. Le garder (socle noir mat sur métal
   liquide, ce qui peut être très beau), le recadrer hors champ, ou le
   remplacer ?
2. **Le cadrage bureau.** Le master est PORTRAIT (0,666). Pour un premier
   écran paysage, les corps seront posés dans un champ de métal plein cadre —
   donc pas de recadrage destructeur, mais la composition bureau reste à
   dessiner.

## Ce qui reste valable de la v7 malgré le changement

L'architecture est intacte et se réutilise telle quelle — seuls les ACTIFS
changent :

- `HeroV7.tsx` / `HeroV7.module.css` : les quatre calques, la caméra et la
  dérive séparées, les trois `immediateRender: false`, le volet, le mouvement
  réduit, les plafonds responsives ;
- `scripts/build_hero_v7_assets.py` : le pipeline est le bon, seuls le master
  d'entrée et la méthode de matte changent ;
- `DeferredMetallicField` : passe simplement de « sol » à « fond plein cadre » ;
- les contrats de test v7 : à réaligner sur les nouveaux noms d'actifs.

**Ne pas supprimer** les actifs v6 ni les masters ChatGPT tant qu'Adam n'a pas
vu la nouvelle version : ils restent le chemin de retour arrière.

---

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
