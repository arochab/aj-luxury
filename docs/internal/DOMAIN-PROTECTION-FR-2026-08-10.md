# Gouvernance du domaine défensif — `ajluxurystore.fr`

Date : 10 août 2026

Statut : enregistré et parqué — REDIRECTION REPORTÉE, HORS CHEMIN CRITIQUE DU LANCEMENT `.COM`
Classification : interne AJ Luxury — preuve client non publiable et exclue des assets du site

## Verdict

`ajluxurystore.com` reste l’unique domaine canonique du site AJ Luxury.
`ajluxurystore.fr` est enregistré comme réservation défensive du nom de domaine,
mais il ne doit être
traité ni comme un second site, ni comme un domaine d’e-mail, ni comme une nouvelle
cible de production sans décision et recette DNS séparées.

## FACT — déclaration client conservée

Une capture reçue le 10 août 2026 montre un message de Jérémy, horodaté 12:20 :
« Nickel parfait ! J’ai aussi acheter le nom de domaine ajluxurystore.fr en
protection ».

- Preuve interne, non publiable : [capture du message](./evidence/2026-08-10-jeremy-ajluxurystore-fr-protection.png)
- SHA-256 : `1D809B6CBECEB613782B0C59E79BE8C7DD04AA8ED0291B05FBA6EC76F297AE2B`
- Portée de la preuve : déclaration de Jérémy sur l’achat et l’intention défensive.
- Limite : la capture ne remplace pas la facture, la fiche du compte registrar ou
  la vérification de la personne au nom de laquelle le domaine est enregistré.

## FACT — vérification publique distincte

Contrôles en lecture seule réalisés le 10 août 2026 entre 12:24 et 12:25 UTC :

| Élément | Observation publique |
|---|---|
| Registre | AFNIC, handle `DOM106850957-FRNIC` |
| État | `active`, période d’ajout en cours, Whois `ACTIVE` |
| Création | 10 août 2026 à 08:36:23 UTC |
| Échéance publiée | 10 août 2029 à 08:36:23 UTC |
| Bureau d’enregistrement | Hostinger operations UAB, IANA `1636` |
| Titulaire public | Données personnelles en diffusion restreinte ; identité non vérifiable publiquement |
| Serveurs de noms | `lunar.dns-parking.com`, `solar.dns-parking.com` |
| Apex | `A 2.57.91.91` |
| `www` | CNAME vers `ajluxurystore.fr` |
| E-mail | Aucun MX observé |
| DNSSEC | Aucun enregistrement DS observé |
| HTTP et HTTPS | `200 OK`, page de parking Hostinger, aucune redirection vers le `.com` |
| Indexation | La page de parking déclare `noindex, nofollow, noarchive, nosnippet` |

Sources publiques : [RDAP AFNIC](https://rdap.nic.fr/domain/ajluxurystore.fr) et
[présentation du Whois AFNIC](https://www.afnic.fr/noms-de-domaine/tout-savoir/whois-trouver-un-nom-de-domaine/).

## DECIDED — rôle des domaines

- `ajluxurystore.com` : domaine principal, canonique et actuellement publié.
- `www.ajluxurystore.com` : variante publique du domaine principal.
- `ajluxurystore.fr` et `www.ajluxurystore.fr` : réservation défensive uniquement.
- Aucun contenu AJ Luxury distinct, compte client, cookie, outil analytics ou boîte
  e-mail ne doit être créé sous le `.fr` sans décision explicite.
- Les zones DNS `.com` et `.fr` restent séparées. Ne jamais recopier en bloc la
  zone de l’une vers l’autre.

## DECIDED — expérience du domaine défensif reportée

### Décision courante du 11 août 2026

Adam décide de concentrer le lancement e-commerce sur `ajluxurystore.com` et de traiter
le `.fr` ultérieurement. La redirection n’est plus un prérequis, un blocage ni un gate
de mise en production du `.com`. Le domaine reste parqué et défensif. Toute future
mutation exige un nouveau handoff borné et une validation explicite ; le mécanisme
prévu reste une redirection permanente vers le `.com`, jamais un second site.

### Décision antérieure du 11 août 2026 — SUPERSEDED, conservée comme historique

Adam avait confirmé que lui-même et Jérémy autorisaient l’usage public du domaine `.fr` pour
accéder à AJ Luxury. Cette décision est mise en œuvre sans second site : le `.com` reste
canonique et le `.fr` devait uniquement rediriger vers lui. Cette décision a été reportée
par la décision courante ci-dessus ; aucune mutation n’a été exécutée.

Snapshot public immédiatement antérieur à toute mutation, relevé le 11 août 2026 :

| Élément | État observé |
|---|---|
| Apex | `A 2.57.91.91`, TTL observé 50 s |
| Apex IPv6 | `AAAA 64:ff9b::239:5b5b`, synthèse DNS64 observée |
| `www` | `CNAME ajluxurystore.fr`, TTL 300 s |
| Serveurs de noms | `lunar.dns-parking.com`, `solar.dns-parking.com` |
| SOA | série `2026081002` |
| MX / TXT / CAA / DS | aucun enregistrement de réponse observé |
| HTTP / HTTPS apex et `www` | `200 OK`, page de parking Hostinger, aucune redirection |
| Accès de gestion | session Hostinger expirée ; aucune écriture effectuée |

Rollback préparé : restaurer uniquement l’apex `A 2.57.91.91`, le `www` CNAME vers
`ajluxurystore.fr` et le service de parking/redirection Hostinger tel qu’observé, sans
toucher au `.com`, aux serveurs de noms ou à une éventuelle politique e-mail séparée.

Mécanisme proposé à appliquer après reconnexion Hostinger : redirection permanente
apex et `www`, HTTP et HTTPS, vers `https://ajluxurystore.com`, en conservant chemin et
paramètres de requête, sans contenu, cookie, analytics ni messagerie sous le `.fr`.

Recommandation : après validation d’Adam puis de Jérémy, remplacer la page de
parking par une redirection permanente contrôlée de l’apex et de `www` en HTTPS
vers `https://ajluxurystore.com`, sans héberger une copie du site. Une redirection
HTTP n’est pas créée par le DNS seul : cette action combine, selon la solution
retenue, le registrar, un service de redirection ou d’hébergement et la zone DNS.
Elle ne fait pas partie de la présente mise à jour documentaire.

Critères d’acceptation d’une future redirection :

1. même cible canonique pour l’apex et `www` ;
2. certificat TLS valide sur les deux hôtes `.fr` ;
3. redirection permanente `301` ou `308`, sans chaîne ni boucle ;
4. aucune page de contenu dupliquée ; sort des chemins et paramètres de requête
   décidé et testé explicitement ;
5. snapshot complet juste avant changement : zone, valeurs, TTL, serveurs de noms,
   DNSSEC, redirection et état TLS ;
6. tests HTTP et HTTPS sur apex et `www`, absence d’AAAA parasite, preuve de la
   redirection en un seul saut et retour arrière vers le snapshot immédiatement
   antérieur ;
7. politique e-mail du `.fr` préservée ou modifiée uniquement par une décision
   sécurité séparée ;
8. validation explicite du changement exact par Adam puis Jérémy.

## OPEN DECISION — protection d’un domaine sans e-mail

Le constat public « aucun MX observé » ne prouve pas que les messages adressés au
`.fr` sont explicitement rejetés. Avant de conserver durablement le domaine sans
messagerie, AJ Luxury devra choisir entre :

- une politique d’inactivité e-mail explicite, avec protections appropriées à
  valider techniquement au moment de l’action, par exemple Null MX, SPF restrictif
  et DMARC de rejet ;
- un service e-mail réellement configuré, documenté et recetté.

Aucune de ces deux options n’est mise en œuvre par le présent constat.

## NEXT ACTION — preuve de propriété et continuité

Owner : AJ Luxury / Jérémy SCHEPPLER. Avant de considérer la gouvernance du
domaine comme totalement close, conserver dans l’espace client :

- facture ou reçu Hostinger du domaine ;
- capture de la fiche domaine montrant le compte propriétaire, sans exposer de
  secret dans le dépôt ;
- statut du renouvellement automatique et moyen de paiement ;
- e-mail de récupération, double authentification et accès d’au moins un second
  administrateur AJ Luxury ;
- verrou de transfert registrar et statut DNSSEC ;
- date de revue annuelle, recommandée avant le 10 juillet.

Tant que ces éléments ne sont pas reliés au projet, le fait public « domaine
enregistré » est confirmé, mais la propriété juridique et la continuité d’accès
au nom d’AJ Luxury restent à valider documentairement.
