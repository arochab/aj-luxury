# Call Jérémy, commerce contrôlé

Date : 1er septembre 2026  
Durée maximale : 15 minutes  
Objectif : montrer les faits, fermer les derniers risques et décider de la prochaine recette.  
Statut : support de call interne actualisé. La preuve d'adhésion au médiateur est
acquise ; la promotion publique du prochain candidat reste à prouver sur le
runtime exact avant d'être déclarée effective.

## Message d'ouverture, 30 secondes

> L'adhésion au médiateur est désormais documentée et payée. En quinze minutes,
> je te montre la chaîne complète, en distinguant clairement commande, paiement,
> facture, avoir et expédition, puis les preuves runtime à fermer avant de déclarer
> l'ouverture effective.

## 1. Front et navigation, 2 minutes

À montrer après recette :

- la photo claire et complète d'Alex sur fond pourpre ;
- l'absence de coupe du visage, du boxer ou des jambes ;
- les trois coloris et le scroll sur mobile et ordinateur ;
- l'absence de débordement ou de ligne parasite.

À dire :

> Alex et le scroll sont encore en recette. Je les présenterai comme validés
> uniquement après contrôle visuel sur la version réellement déployée.

## 2. Commande, paiement, facture, avoir et e-mails, 3 minutes 30

Preuves déjà acquises :

- paiement Stripe réel de 55,03 EUR réussi ;
- commande `AJ-41B58D96CCAAE37F00B8` enregistrée comme payée ;
- stock confirmé par Jérémy : 749 unités physiques, 23 réservées cadeaux,
  726 vendables avant ouverture et 724 disponibles après cette commande.

Preuves encore à fermer :

- même statut de commande visible dans l'administration AJ Luxury ;
- confirmation de paiement reçue, visible chez Resend et réconciliée en base ;
- confirmation de commande reçue, visible chez Resend et réconciliée en base ;
- un rejeu du signal Stripe ne crée ni second mail ni second mouvement de stock ;
- après paiement confirmé, une seule facture commerciale au format
  `AJL-YYYY-NNNNNN`, accessible dans le compte client et l'administration, avec
  un rendu A4 identique des deux côtés ;
- après remboursement confirmé, un seul avoir automatique au format
  `AJL-AV-YYYY-NNNNNN`, lié à la facture inchangée et visible dans le même espace
  de facturation côté client et admin.

La distinction à expliquer sans jargon :

- la confirmation de commande dit « nous avons enregistré la commande » ;
- la confirmation de paiement dit « le règlement est confirmé » ;
- la facture est le document de vente officiel, numéroté et imprimable ;
- l'avoir est le document numéroté qui constate le montant effectivement
  remboursé sans effacer ni modifier la facture ;
- l'étiquette transporteur sert seulement à expédier le colis.

À dire :

> Le paiement et le stock ont passé l'épreuve d'une vraie commande. Nous ne
> confondons plus la commande, le paiement, la facture, l'avoir et l'étiquette :
> chacun a un rôle précis. La facturation ne sera déclarée opérationnelle que
> lorsque les mêmes numéros et le même ensemble A4 seront retrouvés côté client
> et côté administration.

## 3. Administration, facture + avoirs A4 et étiquette A4, 3 minutes 30

L'écran attendu doit permettre de voir :

- le numéro, la date, le montant et le statut de chaque commande utile ;
- l'état du paiement, des deux e-mails et de l'expédition ;
- un bouton « facture et avoirs A4 », pour les documents commerciaux AJ Luxury ;
- un bouton « étiquette A4 », distinct, pour le document Sendcloud du colis.

Accès en cours de configuration pour exactement :

- `adam.chabbi94@gmail.com` ;
- `jeremy@ajluxurystore.com` ;
- `jeremyajluxurystore@gmail.com`.

L'adresse professionnelle `jeremy@ajluxurystore.com` doit router vers
`jeremyajluxurystore@gmail.com`. Le routage des e-mails et l'autorisation de
connexion à l'administration sont deux contrôles distincts à tester.

Règles de sécurité à expliquer simplement :

- accès privé limité aux trois adresses approuvées, complété par une session courte et une protection anti-CSRF ;
- aucune facture avant confirmation Stripe du paiement ;
- une seule facture et un seul numéro par commande payée ;
- un remboursement confirmé génère automatiquement un seul avoir numéroté ;
- un remboursement ne réécrit jamais la facture : l'avoir reste distinct et lié
  à la facture d'origine ;
- une étiquette seulement pour une commande réellement payée ;
- une seule expédition par commande ;
- un second clic récupère la même étiquette au lieu de créer un doublon ;
- une réponse incertaine de Sendcloud bloque l'automatisme et demande une
  vérification humaine.

État honnête : la facture, l'avoir automatique et leur double accès client/admin
constituent un comportement cible à tester sur le candidat exact, migrations
jusqu'à `0030` incluses. Le code et les
interrupteurs d'auto-étiquette existent, mais la première commande est encore en
`provider_rejected` chez Sendcloud, sans preuve réelle d'étiquette ni de suivi.
L'administration des trois adresses ne doit être présentée comme opérationnelle
qu'après le test nominatif des trois comptes.

## 4. Sécurité et ouverture publique, 2 minutes

- le contournement P0 qui pouvait exposer le commerce a été corrigé localement ;
- ce correctif doit encore passer les tests, la recette et le déploiement
  contrôlé avant de devenir une preuve de production ;
- l'ancien blocage « médiateur absent » est résolu : la facture d'adhésion
  triannuelle payée le 1er septembre 2026 est conservée et hashée ;
- le médiateur à publier est Société Médiation Professionnelle – Médiateur de la
  consommation, Alteritae, 5 rue Salvaing, 12000 Rodez ;
- son site et le lien de saisine doivent être intégrés aux bons endroits puis
  vérifiés sur `ajluxurystore.com` avec le SHA et les IDs de déploiement.

À dire :

> Le médiateur n'est plus un document manquant. Ce qu'il reste à prouver, c'est
> que ses coordonnées exactes sont bien celles visibles sur la version réellement
> déployée. Nous ne déclarons pas l'ouverture avant cette vérification runtime.

## 5. Décisions de fin de call, 3 minutes

1. Jérémy valide-t-il le rendu final d'Alex et le scroll après démonstration ?
2. La facture d'une commande payée porte-t-elle un numéro unique, le détail exact
   et le même rendu A4 dans le compte client et l'administration ?
3. Les trois accès administrateurs sont-ils validés un par un ?
4. Une étiquette A4 réelle peut-elle être créée, téléchargée puis retrouvée sans
   créer de second colis ?
5. Les deux e-mails sont-ils reçus et réconciliés sans doublon ?
6. Un remboursement confirmé crée-t-il un seul avoir
   `AJL-AV-YYYY-NNNNNN`, lié à la facture inchangée et identique côté client/admin ?
7. Les coordonnées du médiateur sont-elles identiques dans les pages et la
   facture du candidat déployé ?
8. Une fois ces sept preuves vertes, valide-t-on la promotion publique du runtime
   exact ?

## Checklist de démonstration

| Preuve à l'écran | Résultat attendu |
|---|---|
| Accueil mobile et ordinateur | Alex complet, image claire, aucun rognage |
| Écran horizontal | Trois coloris, scroll fluide, aucun débordement |
| Santé commerce | Mode contrôlé, public fermé, aucun contournement |
| Stripe | Paiement de 55,03 EUR réussi |
| Administration | Commande, montant, paiement, e-mails et expédition cohérents |
| Stock | 724 unités disponibles après la commande |
| Boîte mail + Resend + base | Deux confirmations concordantes, sans doublon |
| Facture client + administration | Même numéro `AJL-YYYY-NNNNNN`, même contenu et même A4 |
| Remboursement + avoir | Un seul `AJL-AV-YYYY-NNNNNN`, facture inchangée, même A4 client/admin |
| Les cinq documents | Commande, paiement, facture, avoir et étiquette distincts |
| Sendcloud + administration | Même colis, même suivi, même étiquette A4 |
| Deuxième clic étiquette | Même PDF, aucun second colis |
| Accès | Trois adresses autorisées, toute autre adresse refusée |
| Pages juridiques + facture | Coordonnées exactes du médiateur et liens fonctionnels |

## Conclusion, 20 secondes

> Nous avons une vraie preuve de paiement et de stock, ainsi que la preuve payée
> du médiateur. Nous ne déclarons l'ouverture que lorsque la facture, l'avoir,
> les e-mails, l'étiquette, les accès et les coordonnées légales concordent sur
> le même runtime.
> À ce moment-là, l'ouverture repose sur des faits, pas sur une promesse.

## Checklist très courte à lire mot pour mot

- « L'adhésion au médiateur est acquise ; sa publication runtime reste à vérifier. »
- « Le paiement réel et le stock sont prouvés. »
- « Commande, paiement, facture, avoir et étiquette sont cinq objets distincts. »
- « La facture et ses avoirs doivent être numérotés et disponibles côté client et admin. »
- « Alex et le scroll seront validés seulement après la preuve visuelle finale. »
- « Nous allons tester les trois accès admin et le routage de ton adresse AJ Luxury. »
- « Nous devons encore obtenir une étiquette A4 réelle, sans doublon, et deux e-mails réconciliés. »
- « Dès que toutes ces preuves sont vertes sur le même runtime, nous validons la promotion publique. »

## Source de preuve actuelle

La preuve contrôlée la plus récente reste :
`_proofs/aj-luxury/2026-09-01-874667d/CONTROLLED-DEPLOYMENT-PROOF.md`.
Elle conserve les limites observées sur Sendcloud et les e-mails. Aucun SHA de
la prochaine version ne doit être cité avant la création et la validation du
candidat exact.
