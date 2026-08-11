# AJ Luxury — mesure d’audience et du parcours commerce, Lot 2

Statut : `MODULE PROPOSÉ — TEST UNIQUEMENT — NON INTÉGRÉ — AUCUNE MESURE ACTIVE`

Date : 11 août 2026

Responsable de l’intégration : Adam CHABBI

Cible d’intégration frontend finale : `c7362d3d04af6fc6070a15112a1fdff7878e09bd`

Base du worktree Analytics isolé : `c7362d3d04af6fc6070a15112a1fdff7878e09bd`

Base gelée de la correction après red-team : `56b97412522fa5564921db2cacdcb749c9ba80ce`

Base gelée de la frontière build simplifiée : `d4481e45ddf0350f806d79202bb81515d3a09703`

## Verdict

Le Lot 2 doit apporter à AJ Luxury une lecture courte et exploitable de son
audience et de son parcours d’achat, sans pixel publicitaire, sans identifiant
de personne et sans dépendance prématurée à un fournisseur. Le présent socle
définit le contrat d’événements, la confidentialité et le consentement ; il
n’active aucun outil, aucun réseau, aucun stockage et aucun environnement de
production.

## Questions auxquelles l’outil devra répondre

1. Quelles pages et quels produits attirent réellement l’attention ?
2. Quelle part des visites produit mène à un ajout au panier puis au checkout ?
3. Quelle part des checkouts aboutit à une commande payée ?
4. Quelles campagnes UTM apportent des visites et des commandes utiles ?
5. Le site reste-t-il rapide et stable pour les visiteurs réels ?

Les visiteurs, pages vues et indicateurs de performance web relèveront du
futur outil d’audience. Les quatre événements ci-dessous couvrent seulement le
tunnel commerce complémentaire, avec trois événements navigateur et un
événement réservé au serveur.

## Contrat d’événements V3

Allowlist fermée : tout nom ou champ non listé est rejeté, sans envoi ni mise en
attente.

| Événement | Autorité | Entrée autorisée | Données émises | Usage métier |
|---|---|---|---|---|
| `product_view` | Navigateur après consentement | `productId`, `variantId` facultatif | Identifiants validés par le catalogue | Intérêt produit |
| `add_to_cart` | Navigateur après consentement | `productId`, `variantId`, `quantity` | Prix, valeur et devise dérivés de la variante gouvernée | Intention d’achat |
| `checkout_started` | Navigateur après consentement | Lignes `variantId` et `quantity` | Nombre d’articles, valeur et devise dérivés du catalogue | Friction panier vers paiement |
| `order_paid` | Futur serveur commerce canonique | Aucune entrée acceptée dans ce candidat | Rien : événement techniquement indisponible | Conversion et revenu fiables après intégration D1 |

`order_paid` ne peut pas être appelé par l’index ni la façade client. Le candidat
ne possède aucun recorder, validateur de snapshot, callback de stockage ou
résultat de succès. Il conserve seulement un contrat serveur interne gelé qui
déclare `unavailable` avec le blocker
`analytics_server_recorder_not_implemented` et une activation `not_approved`.
La D1 commerce canonique est intégrée, mais aucun recorder analytics serveur
n'existe et aucune activation n'est approuvée. Sa future autorité devra rester
la transaction payée de cette D1. Un fichier serveur profond réellement résolu ou chargé par Vite fait
échouer le build client, quelle que soit la casse du chemin.

Bornes V3 : identifiants produit/variante présents dans le catalogue commerce
réel de cette branche et limités à 64 caractères ; quantité et nombre d’articles de 1 à 99 ;
valeur en unité monétaire mineure de 1 à 100 000 000 ; devise sur trois lettres
majuscules. Une valeur hors bornes ou inconnue fait rejeter l’événement complet.
Chaque variante est liée à un seul produit, un prix unitaire et une devise. Un
couple produit/variante incohérent, une variante dupliquée, plusieurs devises
dans un checkout ou un total fourni librement par le navigateur sont rejetés.

## Contexte autorisé et protection des données

Le contexte est volontairement minimal :

- chemin de page uniquement si l’URL absolue correspond exactement à l’origine
  canonique HTTPS injectée et si le chemin appartient à la nomenclature, sans
  domaine, paramètres de requête ni fragment dans l’événement ;
- origine du référent uniquement si elle est explicitement autorisée, sans
  chemin ni paramètres ;
- trois clés UTM maximum : `utm_source`, `utm_medium`, `utm_campaign`, chacune
  limitée à une nomenclature administrée injectée ;
- version de schéma et horodatage technique.

Sont interdits : nom, e-mail, téléphone, adresse, IP applicative, identifiant
client, panier, commande, paiement, session ou appareil, contenu libre et toute
donnée issue d’un compte. Les segments de chemin ressemblant à un e-mail, un
UUID, une longue suite numérique ou un jeton opaque sont remplacés par
`:redacted`. Toute route, origine, valeur UTM ou référence catalogue inconnue
est abandonnée ou masquée. Aucune valeur libre n’est acceptée par défaut.

## Consentement : fail-closed et réversible

Le contrôleur possède trois états : `unknown`, `denied`, `granted`.

- `unknown` et `denied` bloquent tout événement ;
- aucun événement n’est mis en file pour un envoi ultérieur ;
- `granted` ne déclenche rien dans ce candidat : la façade navigateur reste
  explicitement inactive ;
- un retrait vers `denied` ou une remise à zéro vers `unknown` prend effet dès
  l’événement suivant ;
- accepter et refuser devront rester au même niveau dans l’interface finale.

Le socle ne persiste pas encore le choix. Le registre juridique retient une
durée de référence de six mois ; ce point, le texte public, la preuve du choix
et la qualification juridique de l’outil devront être revalidés avec la mise à
jour des pages confidentialité/cookies avant toute activation.

## Architecture retenue dans ce candidat

- façade TypeScript client limitée à `product_view`, `add_to_cart` et
  `checkout_started`, mais inactive : elle ne lit pas le payload, ne prépare
  aucun événement, ne bufferise rien et ne planifie aucun travail ;
- coût de `track` constant par rapport au payload et au catalogue : lecture du
  contrôleur de consentement de première partie, puis retour
  `analytics_inactive` ; cette garantie ne couvre pas un contrôleur de
  consentement tiers volontairement bloquant ;
- contrat de préparation client dormant, non exporté par l’index et jamais
  appelé par la façade inactive ; il lit une projection publique minimale,
  profondément gelée et construite depuis les seules données produit publiques,
  sans stock, quantité d’inventaire ni fixture catalogue injectable ;
- constantes et types client dans un graphe physique distinct du serveur ;
- entrée serveur séparée et non réexportée pour `order_paid`, réduite à un
  constat d’indisponibilité sans fonction d’acceptation ; la résolution
  conditionnelle donne explicitement priorité à `react-server`, `workerd`,
  `worker` et `node`, puis bloque `browser`, avec une garde d’exécution
  complémentaire ;
- conditions client, SSR et RSC lues depuis la configuration Vinext/Vite
  réellement résolue en production, puis rejouées dans les tests de bundle ;
- build Vite réel de l’entrée publique obligatoire avant lint et build, complété
  par un plugin limité aux environnements client ; ses hooks bloquent les modules
  serveur réellement résolus ou chargés, sans parser le source, propager des
  constantes, suivre des alias, réimplémenter la résolution ou réinterpréter les
  globs de Vite ; `?raw`, `?url`, les globs et `new URL(..., import.meta.url)` sont
  donc bloqués lorsqu’ils sont effectivement matérialisés par Vite ; les imports
  de types effacés et les exclusions négatives de `import.meta.glob` restent
  autorisés, comme SSR et RSC ;
- `generateBundle` refuse tout chunk dont les identifiants de modules révèlent
  une entrée Analytics serveur et inspecte en binaire les chunks et assets, y
  compris les data URI encodées ; le `postbuild` automatique relit ensuite tous
  les fichiers de `dist/client`, JavaScript et non-JavaScript ; chaque entrée
  serveur actuelle porte au moins un marqueur final contrôlé par test ;
- quatre canaris `raw`, `url`, JavaScript et TXT sont injectés comme vraies
  entrées client de build et prouvent que `npm run build` échoue, les deux
  derniers au stade de l’inspection des artefacts émis ;
- bundles adversariaux exécutés avec Vite 8.1.5, bundle navigateur de l’index
  construit par esbuild et inspection binaire de tous les fichiers émis dans le
  `dist/client` final produit par Vinext, y compris les assets non JavaScript ;
- aucun collecteur, callback, buffer ou dispatcher côté navigateur ;
- aucune outbox, même simulée, et aucun callback de persistance injectable ;
- politique injectée et fail-closed uniquement pour routes, référents et UTM ;
- origine canonique HTTPS obligatoire et contrat commerce reliant l’unique
  produit `product_apollon` aux douze IDs runtime `variant_boxer_*`, avec douze
  références internes distinctes `AJ-APO-*`, un prix de 2 999 centimes et EUR ;
- validation d’exécution des noms, champs, formats, montants et quantités ;
- sanitization centralisée des chemins, référents et UTM ;
- contrat `order_paid` dormant et explicitement indisponible tant que la D1
  commerce canonique n’est pas intégrée ;
- aucune structure de snapshot ne peut être présentée comme « vérifiée » et
  aucune fonction arbitraire ne peut simuler une persistance acceptée ;
- typecheck Analytics sans exclusion et typecheck racine avec delta Lot 2 nul :
  seuls les sept diagnostics historiques hors périmètre restent autorisés par
  la preuve automatisée.

Il n’existe volontairement aucun appel réseau, token, SDK, cookie analytics,
table D1, endpoint de collecte ou branchement dans l’interface. Ce module reste
une proposition isolée ; il ne constitue pas à lui seul le Lot 2 backend.

### Invariant de frontière client

Le build client ne peut émettre aucun module, asset ni octet de capacité
Analytics serveur : les modules réellement résolus ou chargés sont
refusés avant émission, les identifiants et contenus binaires sont refusés dans
`generateBundle`, puis l’intégralité de `dist/client` est relue après le vrai
build Vinext. Toute nouvelle entrée serveur devra contenir un marqueur final ou
faire évoluer la liste de marqueurs dans le même commit ; un test impose cette
couverture à toutes les entrées `server*.ts` actuelles.

Un import dynamique que Vite ne résout réellement pas peut rester sous forme de
spécificateur runtime. Il n’est autorisé par cette frontière que parce que le
build de production n’a chargé aucun module serveur, n’a émis aucun fichier
serveur et ne contient aucun octet de capacité serveur. Il n’est pas revendiqué
que toute expression dynamique échoue au build ; les tests vérifient au
contraire cette limite honnête ainsi que l’absence de faux positif entre noms
homonymes de portées différentes.

L’idempotence durable n’est pas revendiquée dans ce candidat. Son schéma devra
être conçu à partir de la D1 commerce canonique et de sa transaction de paiement,
pas à partir d’un snapshot structurel ou d’une fausse outbox de test. Avant cette
intégration, `order_paid` reste techniquement indisponible.

## Indicateurs du tableau de bord futur

Le tableau de bord destiné à AJ Luxury devra rester sur un écran :

- visiteurs, pages vues, sources/référents et performance web ;
- vues produit par coloris ;
- taux ajout panier / vue produit ;
- taux checkout / ajout panier ;
- taux commande payée / checkout ;
- commandes payées et chiffre d’affaires, issus du backend ;
- ventilation UTM limitée aux campagnes dont le volume est significatif.

Les définitions, fuseau horaire, devise d’affichage, seuil de volume et période
de conservation restent à valider avant construction du tableau de bord.

## Non-objectifs de cette phase

- aucun profil visiteur, replay de session, publicité, retargeting ou test A/B ;
- aucun fournisseur réellement connecté ;
- aucun stockage ni dashboard de production ;
- aucune modification des pages publiques juridiques tant que l’outil final et
  sa qualification ne sont pas décidés ;
- aucune activation sur `ajluxurystore.com`.

## Recette et prochain gate

Le socle passe cette phase si :

1. le bundle navigateur réel de l’index et le `dist/client` final Vinext ne
   contiennent aucun module, asset ou marqueur de capacité Analytics serveur ;
2. la garde pré-build/pré-lint et les builds Vite 8.1.5 adversariaux bloquent
   les imports directs, littéraux, sous-chemins, `?raw`, `?url`, glob, imports
   dynamiques et `new URL` que Vite résout ou matérialise réellement, y compris
   avec une casse différente sur un système insensible à la casse, sans bloquer
   les types, les exclusions de glob, les spécificateurs réellement non résolus,
   SSR ou RSC ;
3. la façade client ne possède aucun collecteur et laisse passer le prochain
   task sans exécuter un callback CPU hostile ;
4. la façade reste inactive même avec consentement accordé ;
5. `unknown` et `denied` restent fail-closed ;
6. les douze IDs runtime `variant_boxer_*`, le produit `product_apollon`, les
   douze références internes `AJ-APO-*`, le prix et la devise suivent le contrat
   commerce/D1 canonique ;
7. ajout panier et checkout dérivent leurs valeurs du catalogue ;
8. `order_paid` expose seulement un contrat interne `unavailable` et aucun
   mécanisme ne peut accepter un snapshot ou une persistance injectée ;
9. toute URL d’une origine différente de l’origine canonique est rejetée ;
10. le code ne contient aucun transport réseau ni SDK fournisseur ;
11. le typecheck ciblé reste vert et le typecheck racine ne contient aucun
    diagnostic Lot 2 nouveau ;
12. lint, build et suite complète restent verts.

L’activation reste bloquée par le choix du fournisseur, la validation juridique
et client des textes et durées, la connexion du backend commerce, une recette
en environnement de test, puis les validations explicites d’Adam CHABBI et de
Jérémy SCHEPPLER sur la même version candidate.
