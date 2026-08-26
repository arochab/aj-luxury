# Prompt pour une nouvelle session — nettoyage des branches et des reliquats

Rédigé le 22/08/2026 à la demande d'Adam, à la fin de la session de refonte du
front. Le contenu ci-dessous est à copier tel quel dans une session neuve.

L'inventaire qu'il contient a été **mesuré**, pas estimé, au commit `be6b1d6`
de `claude/front-awwwards-20260817`. Le vérifier à nouveau avant d'agir : la
session de nettoyage n'a pas le droit de croire ce document sur parole.

---

## À copier dans la nouvelle session

Tu interviens sur le dépôt `D:\Adam CHABBI Pro\business-clients\CLIENTS\aj-luxury`.

Ta mission est **le nettoyage**, et rien d'autre. Une session précédente vient de
réécrire tout le front (branche `claude/front-awwwards-20260817`, HEAD `be6b1d6`,
déployée en prévisualisation de test et vérifiée en ligne). Elle a laissé
derrière elle des branches, des worktrees, du code sans importeur et des actifs
morts. Tu les traites. Tu ne redessines rien, tu n'améliores rien au passage, tu
ne touches pas à la production.

### Lis d'abord, dans cet ordre

1. `AGENTS.md` à la racine du dépôt — la section « Gouvernance et légèreté du
   dossier » est ta règle de conduite : **manifeste daté avant toute suppression**,
   suppression bornée au projet, vérification des chemins, contrôle contre les
   livrables et sources protégés.
2. `CLAUDE.md` du dépôt — un dépôt, une branche, un agent. **Codex tient
   `codex/*`, tu n'y écris pas.**
3. `docs/internal/REPRISE-2026-08-21-hero-v7.md` — l'état du front, ce qui est
   vivant et ce qui est mort.
4. `WORKSPACE.md` du workspace — AJ Luxury y est `ACTIVE`, gouverné en remote
   privé, et le workspace ne conserve volontairement qu'un seul clone canonique.

### Les cinq chantiers, par ordre de risque croissant

**1. Code sans importeur — le plus sûr, commence par là.**

Mesuré au `be6b1d6` : quatre composants ne sont importés par aucune page, aucun
autre composant et aucun test.

| Fichier | Importeurs réels |
|---|---|
| `app/components/IntroSequence.tsx` | 0 |
| `app/components/ApollonHorizontalRail.tsx` | 0 |
| `app/components/HeroComposition.tsx` | 1, et c'est `HeroBackgroundVideo` |
| `app/components/HeroBackgroundVideo.tsx` | 2, et ce sont `HeroComposition` et `lib/hero-video.ts` |

Les trois derniers forment un **cycle fermé** : ils ne se référencent qu'entre
eux, plus rien du site vivant n'y entre. `lib/hero-video.ts` appartient au même
îlot. Vérifie ce cycle toi-même avant de conclure — c'est exactement le genre
d'affirmation qu'il ne faut pas reprendre sans la remesurer.

Les modules CSS associés partent avec leurs composants. Vérifie aussi
`app/globals.css` : **28 règles** y portent le préfixe `.aj-film__hero-`, hérité
du premier écran vidéo v6 qui n'existe plus.

**2. Clés de traduction orphelines.**

`common.notFoundTitle` existe dans les quatre dictionnaires de
`lib/i18n/dictionaries/` mais n'est plus lue par aucun composant : la page 404
dessinée utilise `error.notFoundTitle`. Cherche les autres orphelines de la même
façon plutôt que de traiter celle-ci isolément — une clé absente d'un seul
dictionnaire est un défaut plus grave qu'une clé morte, regarde les deux.

**3. Actifs morts qui partent dans le bundle — le gain réel.**

Ceux-là sont servis au navigateur alors que plus rien ne les demande.

- `public/videos/` — **2,6 Mo**, quatre MP4 du premier écran v6 remplacé.
- Affiches v6 dans `public/images/client/` — `hero-v6-*-poster.{webp,avif}`,
  **environ 1,4 Mo**.
- Images v7 dans `public/images/client/` — `hero-v7-*.{webp,avif}`,
  **environ 770 Ko**. Le premier écran actuel est en v8 et ne lit que
  `hero-figures.{avif,webp}`.

**Ne supprime rien avant d'avoir prouvé le non-usage** : `hero-pourpre-model` et
`hero-identity-overlay` sont encore référencés par `app/globals.css`,
`app/notre-histoire/page.tsx` et `lib/products.ts`. La ressemblance de nom ne
vaut pas preuve de mort.

**4. `_design-reference/` — 9 Mo suivis par Git.**

Ce dossier est **dans le dépôt**, pas ignoré. Il contient `hero-v6-sources`
(4,6 Mo) et `hero-v7-sources` (4,4 Mo). Les sources v7 sont les rendus ChatGPT
**qu'Adam a explicitement refusés** le 20/08 — visages déformés, fond kitsch.
Elles ne sont ni un livrable, ni une preuve client, ni un actif retenu.

Elles ne partent pas dans le bundle, donc l'urgence est faible, mais elles
alourdissent tout clone. Propose, ne décide pas seul : ce dossier contient aussi
`claude-design-accueil.html` et `claude-design-plaque.html`, qui sont des
références créatives possiblement encore utiles.

**5. Branches et worktrees — le plus délicat, finis par là.**

Mesuré : **20 branches locales**, **69 branches distantes**, dont **57 `codex/*`**,
5 `dependabot/*`, 3 `claude/*`, plus `migration/*`, `governance/*`, `candidate/*`
et `main`.

Deux worktrees :

- `D:\...\aj-luxury` — le principal, sur `claude/front-awwwards-20260817`.
- `D:\...\aj-luxury-worktrees\sendcloud-controlled-20260817` — sur
  `codex/ajl-sendcloud-controlled-20260817`, **il appartient à Codex**.

Les règles qui t'encadrent ici :

- **Tu ne supprimes aucune branche `codex/*`**, ni locale, ni distante. Elles
  sont la mémoire de travail de l'autre agent. Tu les **inventories** et tu
  présentes à Adam celles qui sont entièrement fusionnées dans `main`, avec leur
  date de dernier commit. La décision lui revient.
- **Tu ne supprimes pas le worktree de Codex.** `WORKSPACE.md` interdit
  explicitement tout prune Git ou suppression manuelle de worktree.
- `.openai/preprod-demo-only.json` contient une liste
  `allowed_source_branches` de cinq branches `codex/*`. Une branche qui y figure
  n'est jamais candidate à la suppression, même fusionnée.
- Les branches `dependabot/*` obsolètes sont le cas le plus simple : si la mise
  à jour est déjà dans `main`, la branche ne sert plus.

### Comment tu travailles

Crée ta propre branche `claude/nettoyage-<date>`. Ne travaille pas sur
`claude/front-awwwards-20260817`, elle porte la candidate de production.

Pour chaque chantier, dans cet ordre, sans exception :

1. **Mesure** — prouve le non-usage par une commande, pas par un raisonnement.
   Une recherche qui ne trouve rien n'est une preuve que si tu as cherché dans
   `app`, `lib`, `tests`, `public`, les CSS et les dictionnaires.
2. **Manifeste** — écris dans `docs/internal/` un fichier daté qui liste chaque
   chemin, son poids, la commande qui prouve son non-usage et le moyen de le
   restaurer. C'est une exigence d'`AGENTS.md`, pas une formalité.
3. **Supprime**, dans un commit **séparé par chantier**, jamais un commit
   fourre-tout.
4. **Vérifie** — `npm run lint`, `npm run build`, `npm test` après chaque
   chantier. Le front doit rester à six lots verts : 121, 24, 12, 1, 1, 59.

### Ce que tu dois savoir sur les tests avant de commencer

Le septième lot, backend et préproduction, porte **6 rouges qui ne sont pas de
ton fait et que tu ne dois pas essayer de réparer** :

- `the real current source branch is governed…` échoue **par construction** sur
  toute branche Claude, puisque `allowed_source_branches` ne liste que des
  branches `codex/*` ;
- les cinq autres forment la famille D1/préproduction qui exige quatre zones
  provisionnées, absentes de l'environnement local.

Si tu en fais passer un, tu as probablement modifié quelque chose que tu ne
devais pas toucher.

### Interdits

- Pas de `git push --force`, pas de réécriture d'historique, pas de
  `git worktree prune`, pas de `git gc --prune`.
- Pas de suppression dans `docs/internal/evidence/` — preuves internes protégées
  par `AGENTS.md`.
- Pas de déploiement. Ni test, ni production. Ton travail se termine par un
  commit et un rapport.
- Pas de nettoyage global par motif ou par extension à l'échelle du workspace.
  Tu restes **dans** `business-clients/CLIENTS/aj-luxury`.

### Ce que tu rends à Adam

Un rapport court : ce qui a été supprimé et pour quel gain mesuré, ce qui est
proposé à sa décision — les branches `codex/*` fusionnées, `_design-reference` —
et ce que tu as délibérément laissé, avec la raison. Le poids du dépôt et celui
du bundle avant et après, mesurés.
