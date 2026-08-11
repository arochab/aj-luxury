# Lot 2 D01 : identité et accès

Statut : `CANDIDAT ISOLÉ, NON ACCEPTÉ, NON DÉPLOYABLE`

Base d'entrée : `a169019894089ceb704813129f59cd3336da1896`, elle-même refusée.
Ce paquet ne peut être accepté qu'après portage sur le futur I03 accepté,
contre-audit indépendant et validation du candidat intégré exact.

## Ce que le paquet apporte

- Accès client et invité sans mot de passe par lien à usage unique. Le token brut
  n'est remis qu'au port de livraison ; seul un hash contextualisé est conservé.
- Réponse d'une demande d'accès uniformisée : durée minimale de 120 ms pour les
  cas connus et inconnus, même travail de persistance, réponse indépendante du
  délai de livraison. L'adaptateur d'exécution en arrière-plan devra être relié
  à un mécanisme de durée de vie garanti, par exemple `waitUntil`, avant routage.
- Un challenge ciblé est créé inactif, puis activé seulement après livraison.
  Un challenge sans cible est obligatoirement révoqué dès sa création ; la base
  interdit son activation ou sa consommation.
- Consommation atomique : l'insertion d'une session et la consommation de son
  challenge forment une seule transaction SQLite contrôlée par triggers. Une
  mise à jour directe de `consumed_at` sans session correspondante est refusée.
- Sessions client rotatives, révocables, à expiration absolue et inactive. Le
  logout-all révoque en une instruction toutes les sessions actives du client
  authentifié ; chaque session révoquée produit son audit. Les anciennes sessions
  présentes avant D01 restent conservées mais sont révoquées par la migration.
- Achat invité maintenu : une session invitée ne donne accès qu'à sa commande.
- Administration lean avec rôles D1 `owner` et `operations`. Une preuve MFA
  externe `AAL >= 2` et récente est requise ; une limite locale globale et
  pseudonymisée intervient avant tout appel MFA, toute recherche
  d'administrateur et toute création de session.
- Séparation cryptographique versionnée des domaines challenge, session, CSRF et
  limitation de débit, pour client, invité et administrateur. Les anciens hashes
  SHA-256 non contextualisés sont incompatibles et échouent fermés.
- Cookies `__Host-`, origine HTTPS exacte, `Sec-Fetch-Site: same-origin` et paire
  CSRF. L'autorisation commande est évaluée par SQL et reste isolée entre
  client A, client B, invité et administrateur.
- Audit limité aux identifiants internes et à `{}` : aucun e-mail, IP,
  user-agent, token, hash de token ou sujet externe.

## Limites et gates

- Aucun fournisseur d'e-mail, de limitation de débit, de MFA ou adaptateur
  d'arrière-plan n'est branché. Les ports sont fermés par défaut.
- Aucune route HTTP ni interface n'est ajoutée. Ce paquet est une fondation D1
  testable, pas une fonctionnalité client activée.
- Noms de cookies gelés : `__Host-aj_customer`, `__Host-aj_customer_csrf`,
  `__Host-aj_guest_order`, `__Host-aj_guest_order_csrf`, `__Host-aj_admin` et
  `__Host-aj_admin_csrf`. Les cookies de session sont `HttpOnly`; aucun cookie
  ne porte d'attribut `Domain`.
- La migration `0003_identity_access.sql` est forward-only. Une future cible D1
  exige le gate existant : historique, snapshot restaurable, lecture seule et
  preuve de répétition avant toute écriture.
- Les assertions partagées de comptage restent réservées au gardien d'intégration
  lors du portage sur I03 ; ce candidat ne les modifie pas.

## Preuve dédiée

Commande locale :

```text
node --experimental-strip-types --test tests/identity-access-migration.test.mjs tests/identity-access-security.test.mjs
```

Couverture : création, upgrade et répétition `0000..0003`, sentinelle, clés
étrangères, insertion targetless refusée, consommation atomique et concurrence
client/invité, séparation A/B/invité/admin, logout-all concurrent et audité,
padding anti-énumération, livraison non bloquante, séparation des hashes,
incompatibilité fail-closed, rate limit admin, MFA, expiration, cookies, CSRF,
origine, machine d'état et confidentialité des audits.

Résultats locaux du 11 août 2026 :

- 18 contrôles D01 sur 18 passent ;
- Wrangler D1 local applique `0000..0003` sur une base vide et rejoue sans
  opération. Un upgrade distinct depuis `0000..0002` conserve sa sentinelle,
  révoque la session historique, journalise les quatre migrations et conserve
  `PRAGMA foreign_key_check` vide ;
- build et lint complets passent ;
- delta TypeScript nul : les sept diagnostics Worker/Cloudflare de la base restent
  identiques et aucun diagnostic D01 n'est ajouté ;
- 115 contrôles existants passent. Les deux seuls refus sont les assertions
  partagées encore figées sur 15 tables et trois migrations ; leur adaptation
  reste réservée au gardien d'intégration.
