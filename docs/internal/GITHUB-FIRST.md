# Règle GitHub-first — AJ Luxury

Statut : `ACTIVE` depuis le 2026-08-17. Décidée par Adam CHABBI.

## La règle

> **GitHub est la source de vérité. Le clone local sur le Toshiba est une copie de travail jetable.
> Rien ne doit exister uniquement en local.**

Concrètement : tout commit part sur `origin` dans la seconde. Si on perd le disque externe,
on ne perd rien d'autre que du temps de `npm ci`.

## Pourquoi cette règle existe

Le 2026-08-17, un audit a établi que **14 branches locales n'avaient jamais été poussées**.
Elles portaient jusqu'à 85 commits d'avance sur `main` : l'intégralité du travail last-mile
(Stripe, Sendcloud, ops, service points) du 14 au 16 août, et la passe visuelle Awwwards du 17.

Ce travail n'existait qu'à un seul endroit : un disque externe USB.

Aggravant : deux messages de fin de session affirmaient que les commits `209b6f3` puis `59d595e`
étaient « sauvegardés sur GitHub ». Ils étaient locaux. **Une affirmation d'agent ne vaut pas une
vérification.** D'où l'automatisation ci-dessous, qui ne demande la confiance de personne.

## Activation

Le hook est versionné dans le dépôt. Après chaque `git clone`, une seule commande :

```bash
git config core.hooksPath .githooks
```

Vérifier que c'est actif :

```bash
git config --get core.hooksPath
```

Doit répondre `.githooks`.

Sous Windows, Git Bash exécute le hook sans réglage supplémentaire ; le bit exécutable n'est pas requis.

## Ce que fait le hook

`.githooks/post-commit` pousse la branche courante vers `origin` après chaque commit, en créant
l'upstream si besoin. En cas d'échec — réseau coupé, disque débranché, remote injoignable — il
**affiche un avertissement explicite** plutôt que d'échouer silencieusement :

```
[github-first] ⚠  Ce commit n'existe QUE sur ce disque.
[github-first]    Corrige et relance :  git push -u origin <branche>
```

Le hook ne bloque jamais un commit. Il ne réécrit jamais l'historique. Il ne pousse jamais autre
chose que la branche courante. Il ne touche jamais `main` sauf si `main` est la branche courante.

## Contrôle manuel — à lancer avant toute suppression locale

La commande qui répond à la question « est-ce que quelque chose n'existe que sur ce disque ? » :

```bash
git fetch --all --prune && for b in $(git branch --format='%(refname:short)'); do L=$(git rev-parse "$b"); R=$(git ls-remote origin "refs/heads/$b" | cut -f1); if [ "$L" = "$R" ] && [ -n "$R" ]; then echo "OK       $b"; else echo "LOCAL    $b  ($L)"; fi; done
```

Toute ligne `LOCAL` est un travail en danger. **Aucune suppression locale n'est autorisée tant
qu'il reste une ligne `LOCAL`.**

## Ce que la règle ne dit pas

Elle ne dit pas de supprimer le clone local. Développer, builder et tester exige une copie locale :
`npm ci`, `npm run build`, `npm test` et Wrangler travaillent sur des fichiers réels. Ce qui est
interdit, c'est qu'un **état unique** vive en local.

Elle ne remplace pas le coffre. Les actifs lourds — médias sources, archives client, bundles —
restent dans `arochab/aj-luxury-private-vault`, pas dans le dépôt de code.

## Corollaires de gouvernance

1. **Les worktrees se créent sous `D:` uniquement.** Un enregistrement mixte
   `C:\...\Desktop\` / `D:\` a été purgé le 2026-08-17 : les jonctions NTFS pointent sur les mêmes
   octets, mais Git traite les deux chemins comme distincts et `git worktree list` devient illisible.
2. **Un worktree est temporaire.** Il se supprime dès la branche poussée : `git worktree remove`.
   35 worktreees accumulés en cinq jours ont produit environ 4 Go de `node_modules` redondants.
3. **Pas d'artefact de build conservé en local.** Un `.tar.xz` se régénère par
   `git checkout <sha> && npm ci && npm run build`. Seules les **preuves** — captures, logs de gate,
   mesures — méritent l'archivage, parce qu'elles ne se régénèrent pas.
4. **La release du coffre doit être publiée, pas laissée en Draft.** Au 2026-08-17,
   `local-migration-2026-08-11` est encore un brouillon : ce n'est pas un stockage durable.

## Rappel d'exclusion mutuelle

Codex tient les branches `codex/*`. Claude Code tient `claude/*` et `main`.
Avant toute écriture : `git branch --show-current`. Si la branche est `codex/*`, ne pas écrire —
créer sa propre branche. Un repo, une branche, un agent, à un instant donné.
