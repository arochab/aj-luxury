# Lot 2 D01 : identité et accès

Statut : `CANDIDAT ISOLÉ, NON ACCEPTÉ, NON DÉPLOYABLE`

Base d'entrée : `50cabaf93ed7da82871533c4a2acdf4e37181476`, elle-même refusée pour
I02. Ce paquet ne peut être accepté qu'après portage sur le futur I03 accepté,
contre-audit indépendant et validation du candidat intégré exact.

## Ce que le paquet apporte

- Accès client sans mot de passe par lien à usage unique, token brut remis
  uniquement au port de livraison et hash SHA-256 conservé en D1.
- Un client ne devient éligible à la connexion que lorsque
  `customers.account_enabled_at` a été posé explicitement par le futur flux de
  création de compte. Une ligne client ou marketing seule ne suffit pas. Les
  comptes historiques restent donc désactivés après migration.
- Achat invité maintenu : une session invitée ne donne accès qu'à une commande
  sans compte client.
- Sessions client rotatives, révocables, à expiration absolue et inactive ; les
  anciennes sessions présentes avant D01 sont conservées mais révoquées pendant
  la migration.
- Administration lean avec deux rôles D1, `owner` et `operations`. La session
  exige une preuve MFA externe `AAL >= 2`, un administrateur actif et une version
  d'autorisation courante. Le hash unique du justificatif MFA interdit son rejeu
  pour créer une deuxième session. Aucun rôle fourni par une requête n'est utilisé.
- Autorisation de commande effectuée dans une requête SQL : compte A, compte B,
  invité et administrateur ne partagent aucune décision en mémoire.
- Cookies `__Host-`, origine HTTPS exacte, `Sec-Fetch-Site: same-origin` et paire
  CSRF en fonctions pures. Le hash CSRF est aussi lié à la session D1 ; une route
  de mutation doit passer le contrôle navigateur puis le contrôle D1.
- Audit automatique limité à des identifiants internes et `{}` : aucun e-mail,
  IP, user-agent, token, hash de token ou sujet externe.

## Limites et gates

- Aucun fournisseur d'e-mail, de limitation de débit ou de MFA n'est branché.
  Les ports sont fermés par défaut ; seuls les doubles de test peuvent les ouvrir.
- Aucune route HTTP ou interface n'est ajoutée. Ce paquet est une fondation D1
  testable, pas une fonctionnalité client activée.
- Noms de cookies gelés : `__Host-aj_customer`, `__Host-aj_customer_csrf`,
  `__Host-aj_guest_order`, `__Host-aj_guest_order_csrf`, `__Host-aj_admin` et
  `__Host-aj_admin_csrf`. Les cookies de session sont `HttpOnly`; aucun cookie
  ne porte d'attribut `Domain`.
- La migration `0003_identity_access.sql` est forward-only. Une future cible D1
  réelle exige le gate existant : historique, snapshot restaurable, lecture seule
  et preuve de répétition avant toute écriture.
- Le test D1 partagé de la base attend encore exactement `0000..0002`. Il ne peut
  pas être modifié dans ce paquet ; le gardien d'intégration devra l'étendre à
  `0003` lors du portage sur I03.

## Preuve dédiée

Commande locale :

```text
node --experimental-strip-types --test tests/identity-access-migration.test.mjs tests/identity-access-security.test.mjs
```

Couverture : création et upgrade `0000..0003`, répétition avec journal, sentinelle,
clés étrangères, double consommation et rotation, séparation A/B/invité/admin,
MFA faible ou périmé, rejeu concurrent d'une preuve MFA, rôle de requête ignoré,
version obsolète, activation explicite du compte, désactivation, expiration,
inactivité, logout, cookies, CSRF lié en D1, origine, `Sec-Fetch-Site`, machine
d'état des challenges et scan des audits.

Résultats locaux du 11 août 2026 :

- 12 contrôles D01 sur 12 passent ;
- Wrangler D1 local applique les quatre migrations, rejoue sans opération et ne
  signale aucune erreur de clé étrangère. Un upgrade D1 local distinct depuis
  `0000..0002` conserve sa sentinelle et révoque la session historique ;
- build et lint complets passent ;
- delta TypeScript nul : les sept diagnostics Worker/Cloudflare de la base restent
  identiques et aucun diagnostic D01 n'est ajouté ;
- 115 contrôles existants passent. Les deux seuls refus sont les assertions
  partagées encore figées sur 15 tables et trois migrations. Leur adaptation est
  explicitement réservée au gardien d'intégration.
