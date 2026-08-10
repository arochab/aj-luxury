# AJ Luxury — mesure d’audience et du parcours commerce, Lot 2

Statut : `MODULE PROPOSÉ — TEST UNIQUEMENT — NON INTÉGRÉ — AUCUNE MESURE ACTIVE`

Date : 10 août 2026

Responsable de l’intégration : Adam CHABBI

Cible d’intégration frontend finale : `c7362d3d04af6fc6070a15112a1fdff7878e09bd`

Base du worktree Analytics isolé : `c7362d3d04af6fc6070a15112a1fdff7878e09bd`

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
tunnel commerce complémentaire.

## Contrat d’événements V1

Allowlist fermée : tout nom ou champ non listé est rejeté, sans envoi ni mise en
attente.

| Événement | Déclencheur futur | Champs autorisés | Usage métier |
|---|---|---|---|
| `product_view` | Affichage confirmé d’une fiche produit | `productId`, `variantId` facultatif | Intérêt produit |
| `add_to_cart` | Ajout au panier accepté | `productId`, `variantId`, `quantity`, `valueMinor`, `currency` | Intention d’achat |
| `checkout_started` | Checkout réellement engagé | `itemCount`, `valueMinor`, `currency` | Friction panier → paiement |
| `order_paid` | Confirmation serveur d’un paiement vérifié | `itemCount`, `valueMinor`, `currency` | Conversion et revenu fiables |

`order_paid` ne devra jamais être déclenché par le navigateur ni par une page de
confirmation seule. Sa source d’autorité future est le backend de paiement
après vérification du statut payé.

Bornes V1 : identifiants produit/variante présents dans la nomenclature catalogue
injectée et limités à 64 caractères ; quantité et nombre d’articles de 1 à 99 ;
valeur en unité monétaire mineure de 0 à 100 000 000 ; devise sur trois lettres
majuscules. Une valeur hors bornes ou inconnue fait rejeter l’événement complet.

## Contexte autorisé et protection des données

Le contexte est volontairement minimal :

- chemin de page uniquement s’il appartient à la nomenclature injectée, sans
  domaine, paramètres de requête ni fragment ;
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
- `granted` autorise seulement un événement conforme à l’allowlist ;
- un retrait vers `denied` ou une remise à zéro vers `unknown` prend effet dès
  l’événement suivant ;
- accepter et refuser devront rester au même niveau dans l’interface finale.

Le socle ne persiste pas encore le choix. Le registre juridique retient une
durée de référence de six mois ; ce point, le texte public, la preuve du choix
et la qualification juridique de l’outil devront être revalidés avec la mise à
jour des pages confidentialité/cookies avant toute activation.

## Architecture retenue dans ce candidat

- façade TypeScript indépendante du fournisseur, seule porte publique
  d’émission d’un événement ;
- interface de collecte à acquittement strictement synchrone ; seul un
  collecteur mémoire de test est fourni dans la recette ;
- collecteur asynchrone, en échec ou sans réponse rejeté immédiatement sans
  bloquer le parcours commerce ;
- politique injectée et fail-closed pour routes, référents, UTM, produits et
  variantes ;
- validation d’exécution des noms, champs, formats, montants et quantités ;
- sanitization centralisée des chemins, référents et UTM ;
- horloge et collecteur injectables pour des tests déterministes ;
- erreurs de collecte contenues : la mesure ne bloque jamais l’achat.

Il n’existe volontairement aucun appel réseau, token, SDK, cookie analytics,
table D1, endpoint de collecte ou branchement dans l’interface. Ce module reste
une proposition isolée ; il ne constitue pas à lui seul le Lot 2 backend.

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

1. les quatre événements exacts sont les seuls acceptés ;
2. aucun événement ne sort avant consentement explicite ;
3. le retrait du consentement coupe immédiatement les événements suivants ;
4. les champs non prévus et valeurs invalides sont rejetés ;
5. URL, référent et UTM ne conservent aucune donnée brute sensible ;
6. le code ne contient aucun transport réseau ni SDK fournisseur ;
7. un collecteur asynchrone ou bloqué ne peut pas bloquer l’achat ;
8. le builder interne n’est pas exposé par l’API publique ;
9. lint, build et tests du projet restent verts.

L’activation reste bloquée par le choix du fournisseur, la validation juridique
et client des textes et durées, la connexion du backend commerce, une recette
en environnement de test, puis les validations explicites d’Adam CHABBI et de
Jérémy SCHEPPLER sur la même version candidate.
