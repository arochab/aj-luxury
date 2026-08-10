# AJ Luxury — handoff de release Hero V4

**Statut : CANDIDAT TEST FIGÉ — PRODUCTION BLOQUÉE**

**Date : 10 août 2026**

**Owner de release : Adam CHABBI**

## Candidat immuable

- Branche : `candidate/hero-v4-2026-08-10`
- Git SHA : `c7362d3d04af6fc6070a15112a1fdff7878e09bd`
- Marqueur runtime attendu : `data-hero-version="video-v4"`
- Namespace HTML : `2026-08-10-hero-v4`
- Version Sites candidate : `PENDING — aucune version sauvegardée`
- Environnement de test distant : `PENDING — aucun déploiement distant`

Le commit contient uniquement le code Hero V4, ses tests, les quatre MP4, les huit
posters, le namespace de cache et la correction transitive `nanoid 3.3.18`.
Les documents, preuves, captures, vocaux, inputs et fichiers internes ne font pas
partie du paquet applicatif.

## Recette liée au SHA

- Worktree propre détaché sur le SHA exact : oui.
- `npm ci` depuis le lockfile : réussi.
- Lint : réussi.
- Build : réussi.
- Tests automatisés : 75/75 réussis.
- `npm audit --omit=dev` : 0 vulnérabilité connue.
- Médias V4 : quatre MP4 progressifs et huit posters présents.
- Fuite de preuves, secrets ou données internes dans `dist` : aucune détectée.
- Production, domaine et DNS modifiés par cette recette : non.

## Approbations

| Gate | Statut | Preuve |
|---|---|---|
| Validation visuelle préalable Adam | REÇUE le 10 août 2026 | Adam : « je vois ton taffe il est bien » ; cette validation précède le SHA final et ne remplace pas la validation du couple SHA/version Sites |
| Droits d’exploitation du master Isabelle | DÉCLARÉS OK PAR ADAM le 10 août 2026 ; preuve directe à relier | Adam a confirmé « droits OK ». La confirmation directe d’Isabelle doit encore être conservée selon la gouvernance du workspace |
| Validation Adam du SHA + version Sites | PENDING | À lier explicitement au SHA et à la version Sites candidate |
| Validation visuelle préalable Jérémy | REÇUE, rapportée par Adam le 10 août 2026 | Jérémy a validé le rendu ; cette validation doit encore être rattachée au lien de préproduction, au SHA et à la version Sites exacts |
| Validation Jérémy du même SHA + version Sites | PENDING | Confirmation finale sur le candidat identifié, après publication en préproduction |
| Autorisation de production par Adam | REÇUE le 10 août 2026 | Adam : « Production : Go ». La promotion reste conditionnée aux gates de preuve et à la validation du candidat exact par Jérémy |
| Promotion effective | BLOQUÉE | Relier les droits directs, la préproduction, le SHA/version Sites et la validation exacte de Jérémy avant déploiement |

## Compatibilité et nettoyage V3

Les médias Hero V3 restent temporairement dans le paquet de cette release, sans
aucune référence runtime. Ils n’ajoutent aucune requête ni aucun octet au parcours
V4, mais protègent les clients qui recevraient encore un HTML V3 pendant la fenêtre
`stale-while-revalidate` de 24 heures. Leur retrait est une release de nettoyage
séparée, après expiration de cette fenêtre et vérification des caches. Cette
décision privilégie l’absence de régression à une réduction immédiate de la taille
du paquet de déploiement.

## Rollback préparé

- Version Sites actuellement en production : `30`.
- Git SHA de rollback : `65fedb4393a91d5428459f7baed84a6ff0bd4e11`.
- Méthode : redéployer directement la version Sites 30, sans rebuild et sans DNS.

## Prochaine porte

1. conserver la confirmation directe des droits du master ;
2. publier le SHA exact dans un environnement de test réellement séparé ;
3. sauvegarder une version Sites liée au SHA sans la promouvoir ;
4. faire valider le même candidat par Adam puis Jérémy ;
5. seulement ensuite promouvoir, exécuter les smoke tests et conserver le rollback.
