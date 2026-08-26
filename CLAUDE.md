@AGENTS.md

# Claude Code | Pont vers l'autorité du projet

Claude Code ne lit pas `AGENTS.md` nativement. L'import ci-dessus le charge.
`AGENTS.md` reste la source unique des standards d'implémentation AJ Luxury ;
ce fichier ne recopie aucune de ses règles et n'ajoute que la discipline propre
à Claude Code.

## Branches

Un dépôt, une branche, un agent à un instant donné. Claude Code tient `claude/*`
et `main`, Codex tient `codex/*`. Avant toute écriture : `git branch --show-current`,
`git status`, `git log --oneline -15`. Si la branche est `codex/*`, ne pas écrire.

Les worktrees se créent sous `D:` uniquement. Un enregistrement mixte
`C:\...\Desktop\` / `D:\` fait diverger Git alors que les jonctions NTFS pointent
sur les mêmes octets.

## Sauvegarde

Règle GitHub-first : `docs/internal/GITHUB-FIRST.md`. Activer le hook sur tout
clone avec `git config core.hooksPath .githooks`.
