Tu prends le front d'AJ Luxury. Objectif : Awwwards Site of the Day, seuil jury 9,7/10.

# 1. LIS D'ABORD, EN ENTIER, DANS CET ORDRE

- `docs/internal/BRIEF-CLAUDE-DESIGN-2026-08-17.md` — ton ordre de mission complet : 13 chantiers,
  critères d'acceptation mesurables, gauntlet loop à exécuter, contraintes dures, table de preuves.
  **Lis l'ADDENDUM 2 en fin de document avant tout le reste : il contient la cause racine du P0 et
  il périme les hypothèses de la §3.1.**
- `docs/internal/HANDOFF-2026-08-17.md` — état du projet, décisions ouvertes, ce qu'il ne faut pas toucher.
- `docs/internal/AUDIT-FRONT-JURY-2026-08-17.md` — le raisonnement complet du jury, si tu veux le
  détail derrière un chantier.

# 2. LA PREMIÈRE CHOSE À TRANCHER, AVANT TOUTE LIGNE DE CODE

`.home-shell` est `height: 100svh` + `overflow-y: auto` : **c'est elle qui défile, pas le document.**
ScrollTrigger observe `window` par défaut, donc il ne voit jamais le scroll. C'est pour ça qu'aucune
timeline épinglée n'a jamais progressé. Aggravants sur le même élément : `scroll-snap-type: y mandatory`
et, plus haut, `overflow: hidden` sur `.aj-home`.

Deux chemins exclusifs :
- **A** — le document redevient le scroller : retirer `height: 100svh`, `overflow-y: auto` et
  `scroll-snap-type` de `.home-shell`. C'est l'architecture de tous les sites ScrollTrigger et c'est
  ce que supposent les chantiers C2, C6, C8 et C10.
- **B** — `ScrollTrigger.defaults({ scroller: '.home-shell' })`. Moins invasif, mais le snap
  obligatoire restera en conflit avec chaque scène scrubbée et ScrollSmoother restera inutilisable.

Recommandation du diagnostic : **A**. Écris ton arbitrage, daté, avant de coder.

# 3. LE TERRAIN — TOUT EST SUR GITHUB, NE RECRÉE RIEN

**Dépôt : `arochab/aj-luxury` (privé). Branche : `claude/front-awwwards-20260817`, commit `a0d6c4b`.**
Coupée à `59d595e`. Elle est poussée et complète : les 5 documents ci-dessus, **61 fichiers médias**
(58 images + 4 vidéos hero, aucun Git LFS), et tout le code. Tu n'as rien à chercher ailleurs.

```bash
git clone https://github.com/arochab/aj-luxury.git
cd aj-luxury
git checkout claude/front-awwwards-20260817
npm ci
```

Si tu travailles depuis la machine d'Adam, le clone existe déjà, déjà sur la bonne branche :
`D:\Adam CHABBI Pro\business-clients\CLIENTS\aj-luxury`.

Les actifs de la demande d'Adam :
- caleçons **seuls** → `public/images/editorial/isabelle-apollon/apollon-{rose,lilas,pourpre}-lyre-v1.webp`
- caleçons **portés** → `public/images/client/apollon-world/apollon-{rose,lilas,pourpre}-model-world-v1.webp`

Un hook `post-commit` pousse automatiquement chaque commit (`git config core.hooksPath .githooks`
après un clone neuf). Si tu vois `[github-first] … ECHEC`, ton travail n'existe que sur ton disque :
corrige avant de continuer.

Elle porte déjà une **passe de diagnostic** (réécriture de `ApollonGuidedSequence.tsx`, retrait du
pin concurrent, `overflow-x: clip`, retrait des `scroll-behavior: smooth`). Résultat mesuré :
`.pin-spacer` est passé de 0 à 1. **Tu n'es pas tenu de la garder** — `git revert` si tu préfères
partir nu. C'est une preuve que le terrain répond, pas une base imposée.

# 4. CE QU'ON ATTEND DE TOI

Du **full GSAP**, état de l'art août 2026/2027. Pas du fade-and-rise : une vraie scène épinglée,
scrubbée, chapitrée, qui tient le mobile aussi.

La demande fonctionnelle d'Adam, mot pour mot : **les images IA des caleçons SANS mannequins À CÔTÉ
de celles AVEC mannequins, sur le MÊME fond.** Le fait décisif est dans le brief §4.1 : ce sont deux
prises du **même plateau** — même mur, même sol de marbre, même lyre, même laurier, même arc. Le CSS
actuel fabrique deux fonds artificiels pour les séparer. Ton travail est de laisser voir la plaque.

Variante **A** (`?apollon=world`) est arbitrée sans condition, la B détruit activement le « même
fond » demandé. Détail et interdits techniques en §4.2 et §4.3.

# 5. EXÉCUTE LA GAUNTLET LOOP — NE LA RÉSUME PAS

§6 du brief : 9 agents experts en parallèle, puis les 9 mêmes en testeurs adversariaux, puis le jury
final pondéré Design 40 % / Usability 30 % / Creativity 20 % / Content 10 %. Seuil 9,7. Boucle de
reprise tant que la note est en dessous, trois tours maximum.

La §6.2 liste les critères connus comme inopérants : un testeur qui les laisse passer a échoué.
La §3.2 liste cinq affirmations falsifiées : les reprendre est un échec automatique.

# 6. TU NE DÉPLOIES PAS

Tu écris le code et tu commites. **La mise en ligne Cloudflare est faite par Claude Code**, sur
demande d'Adam. Ne lance ni `wrangler`, ni de build de release.

Pour ton information seulement, la commande utilisée est :
`APP_ENV=preproduction PREPROD_TARGET_PROJECT_ID=appgprj_6a81995167048191b50b37833695f3dc npm run build`
puis `npx wrangler deploy --config cloudflare.awwwards-preview.jsonc`.

# 7. INTERDITS ABSOLUS

- Aucune mise en production. Commerce fermé, rollback R10 v15 live. La preview privée est le seul terrain.
- Aucune écriture sur une branche `codex/*`.
- Aucun nouvel actif créatif : tout ce qui n'est pas déjà dans le dépôt est
  `PROPOSED — ISABELLE NOT YET CONFIRMED`.
- Ne re-rends aucun actif vidéo. C13 documente la découpe des visages, il ne la corrige pas.
- Aucune mesure prise sur la production ne décrit cette branche : la prod est un autre build,
  elle n'a même pas de GSAP.

# 8. LA RÈGLE QUI A COÛTÉ LE PLUS CHER

Treize agents ont manqué un défaut plein écran parce qu'ils regardaient le DOM et pas l'image.
**À chaque chantier livré, regarde le rendu. Une mesure verte n'est pas une preuve visuelle.**
