# AJ Luxury : gouvernance simple de l'administration

Statut : `SOURCE COURANTE DU CANDIDAT, NON ENCORE DEPLOYE`

Dernière mise à jour : 3 septembre 2026

## La règle en une phrase

Une personne entre dans l'administration uniquement si elle possède le mot de
passe d'un compte AJ Luxury confirmé et si l'adresse de ce compte fait partie
de la liste fermée ci-dessous.

## Qui peut être administrateur

La liste contient exactement trois adresses :

1. `adam.chabbi94@gmail.com`
2. `jeremy@ajluxurystore.com`
3. `jeremyajluxurystore@gmail.com`

Toute omission, adresse en plus, doublon ou configuration mal formée ferme
l'administration pour tout le monde. Il n'existe pas de bouton permettant à un
administrateur d'ajouter discrètement une quatrième adresse.

À ce stade, les trois adresses ont le même rôle de propriétaire. Elles peuvent
consulter les commandes, paiements, factures, stocks, codes promo et documents
d'expédition, puis exécuter les actions prévues par le tableau de bord.

## Comment Adam et Jérémy créent leur accès

1. Ouvrir `https://ajluxurystore.com/account`.
2. Cliquer sur `Créer un compte`.
3. Saisir l'une des trois adresses autorisées et choisir un mot de passe d'au
   moins 12 caractères.
4. Ouvrir le message de vérification reçu et cliquer sur son lien.
5. Ouvrir `https://ajluxurystore.com/admin`.
6. Se connecter avec la même adresse et le même mot de passe.

Créer un compte ne suffit pas à devenir administrateur. Le serveur vérifie
encore la liste fermée au moment de chaque connexion à l'administration.

## Les protections, sans double authentification

- Le mot de passe n'est jamais conservé tel quel. Le site enregistre seulement
  une version protégée qui ne permet pas de retrouver le mot de passe.
- L'adresse doit avoir été confirmée par e-mail.
- Cinq échecs de mot de passe verrouillent temporairement le compte pendant
  quinze minutes.
- La session administrateur expire après quinze minutes d'inactivité et, dans
  tous les cas, après huit heures.
- Chaque changement sensible est accepté uniquement depuis la page Admin
  réellement ouverte. Un autre site ne peut donc pas agir à l'insu de
  l'administrateur.
- Les créations d'étiquette, téléchargements de documents et changements
  opérationnels sensibles sont liés à l'administrateur et à sa session.
- La page et les réponses administrateur ne sont ni mises en cache ni indexées
  par les moteurs de recherche.

Aucune clé physique, application d'authentification ou étape Cloudflare n'est
demandée à Adam ou Jérémy.

## Ce que l'administrateur peut voir

- les commandes payées et leurs montants ;
- les confirmations d'e-mail ;
- le détail des articles, tailles, coloris et adresses de livraison ;
- la facture et les éventuels avoirs ;
- l'état de l'expédition, l'étiquette et, hors UE, le document douanier ;
- le stock physique, les réserves, les ventes et le disponible par référence ;
- les codes promo et leurs limites d'utilisation.

## Ce que le système fait automatiquement

- Stripe reste la seule autorité pour confirmer le paiement ;
- après paiement confirmé, la commande passe en préparation ;
- le bon stock est décrémenté ;
- une seule demande de création d'expédition est envoyée au transporteur ;
- lorsque l'étiquette est prête, elle est envoyée à Jérémy et reste disponible
  dans l'administration ;
- hors UE, le document douanier est traité avec l'étiquette ;
- une réimpression récupère le document existant et ne rachète pas une seconde
  étiquette.

## Ce qui exige un geste de Jérémy

- contrôler les articles et l'adresse ;
- imprimer l'étiquette A4 et le document douanier si nécessaire ;
- préparer le colis ;
- remettre physiquement le colis au transporteur ;
- confirmer la remise uniquement après avoir obtenu la preuve de dépôt.

Pour la première commande historique `AJ-41B58D96CCAAE37F00B8`, Jérémy devra
saisir le téléphone acheteur `+33659006025` et confirmer une seule relance. Cette
action peut acheter l'affranchissement choisi par le client. Adam et Codex ne la
déclenchent pas avant la démonstration avec Jérémy.

## Règle de déploiement

Le code est d'abord testé sans modifier le site public. Une nouvelle version
reçoit ensuite un SHA, c'est-à-dire son empreinte exacte. Cette version précise
doit être approuvée par Adam et Jérémy avant publication. Une approbation
d'un ancien SHA ne couvre jamais une nouvelle modification.
