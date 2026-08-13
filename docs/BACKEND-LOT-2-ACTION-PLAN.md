# AJ Luxury — plan d’action lean du socle 2 commerce

Statut : `CURRENT PLAN — PRÉPRODUCTION UNIQUEMENT — AUCUNE OUVERTURE DES VENTES`

Date : 10 août 2026

Owner de la livraison : Adam CHABBI

Décideur métier : AJ Luxury, représentée opérationnellement par Jérémy SCHEPPLER

## Verdict

Le socle 2 est le **backend e-commerce complet**, pas un lot analytics : catalogue,
stocks par variante, panier, paiement, commandes, comptes clients, administration,
livraison France et internationale, retours, remboursements, e-mails, RGPD, cookies,
mesure d’audience, exploitation, documentation et réversibilité.

La cible est une petite boutique premium fiable, pas Amazon. Le plan retient donc une
architecture volontairement simple :

- une seule application ;
- une seule base de données ;
- une seule origine de stock au lancement ;
- un paiement hébergé par un prestataire ;
- un service de livraison couvrant les zones retenues ;
- un service d’e-mails transactionnels ;
- une administration sobre ;
- une mesure d’audience légère et respectueuse du consentement.

Aucun microservice, moteur fiscal ou douanier maison, multi-entrepôts, système de fraude
sur mesure, data platform ou marketing automation avancée.

Décision d’Adam du 10 août 2026 : **Shopify est exclu**.

Le socle retenu reste indépendant et proportionné : API commerce et base relationnelle
sur Cloudflare, paiement sur une page hébergée par le prestataire, espace client
passwordless, administration minimale protégée, e-mails transactionnels et connecteur
de livraison standard. Le frontend AJ Luxury actuel reste intact. Tous les comptes,
données et moyens d’encaissement restent au nom d’AJ Luxury ; chaque prestataire payant
ou compte marchand doit être validé par Jérémy avant activation.

## Faits et décisions encore ouvertes

### Faits

- Apollon comporte 3 coloris × 4 tailles, soit 12 combinaisons de stock, pas 12 produits.
- Le prix validé est de 29,99 €.
- Le stock physique transmis totalise 756 unités : Pourpre 26/103/87/36,
  Rose 26/103/87/36 et Lilas 26/102/88/36, dans l’ordre S/M/L/XL.
- Les 12 références internes sont générées par l’application à partir du modèle, du
  coloris et de la taille. Aucun SKU ni EAN n’est demandé à Jérémy.
- Les zones de lancement validées sont l’Union européenne, le Royaume-Uni, les
  États-Unis et le Canada.
- L’adresse d’expédition et de retour retenue par Adam est l’adresse contractuelle
  d’AJ Luxury : 3 A rue Principale, 67130 Belmont.
- Le site actuel simule le compte, le panier et le paiement : aucune commande, aucun
  paiement, aucun stock ou transporteur réels ne sont encore connectés.
- La production reste en lecture seule. Tout le socle 2 sera construit et recetté dans
  un environnement distinct.

### Seuls apports encore attendus d’AJ Luxury

- Quantités à isoler pour cadeaux/influenceurs et réserve de sécurité.
- Poids/dimensions du colis prêt à partir, pays de fabrication,
  étiquettes physiques, entretien, guide des tailles et scellé d’hygiène.
- KYC/RIB des comptes commerce ouverts au nom d’AJ Luxury, sans partage de mot de passe.
- Numéro public de contact, médiateur de la consommation et validation comptable des
  règles TVA/EORI applicables aux zones ouvertes.
- Par défaut, le public voit `disponible / stock faible / épuisé`, jamais le stock exact.

## Worldwide, sans usine à gaz

Le backend accepte des adresses internationales et applique une matrice simple pour les
zones de lancement : Union européenne, Royaume-Uni, États-Unis et Canada. Toute autre
destination reste désactivée jusqu’à décision ultérieure.

Une destination n’est activée que si AJ Luxury a validé :

- le transporteur et le service ;
- le tarif ou la règle de calcul ;
- le délai indicatif et le suivi ;
- les poids et dimensions ;
- l’adresse d’expédition et de retour, déjà fixée à Belmont sauf correction expresse ;
- le pays d’origine et le code douanier ;
- la règle DAP/DDP ou équivalente, les droits et taxes à annoncer ;
- les restrictions produit, paiement ou adresse.

L’architecture est mondiale ; l’activation opérationnelle se fait par zones validées.
Une destination incomplète reste désactivée. Les DOM/COM et territoires fiscalement
particuliers ne sont pas assimilés automatiquement à la France métropolitaine ou à
l’Union européenne.

Le prestataire retenu produit les devis, étiquettes, suivis et documents douaniers qu’il
prend en charge. AJ Luxury fait valider par son conseil les règles de TVA, OSS, EORI,
REP, droits et taxes applicables. Adam n’implémente pas un moteur fiscal ou douanier.

Pour chaque zone hors Union européenne activée, AJ Luxury conserve les documents
douaniers et preuves de sortie fournis par le prestataire, ainsi que les justificatifs
nécessaires en cas de retour international. Cette conservation et le traitement des
exceptions peuvent rester manuels au lancement.

## Le cœur commerce minimal

### Données

Le modèle reste compact :

- produits, variantes, prix ;
- stock, mouvements et réservations ;
- clients et adresses ;
- paniers et lignes ;
- commandes et lignes figées au moment de l’achat ;
- paiements, événements reçus et remboursements ;
- devis de livraison, colis, suivi et retours ;
- e-mails à envoyer et statut d’envoi ;
- administrateurs et journal des actions sensibles.

Les montants sont stockés en centimes avec la devise, les dates en UTC et les pays en
codes ISO. La commande conserve le produit, le prix, l’adresse, la livraison, les taxes,
la langue et la version des CGV acceptées.

### Stock

- Le stock est géré par variante.
- Les catégories sont `SELLABLE`, `GIFTING`, `SAFETY` et `REPLENISHMENT` ; le réassort
  attendu ne compte jamais comme disponible.
- Avant paiement, la quantité est réservée temporairement de façon atomique.
- Après paiement serveur confirmé, elle devient vendue ; après échec ou expiration, elle
  est libérée.
- Chaque ajustement est tracé avec le motif et l’administrateur.
- Un retour ne revient en stock vendable qu’après inspection.
- Le stock de démonstration ne peut pas initialiser la production : Jérémy valide un
  import des 12 variantes.

Si un paiement confirmé arrive après expiration, le serveur tente une nouvelle
allocation. Si l’article n’est plus disponible, il déclenche une annulation ou un
remboursement idempotent, une notification et une alerte. Aucune survente silencieuse.

### Paiement et commande

- Le serveur recalcule produit, quantité, livraison, taxes et total.
- Le lancement privilégie une page de paiement entièrement hébergée par le prestataire ;
  AJ Luxury ne reçoit aucune donnée de carte.
- La page « succès » ne marque jamais une commande payée.
- La création de commande, de session de paiement et de remboursement utilise une clé
  d’idempotence stable ; une reprise réseau ne crée ni doublon ni seconde facturation.
- Avant application, le serveur vérifie la signature de l’événement, l’environnement
  test/live, le compte marchand, son identifiant, la commande, le montant et la devise.
  L’événement est enregistré une seule fois et appliqué de façon idempotente.
- Un petit contrôle périodique réconcilie les paiements en attente ou manqués avec le
  prestataire.
- Les remboursements partiels et totaux sont tracés et ne peuvent dépasser le montant
  encaissé.

Les états paiement, commande, expédition et retour restent séparés pour éviter les
incohérences, sans construire un moteur de workflow générique.

### Compte client et administration

Le socle inclut un compte client. La décision de Jérémy porte sur son caractère
facultatif ou obligatoire au checkout. Le compte couvre : identité, adresses, historique
des commandes, récupération d’accès et suppression/demande de droits.

Le lancement privilégie le checkout invité avec compte facultatif et, lorsque possible,
une identité gérée par le service retenu. Aucun système de mot de passe maison ni
back-office complet n’est développé sans besoin validé. Les sessions restent sécurisées,
révocables et contrôlées côté serveur.

L’administration couvre seulement : produits/prix, stock, commandes, expéditions,
retours, remboursements et consultation client nécessaire. Les administrateurs sont
nommés, utilisent MFA et disposent de droits simples à valider, par exemple `Owner` et
`Operations`. Chaque accès à une commande appartient au bon client ; chaque action
sensible est contrôlée côté serveur et journalisée.

### E-mails

E-mails transactionnels minimaux : confirmation de commande, paiement, expédition et
suivi, retour/rétractation, remboursement et récupération de compte. Les échecs sont
rejouables sans recréer la commande. Le domaine d’envoi est configuré avec SPF, DKIM et
DMARC. Newsletter et marketing restent hors activation initiale.

### RGPD, cookies et analytics

- Un registre court relie chaque donnée à sa finalité, sa base légale, sa durée, ses
  destinataires et sa suppression.
- AJ Luxury documente son rôle et celui de chaque prestataire, ainsi que la version et
  la preuve du consentement lorsqu’il est requis. Les données conservées pour une
  obligation comptable ou juridique sont séparées des données supprimables du compte.
- La confidentialité, les sous-traitants, les transferts et la procédure de violation
  sont documentés avant collecte réelle.
- Export, rectification et suppression sont testés, sans supprimer les pièces que la loi
  impose de conserver.
- Cookies, `localStorage` et `sessionStorage` sont inventoriés.
- Si l’outil analytics exige un consentement, accepter et refuser sont présentés au même
  niveau et aucune requête ne part avant l’accord.
- Les événements analytics sont allowlistés, sans nom, e-mail, adresse, texte libre ni
  numéro de commande brut. L’analytics ne bloque jamais le checkout.
- Le lancement se limite à une courte liste d’événements directement utiles au pilotage,
  sans profil marketing ni historique individuel. Une indisponibilité analytics ne
  bloque jamais les ventes ; une activation non conforme reste interdite.
- `order_paid` vient du paiement serveur réconcilié ; son éventuel envoi analytics suit
  la politique de consentement retenue.

Pixels publicitaires, replay de session, CDP, A/B testing et profils marketing sont
exclus du lancement.

## Quatre phases, pas huit projets parallèles

Les spécialités travaillent en parallèle à l’intérieur de chaque phase, mais les phases
restent séquentielles.

### Phase 0 — décisions client et choix des prestataires

1. Fixer les réserves cadeaux/influenceurs et sécurité sur le stock déjà transmis.
2. Compléter les informations colis, étiquettes, fabrication, entretien et tailles.
3. Valider les prestataires de paiement, livraison et e-mail, ainsi que leurs coûts.
4. Finaliser transport, droits/taxes, retours, médiateur et validation comptable.
5. Créer les comptes retenus au nom d’AJ Luxury, avec MFA et récupération.

**Gate :** aucune intégration réelle tant que les décisions et propriétaires de comptes
ne sont pas écrits.

### Phase 1 — cœur commerce en local/test

1. Créer le schéma et les migrations.
2. Importer le catalogue et le stock validés.
3. Implémenter panier serveur, réservation de stock, commande, compte client et
   administration minimale.
4. Ajouter journal d’actions, sauvegarde et restauration.
5. Tester concurrence, permissions, migrations et restauration.

**Gate :** aucun stock négatif, aucun accès croisé, restauration démontrée.

### Phase 2 — intégrations sandbox

1. Connecter paiement, livraison et e-mails en mode test.
2. Connecter retours, rétractation et remboursements.
3. Finaliser textes légaux, cookies et mesure d’audience.
4. Tester France, UE, hors UE desservi et destination exclue.

**Gate :** paiement autorisé/refusé/remboursé, stock cohérent, e-mails reçus et parcours
mondial recetté sans argent réel.

### Phase 3 — préproduction puis ouverture contrôlée

La préproduction Cloudflare est une copie exacte sur une URL séparée et protégée, avec
ses propres secrets, comptes sandbox et données de test. Elle ne modifie ni
`ajluxurystore.com`, ni son DNS, ni ses données.

Après recette, Adam valide la version exacte, puis Jérémy valide cette même version. Le
SHA du code, le digest du build, la configuration, la migration et le rollback sont
liés au procès-verbal. Seul ce paquet est ensuite promu ; smoke tests immédiats et
retour arrière prêt.

Avant la préproduction, la fréquence et la conservation des sauvegardes sont fixées.
Un rollback applicatif n’est autorisé que si l’ancienne version reste compatible avec
le schéma courant. Aucune migration descendante destructive n’est exécutée sur des
données commerce actives sans sauvegarde et restauration vérifiée.

**Gate :** sans les deux validations rattachées à la version exacte, aucune production.

## Décisions à obtenir de Jérémy

1. Réserve cadeaux/influenceurs et sécurité à soustraire des 756 unités physiques.
2. Poids/dimensions colis, fabrication, étiquettes, entretien,
   guide des tailles et scellé d’hygiène.
3. Accord sur les prestataires retenus et création/KYC des comptes AJ Luxury.
4. Numéro public, médiateur et validation comptable TVA/EORI pour les zones ouvertes.
5. Approbation finale des tarifs/délais de livraison, droits/taxes et retours proposés
   par Adam à partir de la matrice UE/Royaume-Uni/États-Unis/Canada.

Pour chaque zone réellement activée, les professionnels compétents confirment par écrit
les règles fiscales et douanières, TVA/OSS/EORI, REP, protection impérative du
consommateur, sécurité produit, étiquetage textile et langues obligatoires. Aucun audit
n’est requis pour une zone qui reste désactivée.

## Tests veto avant ventes réelles

- Deux clients sur la dernière unité : une seule vente.
- Double clic ou nouvelle tentative : aucune double commande ou double facturation.
- Événement paiement faux, dupliqué, retardé ou manqué : état final réconcilié.
- Page succès sans confirmation serveur : commande non payée.
- Paiement tardif avec et sans stock restant : traitement prévu, aucun stock négatif.
- Paiement autorisé, refusé, action supplémentaire, remboursement partiel et total.
- Prix, livraison ou quantité modifiés dans le navigateur : recalcul serveur.
- France, UE, hors UE desservi, adresse invalide et destination exclue.
- Chaque zone réellement activée est recettée ; une zone incomplète reste impossible à
  commander, y compris un territoire à régime particulier.
- Une commande test hors UE produit les documents attendus et permet d’archiver la
  preuve de sortie ; un retour international suit la procédure du prestataire.
- Les fiches et étiquettes présentent les informations produit et les langues obligatoires
  pour les zones activées.
- Droits, taxes, délai et responsabilité import clairement affichés selon la règle retenue.
- Retour/rétractation sans compte avec accusé durable ; remise en stock après inspection.
- Un client ne peut jamais lire la commande d’un autre ; admin et récupération protégés.
- Aucun secret, carte, quantité interne ou donnée personnelle interdite dans le client ou
  les logs.
- Aucun traceur non essentiel avant consentement ; refus/retrait réellement respectés.
- Échec e-mail ou livraison sans corruption de la commande.
- Sauvegarde, restauration, export client et rollback applicatif démontrés.

Un seul échec conserve le statut `NO-GO`.

## Exploitation minimale

- alertes sur paiements bloqués, stock incohérent, e-mails en échec et commandes sans
  suivi ;
- logs expurgés des données sensibles ;
- secrets séparés test/production et rotatifs ;
- sauvegarde automatique et restauration testée ;
- procédure courte : rembourser, corriger le stock, renvoyer un e-mail, suspendre une
  destination, revenir à la version précédente ;
- documentation et comptes remis à AJ Luxury.

## Évolutions séparées

Multi-entrepôts, automatisation douanière avancée, calcul fiscal maison, marketplace,
abonnements, fidélité, promotions complexes, antifraude sur mesure, marketing avancé ou
intégrations supplémentaires seront traités séparément si un besoin réel apparaît.

## Évaluation honnête

- Qualité du plan : `9,7/10 — PASS CONCEPTION` au jury final multi-spécialités.
- Notes minimales : commerce/stock/paiement `9,7`, international/juridique `9,6`,
  identité/RGPD/analytics/SRE `9,6`, proportionnalité petite marque `9,7`.
- Preuve terrain du backend : `0/10` jusqu’à l’exécution des parcours connectés en
  préproduction.
- Le frontend validé ne constitue pas une preuve du paiement, du stock, de la livraison
  ou de la conformité du backend.
