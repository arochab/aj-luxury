# AJ Luxury — guide administrateur de Jérémy

Statut : `SOURCE OPÉRATEUR COURANTE — CANDIDAT NON ENCORE DÉPLOYÉ`

Dernière mise à jour : 1er septembre 2026

Ce guide explique uniquement le travail quotidien de Jérémy. La procédure
technique de déploiement et de preuve reste dans `docs/RELEASE-RUNBOOK.md`.

## Le résultat attendu

Depuis `https://ajluxurystore.com/operations`, Jérémy doit pouvoir :

- voir les commandes payées et leur montant ;
- vérifier les deux e-mails de confirmation ;
- ouvrir la facture A4 et les éventuels avoirs ;
- lire les articles, tailles et coloris à préparer ;
- télécharger l'étiquette transporteur A4 ;
- confirmer la remise physique du colis au transporteur ;
- suivre le stock global et chaque référence ;
- créer, désactiver ou réactiver un code promo.

Adam n'intervient pas dans la préparation quotidienne des colis. Il intervient
uniquement en cas d'incident technique ou de nouveau déploiement.

## Accès

1. Ouvrir `https://ajluxurystore.com/operations`.
2. S'identifier avec une adresse explicitement autorisée dans Cloudflare Access.
3. La page crée ensuite une session administrateur courte et protégée. Aucun
   mot de passe client, cookie ou jeton ne doit être copié ou transmis.
4. Si la page demande de se reconnecter, refaire simplement l'étape 2.

L'espace Admin et ses API sont bloqués avant même d'atteindre le site pour toute
personne non autorisée. La décision actuelle ne rajoute pas de MFA applicatif
supplémentaire ; la session nominative et la protection anti-falsification restent
obligatoires.

## Traiter une commande, de bout en bout

### 1. Vérifier le paiement

La ligne doit afficher `réglé`. Le signal Stripe vérifié fait foi. Ne jamais
préparer un colis sur la base d'une capture d'écran ou d'un e-mail isolé.

### 2. Vérifier les confirmations

La colonne e-mails doit afficher `2/2 confirmés` :

- confirmation de commande ;
- confirmation de paiement.

Si le paiement est réglé mais qu'un e-mail manque, ne pas recréer la commande.
Signaler l'incident à Adam avec le numéro de commande.

### 3. Préparer les bons articles

Cliquer sur `Voir le détail`, puis contrôler pour chaque ligne :

- quantité ;
- coloris ;
- taille ;
- référence interne.

Contrôler également le nom et l'adresse de destination avant de fermer le colis.

### 4. Imprimer l'étiquette transporteur

Pour les nouvelles commandes, le système crée automatiquement une seule
expédition après le paiement. Quand la colonne livraison affiche
`étiquette prête` :

1. cliquer sur `Télécharger l'étiquette transporteur A4` ;
2. ouvrir le PDF téléchargé ;
3. imprimer en A4, portrait, à 100 %, sans ajustement automatique ;
4. vérifier que l'adresse et le code-barres sont nets ;
5. coller l'étiquette à plat sur le colis, sans pli sur le code-barres.

L'étiquette sert au transport. La facture A4 est un document différent destiné
au client et à la comptabilité.

### 5. Cas exceptionnel de la première commande

La première commande historique a été payée avant que le téléphone ne devienne
obligatoire au checkout. Elle peut donc afficher
`échec transporteur — intervention requise`.

Pour cette commande précise, le téléphone destinataire est celui d’Adam :
`06 59 00 60 25`, à saisir au format `+33659006025`. Le numéro public
AJ Luxury / Jérémy est `06 88 42 40 62` (`+33688424062`) et ne doit pas être
substitué au téléphone du destinataire sur l’étiquette.

Le tableau de bord présente alors une seule action contrôlée :

1. saisir le téléphone réel du destinataire au format international, par exemple
   `+33612345678` ;
2. cliquer sur `Créer puis télécharger l'étiquette A4` ;
3. lire l'avertissement, puis confirmer une seule fois ;
4. imprimer le PDF selon l'étape précédente.

Cette action conserve l'adresse payée, ajoute uniquement le téléphone nécessaire
au transporteur et consomme définitivement l'autorisation de relance. Elle peut
acheter l'affranchissement choisi par le client.

Si l'écran affiche `vérification transporteur requise`, ne pas recliquer. Le
résultat est volontairement bloqué afin d'éviter une seconde étiquette et une
double facturation. Transmettre le numéro de commande à Adam pour rapprochement
avec Sendcloud.

### 6. Remettre le colis

Remettre le colis au transporteur correspondant au choix du client et conserver
le reçu ou la preuve de dépôt. Le site ne remplace pas cette preuve physique.

Cliquer sur `Confirmer la remise` uniquement après la remise réelle. Le suivi
transporteur prend ensuite le relais. Sans preuve de dépôt, laisser la commande
en préparation.

## Comprendre le stock

Le tableau `Stock` est calculé directement depuis la base commerce :

- `Physique` : unités réellement comptées ;
- `Cadeaux` : unités séparées du stock vendable ;
- `Réservé panier` : unités temporairement bloquées pendant un achat ;
- `Vendu` : unités rattachées à un paiement confirmé ;
- `Disponible` : physique moins cadeaux, réserve de sécurité, paniers actifs et
  ventes confirmées.

Le paiement confirmé décrémente automatiquement la bonne variante. Les
quantités internes ne sont pas publiées aux visiteurs.

Dernière preuve de référence avant ce candidat : 749 unités physiques, 23
réservées cadeaux, 2 vendues et 724 disponibles. Le nombre affiché dans Admin
reste l'autorité opérationnelle courante.

## Codes promo

Dans `Codes promo`, Jérémy peut définir :

- le code transmis au client ;
- un pourcentage ou un montant fixe ;
- un minimum de panier ;
- un plafond de remise ;
- un nombre maximal d'utilisations ;
- une date de fin.

Une remise est réservée pendant le paiement puis comptée seulement après
confirmation Stripe. Désactiver un code empêche les nouvelles utilisations sans
réécrire les commandes déjà payées.

## Règles de sécurité à retenir

- ne jamais cliquer plusieurs fois quand le transporteur est en vérification ;
- ne jamais confirmer la remise avant le dépôt physique ;
- ne jamais confondre facture, avoir et étiquette transporteur ;
- ne jamais corriger directement un paiement ou un stock dans Stripe, Sendcloud
  ou la base ;
- en cas de doute, conserver le numéro de commande et demander un rapprochement,
  sans recréer la commande.

## État de déploiement

Ce guide décrit la version candidate en cours de recette. Tant que son SHA exact
n'a pas été approuvé par Adam puis Jérémy et que la santé publique n'affiche pas
`mode=live` avec `publicCommerce=true`, il ne faut pas annoncer que la boutique
est ouverte. Les tests automatisés n'achètent aucune étiquette réelle.
