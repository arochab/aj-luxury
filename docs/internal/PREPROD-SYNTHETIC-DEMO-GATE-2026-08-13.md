# Préproduction synthétique 0008 — gate de sécurité

Statut au 13 août 2026 : **CANDIDAT NON DÉPLOYÉ**.

## Autorisé

- Préproduction privée uniquement, projet `appgprj_6a7d223ffdec8191b360551446150216`.
- Dataset `synthetic-demo`, fixture `aj-demo-v1`, expiration ferme au `2026-09-30T23:59:59.999Z`.
- Quatre destinations fictives verrouillées EU, UK, US et CA, e-mail unique `client@demo.invalid`.
- Prix, stock, livraison, commande et paiement présentés comme simulations non commerciales.

## Interdit

- Production, branche `main`, autre projet Cloudflare, donnée réelle, adresse libre, débit, e-mail réel ou transporteur réel.
- Utilisation de la D1 synthétique comme preuve de stock ou source de lancement.
- Promotion de la migration `0008_preprod_synthetic_demo_dataset.sql` dans la chaîne de migrations de production.

Le build échoue si `APP_ENV` n’est pas exactement `preproduction`, si `PREPROD_TARGET_PROJECT_ID` ne correspond pas au projet ci-dessus, si la CI ne part pas de la branche candidate explicitement autorisée, si `GITHUB_REF_NAME=main` ou si `GITHUB_BASE_REF=main`. Le Worker et les triggers D1 ferment les écritures si la sentinelle est absente, invalide ou expirée.

## Rollback obligatoire avant tout déploiement du candidat

Les artefacts historiques Sites v5/v6 ne sont **pas** des rollbacks sûrs après l’application de 0008 : ils ne comprennent ni la sentinelle ni les fixtures exactes. Aucun déploiement de 0008 ne peut être autorisé tant qu’un artefact de rollback compatible 0008 n’a pas été produit et éprouvé.

Le rollback compatible doit, sur la même D1 déjà migrée en 0008 :

1. soit fermer intégralement Gate C en 404/503 ;
2. soit conserver exactement les mêmes contrôles de sentinelle, d’expiration et de fixtures ;
3. ne jamais accepter une adresse ou un e-mail libres ;
4. être testé par un drill réel sur cette même D1 de préproduction ;
5. avoir un SHA et un artefact immuables documentés avant le go/no-go.

## Séquence sans fenêtre ouverte

1. Produire et éprouver d’abord le rollback compatible 0008.
2. Poser `PREPROD_DEMO_DATASET=aj-demo-v1` sur la préproduction privée.
3. Déployer le candidat sur la D1 encore en 0007 : Gate C reste fermée en 503 car la sentinelle manque.
4. Appliquer ensuite, et seulement ensuite, la migration 0008 sur cette D1 exclusivement préproduction.
5. Exécuter les smoke tests privés du parcours complet et du rollback.

Il est interdit d’appliquer 0008 tant qu’une version historique v5/v6 peut encore servir la D1.

Propriétaire du go/no-go : Adam CHABBI. Aucun silence ou succès de CI ne vaut autorisation de déploiement.
