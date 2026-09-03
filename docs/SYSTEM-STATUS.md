# AJ Luxury — état opérationnel courant

Statut : `SOURCE DE STATUT COURANTE — À METTRE À JOUR APRÈS CHAQUE RELEASE`

Dernière vérification consignée : 3 septembre 2026

## Verdict

La production est actuellement **ouverte au public**. Le 3 septembre 2026,
l'endpoint de santé du domaine officiel répond `ready`, `mode=live`,
`publicCommerce=true`, sans blocage, pour la release `1d2c899`. Le paiement, la
livraison, l'expédition automatique, les e-mails transactionnels et les zones
France/UE, Royaume-Uni, États-Unis, Canada et Golfe sont déclarés actifs par ce
runtime.

Le nouveau parcours Admin sans Cloudflare ni double authentification est validé localement mais
**n'est pas encore déployé**. Il ne faut donc pas encore demander à Adam ou
Jérémy de s'inscrire sur `/admin` avant la publication du nouveau SHA approuvé.

## Production actuellement prouvée

| Élément | Valeur vérifiée |
|---|---|
| Domaine | `https://ajluxurystore.com` |
| Endpoint de santé | `https://ajluxurystore.com/api/commerce/health` |
| SHA déclaré | `1d2c89977b5e838333e9a3bac04c9d6a17c0903a` |
| Worker/Assets | `02c41385-7be6-47da-9e83-5b5a9304500d` |
| Déploiement Cloudflare | `7737ed51-043b-4cb5-a5e5-a36434a93e1f` |
| Mode commerce | `live` |
| Commande publique | `true` |
| Zones actives | `EU`, `UK`, `US`, `CA`, `GCC` |
| Paiement réel | `true` |
| Livraison réelle | `true` |
| Création automatique d’expédition | `true` |
| Blocages déclarés par le runtime | aucun |

Conséquence : le commerce peut recevoir des commandes publiques. Cela ne
transforme toutefois pas l'étiquette manquante de la première commande en faux
succès : cette action réelle reste à effectuer une seule fois avec Jérémy.

## Candidat en cours — ne pas confondre avec la production prouvée

Le candidat en cours remplace le parcours Cloudflare destiné aux humains par un
parcours AJ Luxury simple : création du compte, confirmation par e-mail et
connexion à `/admin`. Seules les trois adresses suivantes peuvent ouvrir
l'Admin :

- `adam.chabbi94@gmail.com` ;
- `jeremy@ajluxurystore.com` ;
- `jeremyajluxurystore@gmail.com`.

Il n'exige ni double authentification, ni clé physique, ni écran Cloudflare. Il conserve une session
courte, refuse toute autre adresse et enregistre les actions sensibles.

Le code et les tests du candidat ne modifient pas à eux seuls l'état de la
production décrit dans le tableau ci-dessus.

## Première commande réelle

| Élément | État |
|---|---|
| Commande | `AJ-41B58D96CCAAE37F00B8` |
| Paiement | confirmé par Stripe, 55,03 EUR |
| Facture | `AJL-2026-000001` |
| Stock | 2 unités vendues comptabilisées dans la base courante |
| Expédition | échec fournisseur historique, sans référence colis, tracking ni étiquette |
| Cause opératoire | téléphone destinataire absent du snapshot historique |
| Correction déployée | saisie du téléphone au format international par Jérémy, autorisation utilisable une seule fois, sans créer un second colis |

Repères à ne jamais mélanger :

- téléphone public AJ Luxury / Jérémy : `+33 6 88 42 40 62` (`+33688424062`) ;
- téléphone acheteur/destinataire d’Adam pour cette commande uniquement :
  `06 59 00 60 25` (`+33659006025`).

Le numéro de Jérémy ne doit jamais remplacer le numéro du destinataire sur
l’étiquette de cette commande.

La correction ne modifie jamais l’adresse payée. Elle fournit uniquement le
téléphone exigé par le transporteur. Si le résultat fournisseur devient ambigu,
le système interdit un second clic afin d’éviter une seconde étiquette et une
double facturation.

## Stock courant de référence

| Mesure | Quantité |
|---|---:|
| Physique | 749 |
| Réservé cadeaux | 23 |
| Vendu | 2 |
| Disponible | 724 |

Le détail des douze variantes se trouve dans le manifeste stock. Après
déploiement du candidat, l’écran Admin lit ces valeurs directement depuis la base de données ;
il devient alors la source opérationnelle quotidienne.

## Fonctions de la production actuelle

- paiement public réel et commandes ;
- livraison France/UE et hors UE sur les zones listées plus haut ;
- création automatique d'une seule expédition par commande payée ;
- e-mails transactionnels et e-mail opérateur avec étiquette A4 lorsqu'elle est
  réellement disponible ;
- stock, factures, avoirs et codes promo ;
- relance exceptionnelle de la première expédition, une seule fois.

## Recette du candidat Admin simple

| Contrôle | Résultat |
|---|---|
| `APP_ENV=production npm run lint` | PASS |
| Build production et frontières analytics | PASS |
| Admin, commerce, stock, promotions, factures et étiquettes | PASS, 234/234 |
| Les trois adresses Admin exactes sont acceptées | PASS |
| Un client confirmé hors liste est refusé | PASS |
| Rendu desktop/mobile, traductions et cadrage produits | PASS, 67/67 |
| Règles géographiques et sécurité complémentaires | PASS, 22/22 |
| `git diff --check` | PASS |
| Santé publique relue le 3 septembre | PASS, `ready`, `live`, `publicCommerce=true`, aucun blocage |

Ces tests n’appellent pas les comptes réels Stripe, Sendcloud ou Resend et
n’achètent aucune étiquette. La preuve terrain reste donc distincte.

## Ce qui reste à faire, dans l’ordre

1. Geler le nouveau candidat sous un SHA, obtenir les accords exacts d'Adam et de
   Jérémy, puis le déployer sans modifier l'ouverture publique existante ;
2. Adam crée et confirme son compte AJ Luxury avec
   `adam.chabbi94@gmail.com`, puis vérifie visuellement `/admin` ;
3. pendant l'appel, Jérémy crée et confirme son compte avec l'une des deux
   adresses prévues, puis ouvre `/admin` ;
4. il ouvre `AJ-41B58D96CCAAE37F00B8`, vérifie la commande et saisit une seule
   fois le téléphone de l’acheteur/destinataire Adam `+33659006025` ; ce n’est
   pas son propre numéro professionnel `+33688424062` ;
5. Jérémy déclenche l’unique relance, télécharge l’étiquette et l’imprime en A4 ;
6. après dépôt physique, il conserve la preuve et confirme la remise dans Admin ;
7. il vérifie ensuite le premier scan et le suivi transporteur.

## International

Le runtime public déclare actuellement `EU`, `UK`, `US`, `CA` et `GCC` actifs.
Pour chaque commande hors UE, le tarif doit néanmoins être obtenu réellement au
moment du panier. Une destination sans tarif exploitable doit être refusée avant
paiement ; elle ne doit jamais recevoir un prix inventé.
