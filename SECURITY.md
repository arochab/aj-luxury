# Sécurité

Ce dépôt est privé. Ne jamais y ajouter de secret, mot de passe, token, RIB, contrat signé, preuve de messagerie, voix, photo source ou donnée client non nécessaire au code.

## Signaler un problème

Utiliser la fonctionnalité privée **Security > Advisories** du dépôt GitHub. Ne pas ouvrir d'issue publique et ne pas publier de preuve exploitable.

## Données et environnements

- La production est une référence en lecture seule.
- Les bases D1 locales, caches et fichiers `.env` restent exclus de Git.
- Les documents et actifs client sensibles sont conservés dans le coffre GitHub privé séparé.
- Toute clé compromise doit être révoquée avant d'être supprimée d'un historique.

## Dépendances

La CI vérifie le build, les tests, le lint et les vulnérabilités de production. Dependabot propose les mises à jour sans les déployer automatiquement.
