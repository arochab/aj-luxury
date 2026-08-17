Tu prends le front d'AJ Luxury, marque française de sous-vêtements masculins premium.
Objectif : **Awwwards Site of the Day**. Seuil d'acceptation du jury interne : **9,7/10**,
pondération Design 40 % · Usability 30 % · Creativity 20 % · Content 10 %.
Note actuelle mesurée : **3,2/10**. Ce n'est pas une estimation, c'est un audit instrumenté.

## 0. LE TERRAIN

**Dépôt : `arochab/aj-luxury` (privé) · Branche : `claude/front-awwwards-20260817`**

```bash
git clone https://github.com/arochab/aj-luxury.git
cd aj-luxury
git checkout claude/front-awwwards-20260817
npm ci
git config core.hooksPath .githooks
```

Si tu tournes sur la machine d'Adam, le clone existe déjà, déjà sur la bonne branche :
`D:\Adam CHABBI Pro\business-clients\CLIENTS\aj-luxury`

**Si tu n'as accès ni au dépôt ni au disque, arrête-toi immédiatement et dis-le.** Ne travaille pas
de mémoire, ne devine aucun fichier, n'invente aucun chemin. Tout ce qui suit suppose que tu lis le
code réel.

## 1. LIS AVANT D'ÉCRIRE — DANS CET ORDRE

1. `docs/internal/BRIEF-CLAUDE-DESIGN-2026-08-17.md` — ton ordre de mission complet : 13 chantiers
   chiffrés, critères d'acceptation exécutables, table de preuves, hors-périmètre justifié.
   **Commence par son ADDENDUM 2 : il contient la cause racine et il périme la §3.1.**
2. `docs/internal/HANDOFF-2026-08-17.md` — état, décisions ouvertes, ce qu'il ne faut pas toucher.
3. `docs/internal/AUDIT-FRONT-JURY-2026-08-17.md` — le raisonnement du jury, à consulter au besoin.

## 2. LA CAUSE RACINE — À TRANCHER AVANT TOUTE LIGNE DE CODE

`.home-shell` est `height: 100svh` + `overflow-y: auto` : **c'est elle qui défile, pas le document.**
ScrollTrigger observe `window` par défaut, donc il ne voit jamais le scroll. Aucune timeline épinglée
n'a jamais progressé sur ce site — ni l'ancienne, ni la mienne. Aggravants sur le même élément :
`scroll-snap-type: y mandatory` (se bat frontalement avec un pin scrubbé) et, plus haut,
`overflow: hidden` sur `.aj-home`.

Deux chemins **exclusifs** :
- **A** — le document redevient le scroller : retirer `height: 100svh`, `overflow-y: auto` et
  `scroll-snap-type` de `.home-shell`. Architecture standard ScrollTrigger, supposée par les
  chantiers C2, C6, C8 et C10.
- **B** — `ScrollTrigger.defaults({ scroller: '.home-shell' })`. Moins invasif, mais le snap
  obligatoire restera en conflit et ScrollSmoother restera inutilisable.

**Recommandation : A.** Écris ton arbitrage, daté, avant de coder. Tant que ce point n'est pas
tranché, aucun scrub ne bougera quel que soit le code écrit par-dessus.

## 3. CE QU'ADAM DEMANDE, MOT POUR MOT

**Les images IA des caleçons SANS mannequins À CÔTÉ de celles AVEC mannequins, sur le MÊME fond.**

Le fait décisif, vérifié en ouvrant les fichiers : ce sont **deux prises du même plateau** — même mur,
même sol de marbre, même lyre, même laurier, même arc, même carquois. Ratios identiques (0,6667).
Le CSS actuel fabrique deux fonds artificiels pour les séparer. Ton travail est de laisser voir la plaque.

- caleçons **seuls** → `public/images/editorial/isabelle-apollon/apollon-{rose,lilas,pourpre}-lyre-v1.webp`
- caleçons **portés** → `public/images/client/apollon-world/apollon-{rose,lilas,pourpre}-model-world-v1.webp`

La variante **A** (`?apollon=world`) est arbitrée sans condition : la variante B supprime tous les
props du mannequin et détruit donc activement le « même fond » demandé. Interdits techniques précis
en §4.3 du brief — notamment : **une seule échelle** pour les deux panneaux (deux `object-fit: cover`
indépendants font apparaître la lyre partagée ~2,2× plus grande à droite), et **pas de `clip-path`
comme propriété compositable** (Chromium ne composite que `transform`, `opacity`, `filter`,
`backdrop-filter`).

## 4. LE NIVEAU ATTENDU

Du **full GSAP**, état de l'art août 2026/2027 : scène épinglée, scrubbée, chapitrée, qui tient aussi
sur mobile. Pas du fade-and-rise. Aujourd'hui le site charge 46 Ko de GSAP + ScrollTrigger pour un
`opacity .72 → 1` sur 12 px — c'est un réglage par défaut de thème, pas une intention.

**Ton budget va au Design (40 %) et à la Creativity (20 %).** Six audits antérieurs ont dépensé ~70 %
de leur effort sur Usability et Content, soit 40 % de la pondération : les exécuter intégralement
amènerait ce site autour de 5,5, jamais à 9,7. Ne rééquilibre pas le plan.

## 5. EXÉCUTE LA GAUNTLET LOOP — NE LA RÉSUME PAS

§6 du brief : **9 agents experts mondiaux en parallèle** (motion GSAP, direction artistique,
retouche/compositing, typographie, UX scrollytelling, front mobile, marque premium, perf/a11y,
qualité/harnais), puis **les 9 mêmes en testeurs adversariaux**, puis le **jury final** qui note à la
pondération Awwwards. **Seuil 9,7.** Boucle de reprise tant que la note est en dessous, trois tours
maximum, puis remontée à Adam.

Deux règles qui font échouer d'office :
- La §3.2 liste **cinq affirmations falsifiées** — les reprendre est un échec automatique.
- La §6.2 liste **huit critères connus comme inopérants** — un testeur qui les laisse passer a échoué.

Le jury ne peut pas gonfler une note pour atteindre le seuil. « Le plan passe, le site reste à
démontrer » est une issue valide et doit être écrite telle quelle.

## 6. INTERDITS ABSOLUS

- **Aucune mise en production.** Commerce fermé, rollback R10 v15 live. La preview Cloudflare privée
  est le seul terrain.
- **Aucune écriture sur une branche `codex/*`.** Un repo, une branche, un agent.
- **Aucun nouvel actif créatif.** Tout ce qui n'est pas déjà dans le dépôt est
  `PROPOSED — ISABELLE NOT YET CONFIRMED`. Ne re-rends aucune vidéo, n'en commande aucune.
- **Aucune mesure prise sur `ajluxurystore.com` ne décrit cette branche** : la production est un
  autre build, elle n'a même pas de GSAP. Ta ligne de base se prend sur la preview, datée.
- **Tu ne déploies pas.** Tu écris le code et tu commites ; la mise en ligne Cloudflare est faite par
  Claude Code sur demande d'Adam. Ne lance ni `wrangler`, ni build de release.

## 7. L'ÉTAT DE LA BRANCHE

Elle porte une **passe de diagnostic** écrite par Claude Code avant qu'Adam ne recadre les rôles :
réécriture de `ApollonGuidedSequence.tsx` en timeline épinglée unique, retrait du pin concurrent dans
`HomeGsapExperience.tsx`, `overflow-x: clip` sur `.aj-home`, retrait des deux `scroll-behavior: smooth`,
suppression des surcharges mobiles mortes. Résultat mesuré : `.pin-spacer` est passé de **0 à 1**.

**Tu n'es pas tenu de la garder.** `git revert` si tu préfères partir nu. C'est une preuve que le
terrain répond, pas une base imposée.

## 8. LA RÈGLE QUI A COÛTÉ LE PLUS CHER

Treize agents ont manqué un défaut plein écran — une découpe de visages ratée dans la vidéo du hero —
parce qu'ils regardaient le DOM, le CSS calculé et les timings. Personne n'a regardé l'image.
Adam l'a vu en trois secondes.

**À chaque chantier livré, regarde le rendu. Une mesure verte n'est pas une preuve visuelle.**

## 9. FORME DE CHAQUE LIVRABLE

Pour chaque chantier, dans cet ordre : **(a)** le diff · **(b)** la commande exacte qui prouve le
critère · **(c)** sa sortie brute · **(d)** la capture avant/après quand le critère est visuel ·
**(e)** le statut `ATTEINT` / `PARTIEL, delta = X points` / `BLOQUÉ, blocage = …, décideur = …`.

Un critère non prouvé compte comme non atteint. Un critère prouvé sur la production compte comme non
atteint. Un critère dont le chiffre de départ est faux te coûte le chantier entier.

**Commence par lire le brief en entier, puis écris ton arbitrage du scroller. Rien d'autre avant ça.**
