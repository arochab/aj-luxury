# Call Jérémy, commerce contrôlé

Date : 1er septembre 2026  
Durée maximale : 15 minutes  
Objectif : montrer les faits, fermer les derniers risques et décider de la prochaine recette.  
Statut : support de call interne. Le commerce public reste fermé.

## Message d'ouverture, 30 secondes

> Le site reste volontairement fermé aux commandes publiques. En quinze minutes,
> je te montre ce qui est réellement prêt, ce qui est encore en recette et les
> preuves exactes qu'il nous manque avant l'ouverture.

## 1. Front et navigation, 2 minutes

À montrer après recette :

- la photo claire et complète d'Alex sur fond pourpre ;
- l'absence de coupe du visage, du boxer ou des jambes ;
- les trois coloris et le scroll sur mobile et ordinateur ;
- l'absence de débordement ou de ligne parasite.

À dire :

> Alex et le scroll sont encore en recette. Je les présenterai comme validés
> uniquement après contrôle visuel sur la version réellement déployée.

## 2. Paiement, commande, stock et e-mails, 3 minutes

Preuves déjà acquises :

- paiement Stripe réel de 55,03 EUR réussi ;
- commande `AJ-41B58D96CCAAE37F00B8` enregistrée comme payée ;
- stock confirmé par Jérémy : 749 unités physiques, 23 réservées cadeaux,
  726 vendables avant ouverture et 724 disponibles après cette commande.

Preuves encore à fermer :

- même statut de commande visible dans l'administration AJ Luxury ;
- confirmation de paiement reçue, visible chez Resend et réconciliée en base ;
- confirmation de commande reçue, visible chez Resend et réconciliée en base ;
- un rejeu du signal Stripe ne crée ni second mail ni second mouvement de stock.

À dire :

> Le paiement et le stock ont passé l'épreuve d'une vraie commande. Les e-mails
> ne seront déclarés validés que lorsque la boîte reçue, Resend et notre base
> afficheront la même vérité.

## 3. Administration et étiquette A4, 4 minutes

L'écran attendu doit permettre de voir :

- le numéro, la date, le montant et le statut de chaque commande utile ;
- l'état du paiement, des deux e-mails et de l'expédition ;
- un bouton pour télécharger l'étiquette A4.

Accès en cours de configuration pour exactement :

- `adam.chabbi94@gmail.com` ;
- `jeremy@ajluxurystore.com` ;
- `jeremyajluxurystore@gmail.com`.

L'adresse professionnelle `jeremy@ajluxurystore.com` doit router vers
`jeremyajluxurystore@gmail.com`. Le routage des e-mails et l'autorisation de
connexion à l'administration sont deux contrôles distincts à tester.

Règles de sécurité à expliquer simplement :

- accès privé avec authentification forte ;
- une étiquette seulement pour une commande réellement payée ;
- une seule expédition par commande ;
- un second clic récupère la même étiquette au lieu de créer un doublon ;
- une réponse incertaine de Sendcloud bloque l'automatisme et demande une
  vérification humaine.

État honnête : le code et les interrupteurs d'auto-étiquette existent. La
première commande est toutefois encore en `provider_rejected` chez Sendcloud,
sans preuve réelle d'étiquette ni de suivi. L'administration des trois adresses
est en cours et ne doit pas encore être présentée comme opérationnelle.

## 4. Sécurité et ouverture publique, 2 minutes

- le contournement P0 qui pouvait exposer le commerce a été corrigé localement ;
- ce correctif doit encore passer les tests, la recette et le déploiement
  contrôlé avant de devenir une preuve de production ;
- Jérémy a choisi un médiateur et signé la convention ;
- les coordonnées officielles sont attendues cet après-midi ;
- elles devront être publiées aux bons endroits puis vérifiées avant toute
  décision d'ouverture publique.

À dire :

> La convention signée est une avancée importante, mais le gate juridique est
> fermé seulement après réception, publication et contrôle des coordonnées. Le
> site reste donc commandable uniquement dans notre parcours contrôlé.

## 5. Décisions de fin de call, 3 minutes 30

1. Jérémy valide-t-il le rendu final d'Alex et le scroll après démonstration ?
2. Jérémy transmet-il aujourd'hui la convention et les coordonnées du médiateur ?
3. Les trois accès administrateurs et l'authentification forte sont-ils validés
   un par un ?
4. Une étiquette A4 réelle peut-elle être créée, téléchargée puis retrouvée sans
   créer de second colis ?
5. Les deux e-mails sont-ils reçus et réconciliés sans doublon ?
6. Une fois ces cinq preuves vertes, planifie-t-on la recette finale d'ouverture ?

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
| Sendcloud + administration | Même colis, même suivi, même étiquette A4 |
| Deuxième clic étiquette | Même PDF, aucun second colis |
| Accès | Trois adresses autorisées, toute autre adresse refusée |
| Pages juridiques | Coordonnées du médiateur présentes après réception |

## Conclusion, 20 secondes

> Nous avons une vraie preuve de paiement et de stock. Nous gardons le public
> fermé tant que la photo, les e-mails, l'étiquette A4, les trois accès admin et
> le médiateur ne sont pas tous prouvés sur la version déployée. À ce moment-là,
> on pourra décider de l'ouverture sur des faits, pas sur une promesse.

## Checklist très courte à lire mot pour mot

- « Le commerce public reste fermé pendant cette recette. »
- « Le paiement réel et le stock sont prouvés. »
- « Alex et le scroll seront validés seulement après la preuve visuelle finale. »
- « Nous allons tester les trois accès admin et le routage de ton adresse AJ Luxury. »
- « Nous devons encore obtenir une étiquette A4 réelle, sans doublon, et deux e-mails réconciliés. »
- « Dès que les coordonnées du médiateur sont publiées et que toutes ces preuves sont vertes, nous décidons ensemble de l'ouverture. »

## Source de preuve actuelle

La preuve contrôlée la plus récente reste :
`_proofs/aj-luxury/2026-09-01-874667d/CONTROLLED-DEPLOYMENT-PROOF.md`.
Elle conserve les limites observées sur Sendcloud et les e-mails. Aucun SHA de
la prochaine version ne doit être cité avant la création et la validation du
candidat exact.
