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
