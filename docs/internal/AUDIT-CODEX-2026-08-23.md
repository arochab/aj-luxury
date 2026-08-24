# Demande d'audit à Codex — front AJ Luxury

Ouvert le 23/08/2026 à la demande d'Adam. **Le client n'a pas été convaincu par
le résultat.** Cet audit doit dire pourquoi, sans ménager le travail fait.

## Cadre de l'audit

| | |
|---|---|
| Dépôt | `business-clients/CLIENTS/aj-luxury` |
| Branche à auditer | `claude/front-awwwards-20260817` |
| SHA gelé | `8f23d21` |
| Prévisualisation en ligne | `https://aj-luxury-awwwards-branch-preview.adam-chabbi94.workers.dev` |
| Version déployée | `3b44516d` |
| Périmètre | 68 commits, 580 fichiers, +5678 / -1309 |
| Dernier commit d'avant session | `a900f25` du 20/08 |

**Règle d'exclusion mutuelle.** Cette branche est à moi. Pour auditer, lire
sans écrire, ou créer une branche `codex/audit-front-20260823`. Ne pas écrire
sur `claude/front-awwwards-20260817`.

Pour comparer avant et après :
`git diff a900f25 8f23d21 -- app lib worker tests`

## Ce qui est demandé

Trois angles, dans cet ordre d'importance.

**1. Visuel et défilement.** C'est là que le client a décroché. Le premier
écran doit être jugé comme une pièce de design, pas comme une liste de
fonctionnalités qui marchent. La question n'est pas « est-ce que ça
fonctionne » mais « est-ce que ça vaut une marque premium ».

**2. Code.** Qualité, cohérence, dette introduite, contrats de test qui
verrouillent des choses fausses ou qui ont été affaiblis plutôt que renforcés.

**3. Ce qui a été promis et non tenu.** Comparer ce que les messages de commit
affirment à ce qui est réellement à l'écran.

## Ce que j'ai livré, honnêtement résumé

### Le premier écran, réécrit plusieurs fois

État actuel : une photographie de studio **détourée** (deux corps, fond retiré)
posée sur un **champ de métal liquide calculé en WebGL par lancer de rayons**,
avec le mot-marque AJ LUXURY intercalé entre les deux plans.

Deux gestes de motion :

- **À l'arrivée**, le nom est dévoilé de gauche à droite par une lame de
  lumière (`clip-path`), synchronisée avec la brillance qui traverse le métal.
- **Au défilement**, le même nom rétrécit et va se poser exactement sur le logo
  de la barre, puis les deux marques se relaient.

### Le reste du front

404 dessinée, menu mobile animé, revers des cartes boutique, séquence Apollon,
mentions légales sourcées, prix qualifié, page Notre histoire.

### Infrastructure

Base D1 de production créée et migrée (45 tables), `cloudflare.production.jsonc`
écrit mais **non déployé** faute de l'accord de Jérémy.

## Défauts connus, que je n'ai pas su corriger

À vérifier en priorité : ce sont mes échecs, pas mes réussites.

**Le métal n'atteint pas la référence fournie par Adam.** Il fournit une image
de chrome liquide en rendu 3D. Le mien est un lancer de rayons temps réel qui
reste plus doux et moins contrasté. Cinq directions tentées, trois annulées
pour régression. Voir `REPRISE-2026-08-21-hero-v7.md`.

**Coût du lancer de rayons : 44 images par seconde** sur le premier écran,
contre 130 avant son introduction. Le canevas est plafonné à 30, donc c'est
tenable, mais c'est une dette réelle sur machine modeste. À mesurer sur un
appareil bas de gamme, ce que je n'ai pas pu faire.

**Le détourage des cheveux.** Quatre tentatives, quatre rejets chiffrés. Le
modèle `birefnet-general-lite` s'est révélé meilleur que le `birefnet-portrait`,
y compris à pleine résolution par bandes recousues sans couture visible.
Conclusion : le plafond vient de la prise de vue, fond violet gris trop proche
de la peau. Brief de tournage écrit dans `docs/BRIEF-PRISE-DE-VUE-CAMPAGNE.md`.

**Résolution.** La photographie source fait 1484 x 2229. Aucun affichage haute
densité correct n'est possible. Ce n'est ni la compression ni l'encodage :
mesuré, le JPEG six fois plus lourd n'est que 1 % plus fin.

## Pièges de mesure rencontrés, à ne pas répéter

Chacun m'a fait conclure faux au moins une fois.

**Le navigateur de test se dégrade.** Après une longue session Playwright, il
tombe à 1 image par seconde et rend des captures noires. J'en ai déduit un
défaut de déploiement qui n'existait pas. Avant de conclure à un problème de
performance, redémarrer le navigateur et re-mesurer.

**Comparer deux captures du métal ne veut rien dire.** Il est animé : deux
captures ne montrent jamais la même phase. Toute métrique de bruit ou de
contraste comparée entre deux captures est fausse. Comparer à phase égale, ou
juger à l'œil.

**La latence de l'outil de capture dépasse la durée de l'arrivée.** Aucune
capture ne peut montrer un temps intermédiaire de la séquence d'entrée, qui
dure 3 secondes. Juger la partition en lisant les temps de départ et les durées
dans `Hero.tsx`, ou figer un état à la main via `browser_evaluate`.

**Le site refuse d'être mis en iframe** (`X-Frame-Options: DENY`). Une sonde
par iframe renvoie 42 erreurs console qui ne sont pas des défauts du site.

**`readPixels` sur le canevas renvoie du vide** : le contexte n'a pas
`preserveDrawingBuffer`. Mesurer la luminance sur la capture PNG.

## État des tests

Six lots front verts, 75 tests. Le lot backend porte des rouges qui
**préexistent à cette session**, établi par diff : aucun fichier modifié sous
`lib/commerce`, `db` ou `drizzle`, et `worker/index.ts` n'a changé que d'une
ligne, une chaîne de version de cache.

⚠ `npm test` est une chaîne `&&` : elle s'arrête à `tests/d1-migrations.test.mjs`
et tout ce qui suit ne tourne pas. Ce test **gèle 4 heures** puis expire, parce
qu'un `wrangler d1 execute --local` coûte 4 à 6 secondes sur cette machine et
que le test en lance un par instruction SQL. Lancer les lots séparément.

## Ce qu'il ne faut pas toucher

- La production. Jamais. Elle exige la validation d'Adam **puis** de Jérémy.
- `cloudflare.production.jsonc` : écrit, non déployé, et c'est voulu.
- `.openai/preprod-demo-only.json`. Un test échoue par construction sur une
  branche Claude parce que cette liste ne contient que des branches `codex/*`.
  Ce n'est pas un défaut à réparer.
- Les preuves sous `docs/internal/evidence/`.
- Le stock. **756 unités** sont déclarées dans `db/seed.ts` avec une courbe
  transmise par le client, verrouillée par quatre fichiers de tests. Adam a
  annoncé 730 en cours de session ; l'écart n'est **pas tranché**. Ne rien
  modifier avant sa décision.

## Ce qui reste ouvert côté client

TVA, téléphone public, activité déclarée (le registre indique production de
films, 59.11B, pas vente de vêtements), médiateur conventionné, adresse de
retour, clés Stripe et Sendcloud, manifeste de stock signé, accord de Jérémy.

Aucun de ces points n'est technique et aucun ne dépend d'un agent.

## Format de réponse attendu

Un verdict par angle, avec pour chaque défaut : le chemin, la preuve, la
gravité, et si c'est réparable ou structurel. Les désaccords de fond avec mes
choix sont utiles — c'est précisément ce qu'Adam demande.

Règle d'anti-boucle en vigueur : deux allers-retours maximum entre Codex et
moi. Au troisième désaccord, les deux positions remontent à Adam.
