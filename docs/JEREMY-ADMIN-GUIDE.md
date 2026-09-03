# AJ Luxury — guide administrateur de Jérémy

Statut : `SOURCE OPÉRATEUR COURANTE — CANDIDAT NON ENCORE DÉPLOYÉ`

Dernière mise à jour : 3 septembre 2026

Ce guide explique uniquement le travail quotidien de Jérémy. La procédure
technique de déploiement et de preuve reste dans `docs/RELEASE-RUNBOOK.md`.

## Le résultat attendu

Depuis `https://ajluxurystore.com/admin`, Jérémy doit pouvoir :

- voir les commandes payées et leur montant ;
- vérifier les deux e-mails de confirmation ;
- recevoir automatiquement le mail opérationnel « paiement reçu + étiquette »
  avec le détail des articles ;
- ouvrir la facture A4 et les éventuels avoirs ;
- lire les articles, tailles et coloris à préparer ;
- télécharger l'étiquette transporteur A4 ;
- confirmer la remise physique du colis au transporteur ;
- suivre le stock global et chaque référence ;
- créer, désactiver ou réactiver un code promo.

Adam n'intervient pas dans la préparation quotidienne des colis. Il intervient
uniquement en cas d'incident technique ou de nouveau déploiement.

## Accès

1. Ouvrir `https://ajluxurystore.com/account` et cliquer sur `Créer un compte`.
2. Utiliser `jeremy@ajluxurystore.com` ou `jeremyajluxurystore@gmail.com`, puis
   choisir un mot de passe d'au moins 12 caractères.
3. Cliquer sur le lien reçu par e-mail pour confirmer l'adresse.
4. Ouvrir `https://ajluxurystore.com/admin`.
5. Se connecter avec la même adresse et le même mot de passe.

Il n'y a ni double authentification, ni clé physique, ni écran Cloudflare dans ce parcours. Le
serveur vérifie néanmoins à chaque connexion que l'adresse est confirmée et
fait partie de la liste fermée des trois administrateurs. Après cinq erreurs de
mot de passe, le compte est temporairement verrouillé pendant quinze minutes.
La session Admin expire après quinze minutes d'inactivité ou huit heures au
maximum.

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

### 4. Recevoir et imprimer les documents d'expédition

Pour les nouvelles commandes, le système crée automatiquement une seule
expédition après le paiement. Dès que le transporteur rend les documents
disponibles, un seul e-mail est envoyé automatiquement à
`jeremy@ajluxurystore.com` avec :

- la confirmation que le paiement a été reçu ;
- le numéro, les articles, coloris, tailles, quantités et montants de la commande ;
- l'étiquette transporteur A4 en pièce jointe ;
- pour une commande hors UE, le document douanier A4 dans le même e-mail.

Le geste normal de Jérémy est donc d'ouvrir cet e-mail puis :

1. vérifier le détail de préparation ;
2. ouvrir le PDF de l'étiquette ;
3. imprimer en A4, portrait, à 100 %, sans ajustement automatique ;
4. pour le hors UE, imprimer également le document douanier et suivre les
   consignes du transporteur ;
5. vérifier que l'adresse et le code-barres sont nets ;
6. coller l'étiquette à plat sur le colis, sans pli sur le code-barres.

Si l'e-mail est introuvable alors que la colonne livraison affiche
`étiquette prête`, l'Admin sert de secours :

1. cliquer sur `Télécharger l'étiquette transporteur A4` ;
2. pour le hors UE, télécharger aussi `Document douanier A4` ;
3. réimprimer selon les règles ci-dessus.

Un téléchargement ou une réimpression ne recrée jamais une expédition et ne
rachète jamais une deuxième étiquette.

L'étiquette sert au transport. La facture A4 est un document différent destiné
au client et à la comptabilité.

### 5. Cas exceptionnel de la première commande

La première commande historique a été payée avant que le téléphone ne devienne
obligatoire au checkout. Elle peut donc afficher
`échec transporteur — intervention requise`.

Pour cette commande précise, le téléphone destinataire est celui d’Adam :
`06 59 00 60 25`, à saisir au format `+33659006025`. Aucun numéro personnel du
vendeur ne doit être substitué au téléphone du destinataire sur l’étiquette.

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

## Périmètre international du candidat

Le candidat couvre France/UE ainsi que Royaume-Uni, États-Unis, Canada,
Émirats arabes unis, Qatar et Arabie saoudite. Pour le hors UE, la déclaration
utilise l'origine Chine, le code douanier `61071200`, l'EORI `FR944996487` et la
règle DAP. Ces pays ne doivent être annoncés disponibles qu'après preuve du
health et d'une cotation réelle sur la version effectivement déployée.
