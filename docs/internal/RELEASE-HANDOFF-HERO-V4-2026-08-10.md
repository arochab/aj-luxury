# AJ Luxury — handoff de release Hero V4

**Statut : VERSION SITES 31 DÉPLOYÉE SUR LE `.COM` — SMOKE TESTS PUBLICS PASSÉS**

**Date : 10 août 2026**

**Owner de release : Adam CHABBI**

## Candidat immuable

- Branche : `candidate/hero-v4-2026-08-10`
- Git SHA : `c7362d3d04af6fc6070a15112a1fdff7878e09bd`
- Marqueur runtime attendu : `data-hero-version="video-v4"`
- Namespace HTML : `2026-08-10-hero-v4`
- Version Sites candidate : `31`
- ID Sites : `appgprj_6a63835f347c819187cdbb7ee16641cc~appgver_28d7afa13ecc819184dc47835566c75f`
- Source Sites : SHA `c7362d3d04af6fc6070a15112a1fdff7878e09bd`
- Archive Sites : 34 580 052 octets avant ingestion ; SHA-256
  `86e84588914fe655e5d21f3b4d0a19b8b9f8421d0fd8270f4f1e4c9ce837705b`
- État : version `31` déployée sur le `.com` le 11 août 2026 ; version `30` conservée comme rollback immédiat

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

## Promotion et contrôles publics

- Déploiement Sites : `appgdep_6a7b130d5e3481919d467d17e8ba6760`.
- Statut final : `succeeded` le 11 août 2026.
- URL publique canonique : `https://ajluxurystore.com`.
- Le `.com` et `www.ajluxurystore.com` répondent en `200` avec le marqueur
  `data-hero-version="video-v4"` et sans marqueur V3.
- Les quatre MP4 V4 acceptent `Range: bytes=0-1023` et répondent en `206`,
  `Accept-Ranges: bytes`, avec exactement 1 024 octets.
- Posters et dictionnaire i18n : `200`, type MIME exact, `nosniff`, cache public
  immuable d’un an.
- Chemins de revue et preuve interne sondés : non exposés (`404`).
- Navigateur desktop : aucune image cassée, aucun débordement horizontal, aucune
  erreur console ; lecture initiale, fin de lecture et reprise manuelle vérifiées.
- Contrôle indépendant : PASS sans recommandation de rollback ; rendus `390 × 844`
  et `1600 × 900` propres, bonne variante portrait/desktop, 18/18 ressources image
  accessibles, aucune erreur ni avertissement console.
- Mesure HTTP indicative sur connexions neuves : médiane HTML TTFB ≈ 1,77 s et
  total ≈ 1,83 s. Aucun score Lighthouse ni Core Web Vital n’est revendiqué en
  l’absence du traceur DevTools configuré.
- Observation non bloquante : la réponse HTML publique n’expose pas de
  `Cache-Control`. Ce comportement préexistait à Hero V4 et n’est pas un motif de
  rollback ; il reste inscrit au backlog performance.
- Le `.fr` n’est pas inclus dans cette promotion applicative : il reste à convertir
  en redirection HTTPS permanente vers le `.com` dès que la délégation Hostinger
  du domaine/DNS est accordée.

## Approbations

| Gate | Statut | Preuve |
|---|---|---|
| Validation visuelle préalable Adam | REÇUE le 10 août 2026 | Adam : « je vois ton taffe il est bien » ; cette validation précède le SHA final et ne remplace pas la validation du couple SHA/version Sites |
| Autorisation d’usage du master Isabelle sur le site AJ Luxury | REÇUE ET ARCHIVÉE le 11 août 2026 | Confirmation écrite directe d’Isabelle Carde autorisant l’usage de sa vidéo générée avec Seedance 2.0 pour le site AJ Luxury par Adam Chabbi. Cette preuve documente précisément cet usage ; elle n’est pas présentée comme une cession générale de propriété intellectuelle. Preuve interne : `docs/internal/evidence/2026-08-11-isabelle-hero-v4-commercial-rights.png` ; 115 651 octets ; SHA-256 `57DBD8CD7EB7096C54C52CE54AD226235358901406AC6541CB03E91CC23BCA9E` |
| Validation Adam du SHA + version Sites | REÇUE le 11 août 2026 | Adam demande explicitement la mise en production de l’actif V4 ; la version 31 est l’archive sauvegardée du SHA exact `c7362d3` |
| Validation visuelle préalable Jérémy | REÇUE, rapportée par Adam le 10 août 2026 | Jérémy a validé le rendu ; cette validation doit encore être rattachée au lien de préproduction, au SHA et à la version Sites exacts |
| Validation Jérémy du même SHA + version Sites | REÇUE, RAPPORTÉE PAR ADAM le 11 août 2026 | Adam confirme que Jérémy est OK pour publier cet actif ; la version 31 matérialise sans modification le même SHA V4 |
| Autorisation de production par Adam | REÇUE le 10 août 2026 | Adam : « Production : Go ». La promotion reste conditionnée aux gates de preuve et à la validation du candidat exact par Jérémy |
| Promotion effective | EXÉCUTÉE le 11 août 2026 | Version Sites 31 publiée sans reconstruction ; déploiement `appgdep_6a7b130d5e3481919d467d17e8ba6760` réussi ; smoke tests publics passés |

## Compatibilité et nettoyage V3

Les médias Hero V3 restent temporairement dans le paquet de cette release, sans
aucune référence runtime. Ils n’ajoutent aucune requête ni aucun octet au parcours
V4, mais protègent les clients qui recevraient encore un HTML V3 pendant la fenêtre
`stale-while-revalidate` de 24 heures. Leur retrait est une release de nettoyage
séparée, après expiration de cette fenêtre et vérification des caches. Cette
décision privilégie l’absence de régression à une réduction immédiate de la taille
du paquet de déploiement.

## Rollback préparé

- Version Sites actuellement en production : `31`.
- Version Sites de rollback : `30`, revérifiée avant promotion le 11 août 2026.
- Git SHA de rollback : `65fedb4393a91d5428459f7baed84a6ff0bd4e11`.
- Méthode : redéployer directement la version Sites 30, sans rebuild et sans DNS.

## Prochaine porte

1. conserver le rollback immédiat vers la version 30 pendant la fenêtre de surveillance ;
2. traiter le `.fr` dans un handoff DNS séparé, uniquement comme redirection vers le `.com` ;
3. poursuivre le Lot 2 uniquement en environnement local ou de préproduction privée.
