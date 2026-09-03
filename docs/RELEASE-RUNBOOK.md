# AJ Luxury — release and rollback runbook

## Registre des gates — 2 septembre 2026

Ce document est la source opératoire canonique. État du candidat au moment de
sa rédaction : **CODE VALIDÉ LOCALEMENT, NON DÉPLOYÉ, PREUVES TERRAIN NON
ACQUISES**. Un test local ou une capture d'écran ne clôt jamais un gate terrain.
Chaque preuve doit porter le SHA exact, l'identifiant de version Worker/Sites,
l'identifiant de commande concerné et un horodatage UTC.

Le mode opératoire quotidien de Jérémy est volontairement séparé et plus court :
`docs/JEREMY-ADMIN-GUIDE.md`.

### Verdict courant

Le blocage documentaire « médiateur non contracté » est **résolu depuis le
1er septembre 2026** par la preuve conservée sous
`docs/legal/mediation/mediator-source-2026-09-01.pdf` et documentée dans
`docs/legal/mediation/README.md`. Les coordonnées sont intégrées au candidat ;
l'ouverture publique n'est toutefois pas déclarée acquise avant déploiement et
preuve sur le runtime exact. Un déploiement strictement
`controlled` peut être instruit séparément, mais il doit rester fermé par
l'authentification propre au site, sans écran Cloudflare pour Adam ou Jérémy.
La session Wrangler a de nouveau accès à D1 en lecture/écriture et
le bookmark Time Travel a pu être lu le 1er septembre 2026 ; les migrations
jusqu'à `0032` ne sont néanmoins pas présentées comme exécutées tant que leur
reçu distant n'existe pas. La commande payée `AJ-41B58D96CCAAE37F00B8` prouve le
paiement Stripe de 55,03 EUR, mais ne prouve pas encore les deux confirmations
e-mail, l'étiquette A4 imprimée, la remise physique au transporteur ni le suivi.

### Registre MECE

| Gate | Statut | Owner / approbateurs | Système et action exacte | État attendu et preuve conservée | STOP et récupération |
| --- | --- | --- | --- | --- | --- |
| Candidat code | OUVERT | Adam | Geler un commit contenant ce runbook, les migrations jusqu'à `0032` et les correctifs ; exécuter `APP_ENV=production npm test`, `npm run lint` et `git diff --check` sur ce commit | SHA unique + reçu complet des trois commandes lié à ce SHA | Toute modification invalide le reçu ; nouveau SHA et nouvelle recette |
| Autorisation de mutation contrôlée | OUVERT après candidat | Adam puis Jérémy | Présenter l'URL de preview, le SHA et la checklist de recette ; recueillir deux textes « j'approuve le déploiement contrôlé ... SHA ... » | Les deux accords datés citent le même SHA ; ils n'approuvent ni la recette visible ni le passage live | Sans les deux accords : aucune mutation Cloudflare, D1, Sendcloud ou Resend |
| Sauvegarde et migration D1 | PRÊT À EXÉCUTER APRÈS APPROBATION DU SHA | Adam | Exécuter les commandes du § « D1 jusqu'à 0032 » sur `aj-luxury-production` | Bookmark, export schéma, reçu d'application et inventaire exact des factures, avoirs, autorisations de relance et e-mails opérateur | Erreur d'accès/SQL ou inventaire divergent : STOP avant Worker |
| Ré-attestation stock | BLOQUÉ PREUVE | Jérémy (stock) / Adam (runtime) | Jérémy confirme directement le manifeste 749 physiques / 23 cadeaux / 726 vendables ; Adam vérifie D1 et lie manifeste/hash au runtime | Accord direct daté + manifeste/hash + requête D1 après migration | Aucun accord direct ou D1 illisible : ne pas importer/réécrire le stock |
| Ré-attestation fournisseurs | BLOQUÉ PREUVE | Adam | Stripe : compte + mode live ; Sendcloud : intégration + expéditeur ; Resend : domaine + expéditeur. Relever les identités publiques dans chaque dashboard | Capture expurgée datée + identité publique + SHA/Worker ID ; aucun secret | Toute identité divergente : STOP et nouvelle qualification |
| Worker contrôlé | OUVERT après D1 | Adam | Déployer le Worker en `controlled`, import stock fermé, authentification applicative fail-closed ; l'automatisation d'étiquette n'est prête que si `OUTBOUND_SHIPMENT_CREATION_ENABLED=true` **et** `AUTOMATIC_OUTBOUND_SHIPMENT_ENABLED=true` | Worker ID, SHA/tag, santé exacte du § « Vérification » et preuve locale sans dépense des deux verrous | Santé non ready, bypass edge actif ou un seul flag d'étiquette : restaurer le Worker ID précédent ; garder les migrations additives et ne créer aucun colis |
| Front Sites | OUVERT après Worker | Adam | Déployer le build du même SHA sans ouvrir `live` | Sites ID, marqueur release et recette desktop/mobile | Régression : restaurer le Sites ID précédent sans toucher au Worker |
| Validation fonctionnelle visible | OUVERT après Sites | Jérémy / Adam témoin | Sur l'URL contrôlée : accueil, compte, panier, livraison, paiement et compte client ; cocher la checklist | Validation datée de la version visible (SHA + Worker ID + Sites ID), distincte de l'autorisation de mutation | Un écart : corriger sous un nouveau SHA ; les accords précédents deviennent caducs |
| Webhook Sendcloud | OUVERT TERRAIN | Adam | Sendcloud intégration `612109` : test signé vers `/api/commerce/webhooks/sendcloud`; conserver un fixture expurgé ne contenant que IDs internes, statut et horodatages, puis rejouer exactement ses octets et sa signature dans la fenêtre valide | 1er appel `applied`; retry différé `duplicate`; statut inconnu signé = 503 retryable | Signature/route inconnue : désactiver le webhook et garder la commande `preparing` |
| Confirmation commande | BLOQUÉ PREUVE | Adam | Resend > Emails : retrouver le message « Commande reçue » pour `AJ-41B58D96CCAAE37F00B8`; rapprocher ce message depuis l'Admin avec son identifiant Resend. L'appel technique correspondant passe par `POST /api/commerce/management/email-outbox/{outboxId}/reconcile` et exige la session administrateur, la protection d'origine et la protection contre un double envoi | Evidence ID immuable propre à `order_confirmation`, événement `delivered/opened/clicked`; aucun renvoi | Aucun provider ID exact ou contenu divergent : ne pas rejouer ni modifier l'historique |
| Confirmation paiement | BLOQUÉ PREUVE | Adam | Même route owner-only, avec l'outbox `payment_confirmation` et son propre provider ID Resend | Evidence ID immuable propre au paiement ; elle ne vaut jamais pour la confirmation commande | ID absent/divergent : ne pas modifier l'outbox historique |
| Facture commerciale A4 | OUVERT PRODUIT/RUNTIME | Adam (implémentation et preuve) / Jérémy (validation métier) | Après signal Stripe confirmé, attribuer une seule facture à la commande payée, avec numéro continu `AJL-YYYY-NNNNNN`; exposer le même document au client dans son compte et à l'administrateur dans la commande | Numéro unique et chronologique, date, vendeur, acheteur, lignes, remise, livraison, total, statut payé, mention fiscale et médiateur ; téléchargement/impression A4 identiques côté client et admin | Une confirmation e-mail, un récapitulatif de commande ou une étiquette transporteur ne remplace jamais la facture ; résultat ambigu ou doublon = STOP et revue manuelle |
| Avoir commercial A4 | OUVERT PRODUIT/RUNTIME | Adam (implémentation et preuve) / Jérémy (validation métier) | Après remboursement Stripe confirmé, générer atomiquement un avoir unique `AJL-AV-YYYY-NNNNNN`, lié à la facture d'origine, puis l'ajouter au même espace facturation côté client et admin | Un avoir par remboursement réussi, numéro continu, facture d'origine, montant crédité, solde restant, snapshots légaux immuables et rendu A4 identique côté client/admin | Aucun avoir sur remboursement non confirmé ; si la génération échoue, la transition backend s'arrête et part en revue manuelle, sans numéro consommé ni faux statut réussi |
| Paiement + détail + étiquette par e-mail | OUVERT PRODUIT, PREUVE PRODUCTION REQUISE | Jérémy / Adam | Après paiement et disponibilité des documents, envoyer une seule fois à `jeremy@ajluxurystore.com` un message contenant le paiement reçu, les lignes à préparer, les montants et l'étiquette A4 ; joindre aussi le document douanier A4 hors UE | Reçu Resend, contenu exact, 1 PDF UE ou 2 PDF hors UE, hash et idempotence par shipment ; l'Admin reste un secours de réimpression | Aucun document disponible ou issue ambiguë : ne pas affirmer l'envoi, ne pas créer un second shipment et conserver l'item en reprise bornée |
| Étiquette A4 et colis réel | BLOQUÉ TERRAIN | Jérémy | Après paiement, le site crée automatiquement l'unique expédition. Jérémy reçoit le mail opérationnel, vérifie le contenu et imprime l'étiquette A4 à 100 %. `/admin` permet le suivi et la réimpression de secours. Le seul ordre historique sans téléphone dispose d'une relance administrateur, consommable une fois, qui ne modifie que le téléphone transporteur | PDF A4, empreinte du fichier, impression lisible, scan du code-barres et historique ; une relance historique prouve une autorisation consommée exactement une fois | Réponse fournisseur inconnue : aucune seconde création ; le bouton disparaît et impose de vérifier l'unique expédition associée à la commande |
| Remise transporteur et suivi | BLOQUÉ TERRAIN | Jérémy | Jérémy remet le colis, conserve le reçu puis clique `Confirmer la remise` dans `/admin`. Le premier scan signé prend ensuite le relais | Premier état attendu `in_transit`; commande `shipped`; exactement un mail expédition | Pas de dépôt physique ou pas de reçu : conserver `preparing` et ne pas confirmer la remise |
| Retour, réception et remboursement | BLOQUÉ TERRAIN | Jérémy (réception/inspection) / Adam (actions protégées) | Client : `/shipping-returns` puis `POST /api/commerce/returns`; Adam : approve/inspect owner-only ; créer l'étiquette retour via Sendcloud, tracer la remise/retour reçu, calculer articles reçus + règle de frais, puis rembourser une fois via Stripe sous 14 jours | IDs demande/étiquette/scan/réception/refund, montant calculé, stock et mail cohérents | Étiquette retour ou remboursement non câblé : gate reste NO-GO public ; aucune reprise aveugle |
| Comptes administrateurs | OUVERT PRODUIT/RUNTIME | Adam | `/admin` accepte uniquement les trois adresses nommées au § « Controlled runtime matrix ». Chaque personne crée d'abord son compte AJ Luxury, confirme son adresse par e-mail, puis se connecte avec son mot de passe. Aucun MFA, aucune clé physique et aucun écran Cloudflare | Les trois adresses autorisées peuvent ouvrir l'Admin ; toute autre adresse est refusée ; chaque ouverture de session est inscrite dans l'historique sans enregistrer le mot de passe | Une liste différente de ces trois adresses, un compte non confirmé ou un contrôle absent garde l'Admin fermé |
| Monitoring | REPORTÉ PAR DÉCISION D’OUVERTURE | Adam (principal) / Jérémy (suppléant seulement après accord direct) | Alertes : health non-ready 2 min, taux 5xx >1 %/5 min, webhook 4xx/5xx >=1, cron absent >5 min ; canal e-mail Adam + copie Jérémy après son accord ; injecter pour chaque règle un signal synthétique non transactionnel | Pour chaque alerte : rule ID Cloudflare + signal injecté + événement créé par cette règle + livraison + acquittement + evidence ID ; alors `MONITORING_ALERTS_APPROVED=true`. L’ouverture anticipée utilise à la place un `COMMERCE_PUBLIC_LAUNCH_RISK_ACCEPTANCE_ID` explicite et traçable, sans prétendre que la recette a eu lieu. | Toute alerte reste à traiter après ouverture ; ne jamais convertir l’exception en faux PASS monitoring |
| Médiateur consommation | PREUVE CONTRACTUELLE PASSÉE — RUNTIME À PROUVER | Jérémy (adhésion) / Adam (intégration et preuve) | Preuve payée reçue le 01/09/2026, hashée et conservée ; intégrer le nom, l'adresse, le site et le lien de saisine exacts dans les pages prévues | Source et SHA-256 de `docs/legal/mediation/README.md`, puis pages publiques cohérentes liées au SHA et aux IDs Worker/Sites | La preuve contractuelle clôt l'ancien blocage « médiateur absent », mais aucune promotion `live` avant preuve des coordonnées sur le runtime exact |
| Hors UE — UK/US/CA/GCC | INCLUS DANS LE CANDIDAT, PREUVE PRODUCTION REQUISE | Jérémy / Adam | Activer uniquement GB, US, CA, AE, QA et SA avec origine `CN`, HS `61071200`, EORI `FR944996487`, DAP, tarif Sendcloud réel, étiquette et douane A4 | Health exact sur zones `UK`,`US`,`CA`,`GCC`, cotation réelle par pays, un shipment unique et les deux PDF reçus ensemble par e-mail | Toute zone, donnée douanière, devise ou cotation divergente bloque le checkout international ; ne jamais présenter le code local comme une ouverture réelle |
| Promotion publique complète | APPROBATIONS DU SHA REQUISES | Adam puis Jérémy | Enregistrer SHA + Worker ID + proof ID, passer `COMMERCE_MODE=live`, déployer puis contrôler France/UE et les zones internationales prévues | Deux accords citant le même SHA ; health `ready=true`, `mode=live`, `launchZones=[EU,UK,US,CA,GCC]`, paiement/stock/fournisseurs attestés et `publicCommerce=true` | Tout écart ferme le commerce ; aucune communication publique avant preuve canonique |

### Séquence d'exécution sans interprétation

Une gate ne passe à `PASS` qu'avec une ligne immuable au format :
`Gate ID | evidence ID | SHA | Worker ID | Sites ID | order ID si pertinent | UTC | vérificateur | approbateur`.
Une capture, un test local ou un accord générique ne remplace jamais ce reçu.

1. Jérémy confirme directement le manifeste et son hash, puis accepte ou refuse
   le rôle de suppléant monitoring. L'adhésion au médiateur est documentée comme
   payée le 1er septembre 2026 ; Adam intègre ses coordonnées exactes **avant**
   le gel et conserve la preuve décrite dans `docs/legal/mediation/README.md`.
2. Geler et committer le candidat. Publier une preview de ce même SHA et sa
   checklist. Obtenir l'accord d'Adam puis celui de Jérémy sur ce SHA pour une
   **mutation contrôlée**, pas pour la validation visible ni l'ouverture publique.
3. Avec une session Cloudflare autorisée, exécuter en lecture seule
   `npx wrangler d1 time-travel info aj-luxury-production --config cloudflare.production.jsonc --json`
   et conserver le bookmark. Exporter aussi le schéma avant mutation. Appliquer
   les migrations jusqu'à `0032`, vérifier leur inventaire, relire le stock D1
   et le comparer au manifeste.
4. Ré-attester sur les dashboards les identités Stripe, Sendcloud et Resend qui
   alimenteront ce Worker ; conserver seulement leurs identifiants publics.
5. Déployer d'abord le Worker en `controlled`, puis Sites depuis le même SHA.
   Laisser `COMMERCE_CONTROLLED_EDGE_ACCESS_ENFORCED` absent ou faux : cette
   variable historique ne constitue jamais une autorisation et toute valeur
   `true` invalide le candidat. Configurer la liste exacte des trois adresses
   administratrices. Leur parcours humain reste uniquement : création du compte
   AJ Luxury, confirmation par e-mail, puis connexion à `/admin`, sans MFA, clé
   physique ni écran Cloudflare. Exécuter les preuves anonymes du §
   « Vérification fail-closed et auto-étiquette sans dépense », puis
   les quatre tests monitoring et figer les Worker/Sites IDs finaux. Toute
   nouvelle version après cette étape impose une nouvelle preuve.
6. Vérifier la santé puis faire valider par Jérémy la version visible — accueil,
   compte, panier et livraison — **avant** paiement, impression ou remise physique.
7. Prouver d'abord, sans commande fournisseur ni dépense, le double verrou
   `OUTBOUND_SHIPMENT_CREATION_ENABLED=true` et
   `AUTOMATIC_OUTBOUND_SHIPMENT_ENABLED=true`, l'idempotence et l'arrêt sur
   outcome ambigu. Réconcilier séparément les deux e-mails. Aucune
   réconciliation ne renvoie d'e-mail et aucune ligne historique n'est réécrite.
8. Sur une commande et un colis réels vérifiés par Jérémy, payer une fois. Prouver
   d'abord la création d'une facture commerciale unique `AJL-YYYY-NNNNNN`, son
   accès client/admin et son rendu A4. Créer ou récupérer ensuite l'unique
   shipment, télécharger l'étiquette transporteur A4, imprimer à 100 %, scanner
   le code-barres et conserver le reçu lors de la remise transporteur.
9. Effectuer et conserver la preuve retour/remboursement. Le passage du
   remboursement fournisseur à `succeeded` doit créer atomiquement un seul avoir
   `AJL-AV-YYYY-NNNNNN`, lié à la facture d'origine et visible dans le même rendu
   A4 côté client et admin. Un rejeu ne crée aucun second avoir. Prouver ensuite
   séparément les cotations et documents des zones UK, US, CA et GCC.
10. Constituer le registre de clôture et le proof ID contrôlé. Demander alors un
   **nouvel accord distinct**
   d'Adam puis de Jérémy citant SHA + Worker ID + Sites ID + proof ID pour passer
   en `live`.

Une restauration Time Travel écrase D1 en place et annule les requêtes en cours.
Elle n'est donc jamais l'étape automatique d'un rollback applicatif. Le premier
rollback est Worker, puis Sites. D1 jusqu'à `0032` reste en place sauf décision d'incident
documentée à partir du bookmark conservé.

### D1 jusqu'à `0032` — commandes, factures, avoirs, relance et e-mail opérateur

Toutes les sorties vont sous `release-evidence/<SHA>/`, dans ce workspace. Elles
ne contiennent ni secret ni données client. Depuis un worktree propre positionné
sur le SHA approuvé :

```powershell
$env:COMMERCE_RELEASE_SHA = '<SHA_APPROUVE>'
New-Item -ItemType Directory -Force -Path "release-evidence/$env:COMMERCE_RELEASE_SHA" | Out-Null
npx wrangler d1 time-travel info aj-luxury-production --config cloudflare.production.jsonc --json |
  Tee-Object "release-evidence/$env:COMMERCE_RELEASE_SHA/d1-time-travel-before.json"
npx wrangler d1 export aj-luxury-production --remote --config cloudflare.production.jsonc `
  --output="release-evidence/$env:COMMERCE_RELEASE_SHA/d1-schema-before.sql" --no-data
$env:APP_ENV = 'production'
$env:PRODUCTION_MIGRATION_APPROVAL_SHA = $env:COMMERCE_RELEASE_SHA
$env:PRODUCTION_MIGRATION_APPLY_CONFIRMATION = 'APPLY_PRODUCTION_D1_WITHOUT_SYNTHETIC_0008'
$env:PRODUCTION_D1_DATABASE_ID = 'b02e8fc8-7309-43f7-a596-78fa51dc110d'
$env:PRODUCTION_D1_DATABASE_NAME = 'aj-luxury-production'
npm run apply:production-migrations
npx wrangler d1 execute aj-luxury-production --remote --config cloudflare.production.jsonc `
  --command="SELECT type,name,tbl_name FROM sqlite_schema WHERE name LIKE '%email_delivery_provider_evidence%' OR name LIKE '%invoice%' OR name LIKE '%credit_note%' OR name LIKE '%shipment_retry%' OR name LIKE '%operator_label_email%' ORDER BY type,name;" --json |
  Tee-Object "release-evidence/$env:COMMERCE_RELEASE_SHA/d1-0032-inventory-after.json"
```

Le dernier fichier doit contenir l'inventaire exact des tables de facturation
`invoice_sequences`, `order_invoices`, `credit_note_sequences`,
`order_credit_notes` et `shipment_retry_authorizations`, de leurs index et de
leurs triggers. Les déclencheurs
terminaux attendus incluent `trg_orders_create_invoice_after_payment` et
`trg_refunds_create_credit_note_after_success`. Le health du Worker doit ensuite
confirmer l'absence simultanée de `invoice-schema-0029-not-installed` et de
`credit-note-schema-0030-not-installed`. La migration 0031 doit en plus prouver
la table et les triggers de relance unique sans modifier les schémas facture ou
avoir. La migration 0032 doit prouver `operator_label_email_outbox`, ses
déclencheurs d'idempotence et les colonnes de preuve des pièces jointes, sans
modifier les factures ni les avoirs. Toute ligne manquante, tout remboursement
réussi sans avoir, tout doublon ou tout écart de schéma est un STOP.

### Les trois accords, volontairement séparés

1. **Mutation contrôlée** : SHA + URL preview + checklist. Autorise D1/Worker/Sites.
2. **Validation fonctionnelle visible** : SHA + Worker ID + Sites ID. Confirme la
   recette constatée, sans ouvrir le public.
3. **Promotion live complète** : SHA + Worker ID + Sites ID + proof ID. Autorise
   `COMMERCE_MODE=live` uniquement avec les cinq zones attendues et leurs
   preuves internationales concordantes.

### Facturation — cinq documents à ne jamais confondre

La chaîne commerce produit cinq objets ayant des rôles distincts :

1. la **confirmation de commande** récapitule la demande enregistrée ;
2. la **confirmation de paiement** indique que Stripe a confirmé le règlement ;
3. la **facture commerciale AJ Luxury** est le document de vente numéroté remis
   au client après confirmation du paiement ;
4. l'**avoir commercial AJ Luxury** constate tout ou partie du montant remboursé
   sans modifier la facture d'origine ;
5. l'**étiquette transporteur** sert uniquement à acheminer le colis et n'est ni
   une facture, ni une preuve comptable du règlement.

Le comportement cible à prouver sur le runtime exact est le suivant :

- aucune facture n'est émise pour une commande impayée ou un résultat Stripe
  ambigu ;
- le premier signal de paiement vérifié attribue atomiquement un seul numéro
  continu au format `AJL-YYYY-NNNNNN` ; un rejeu du webhook retourne la même
  facture et ne consomme jamais un second numéro ;
- la facture fige la date d'émission, le vendeur, l'acheteur, les lignes et
  quantités, les remises, les frais de livraison, les montants, le statut payé,
  la mention fiscale applicable et les coordonnées du médiateur ;
- le client retrouve le document dans son compte et l'administrateur dans la
  commande ; les deux accès rendent le même document A4 ;
- l'impression ou l'enregistrement PDF se fait depuis ce rendu A4 ; le bouton
  « étiquette A4 » reste séparé et concerne exclusivement Sendcloud ;
- une facture émise est immuable. Une annulation ou un remboursement ultérieur
  ne la réécrit pas ;
- lorsque le remboursement fournisseur devient `succeeded` avec ses références
  vérifiées, la migration `0030` crée atomiquement un avoir continu au format
  `AJL-AV-YYYY-NNNNNN`. Il reprend la facture d'origine, le montant crédité et le
  solde restant ; un rejeu retrouve le même avoir et n'en crée aucun second ;
- le client retrouve la facture et ses avoirs dans son compte, et
  l'administrateur dans la commande. Les deux accès rendent le même ensemble A4,
  sans exposer les références internes du fournisseur ;
- une facture et un avoir émis sont immuables. Toute régularisation suivante
  passe par un nouveau document lié, jamais par la réécriture de l'historique.

La preuve de recette conserve les numéros de facture et d'avoir, l'order ID,
l'identifiant de remboursement, les horodatages Stripe, le hash du rendu A4 côté
client et admin, le SHA et les IDs Worker/Sites, sans donnée de carte. Tant que
cette concordance et l'absence des deux blockers de schéma ne sont pas acquises,
la facturation et les avoirs restent `OUVERT PRODUIT/RUNTIME` et ne doivent pas
être présentés comme déployés.

### Décision préalable — montant et frais d'un retour

Le droit français fixe le cadre, mais il ne fournit pas à l'application une
règle AJ Luxury de prorata des remises de pack. L'article L221-24 impose, lors
d'une rétractation, le remboursement des sommes versées et des frais de
livraison standard ; le surcoût d'un mode plus cher peut rester exclu. L'article
L221-23 permet de laisser les coûts directs de renvoi au consommateur seulement
s'il en a été informé. La DGCCRF indique qu'un retour partiel rembourse le prix
des biens retournés ; la Commission des clauses abusives déconseille toutefois
l'exclusion générale des frais de livraison pour toute rétractation partielle.

Sources officielles à faire valider sur le texte final :

- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032226828/2022-04-26
- https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044563188/2026-05-17
- https://www.economie.gouv.fr/particuliers/mes-droits-conso/bien-consommer/vente-distance-tout-savoir-sur-votre-droit-de-retractation
- https://www.economie.gouv.fr/files/files/directions_services/dgccrf/boccrf/2023/23_12/Recommandation-plateforme.pdf

Avant de câbler le remboursement automatique, Jérémy et le validateur juridique
nommé doivent signer une politique versionnée qui tranche exactement :

1. l'allocation au centime de la remise d'un pack entre ses pièces ;
2. le remboursement des frais de livraison standard en rétractation complète et
   la règle juridiquement validée en rétractation partielle ;
3. qui supporte l'étiquette retour, en cohérence exacte avec les CGV affichées ;
4. les cas distincts rétractation, non-conformité et geste commercial.

Tout cas non couvert retourne `REFUND_POLICY_REVIEW_REQUIRED`. Aucun montant
opérateur libre et aucune déduction implicite ne sont autorisés. Cette décision
est le prérequis de la migration dédiée aux étiquettes retour et calculs de
remboursement ; elle ne peut pas être remplacée par un flag d'environnement.

## Release gate

### Canonical launch inventory

The candidate stock manifest below is **not a current runtime PASS**. It is the
pending inventory to be confirmed directly by Jérémy and then re-read from D1:

- 756 units initially recorded;
- 4 units already sold and 3 gifts already given, leaving 749 physical units;
- 23 additional units reserved for gifts at launch, for 26 gifts in total;
- 726 units sellable now, exactly 242 per colour.

| Colour | S | M | L | XL | Sellable |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pourpre | 24 | 100 | 85 | 33 | 242 |
| Lilas | 24 | 99 | 86 | 33 | 242 |
| Rose | 24 | 100 | 85 | 33 | 242 |
| **Total** | **72** | **299** | **256** | **99** | **726** |

This launch allocation comes from Adam's instruction applied to the verified
stock sheet; it is not presented as a supplier fact. The remaining 23-gift
reserve is Pourpre 2/2/2/2, Lilas 2/1/2/2 and Rose 2/2/2/2 for S/M/L/XL.
Together with the three M gifts already given (Pourpre 1, Lilas 1, Rose 1), all
variants have two total gift units except Pourpre M and Rose M, which have three.
Dynamic packs continue to draw from these sellable variants, including packs
whose pieces share the same colour.

The historical manifest records Adam CHABBI's relay of a verbal approval. It is
retained as history only. Public promotion requires Jérémy's new direct written
confirmation of the exact grid and hash; silence or an older release approval is
not stock approval.

The controlled stock import must be executed once, through its owner-only and
idempotent route, from the exact controlled Worker version that is recorded by
the stock attestation. Never rewrite that manifest to make a later runtime
appear to be the importer. A reviewed code-only controlled upgrade may instead
set the exact pair `COMMERCE_STOCK_EVIDENCE_RELEASE_SHA` and
`COMMERCE_STOCK_EVIDENCE_VERSION_ID` to the original attested source. Both
values are required, the new code SHA still needs both human approvals, and the
new version must keep the import route closed. Live promotion keeps that same
immutable stock-evidence pair and separately sets
`COMMERCE_PROMOTED_FROM_RELEASE_SHA` and
`COMMERCE_PROMOTED_FROM_VERSION_ID` to the exact controlled runtime provenance
written immutably on the first order. The private owner-only controlled order
may defer the runtime proof of the mediator coordinates, monitoring-alert
approval gates by the release owner's dated decision. The
mediator's contractual proof is already retained; its runtime publication, plus
the other applicable gates, remains mandatory before public `live` commerce.
The controlled exception never represents those tasks as completed.

### Provider identity attestation

Historical evidence names the public identities below. They are **inputs to
re-attest on the candidate Worker**, not a current-release PASS. Credentials
remain secret and are never copied into this runbook:

- Stripe account `acct_1U4iFTC0NIklfc9C`;
- Sendcloud integration `612109` (`AJ Luxury Site officiel`);
- Sendcloud sender address `884432` (`AJ Luxury`, Belmont 67130, France);
- Resend domain `ajluxurystore.com`.

Any different identity closes the release gate pending a new dated verification.
Re-attestation is performed in Stripe > Transactions/Developers, Sendcloud >
Settings > Integrations and Addresses, and Resend > Domains/Emails. The evidence
packet records only the public account/integration/domain identity, timestamp,
SHA and Worker ID; never a key, webhook secret or cookie.

### Controlled runtime matrix

`cloudflare.controlled.jsonc` remains the isolated rehearsal Worker: it uses a
separate D1 and private Sites origin and can never become the source of public
release evidence. The first real order on the official domain instead runs the
`aj-luxury-production` Worker in `controlled` mode, on the production D1, with
`COMMERCE_ORIGIN=https://ajluxurystore.com`. Its immutable stock/provider proof,
order provenance and later `live` promotion therefore stay on the same D1 and
the same canonical origin. Public traffic remains owner-restricted by the
application until that order is reconciled and the live gates pass.

`capabilities.publicCommerce=false` is a health assertion, not an access-control
mechanism. In `controlled`, every commerce request capable of creating or
mutating customer, cart, checkout, payment or order state must fail closed unless
the application has authenticated the approved owner. The legacy variable
`COMMERCE_CONTROLLED_EDGE_ACCESS_ENFORCED` is prohibited and ignored as release
evidence : it must be absent or false. A value `true` is an immediate STOP because
Cloudflare Access cannot replace this application control. Stripe, Resend and
Sendcloud webhooks remain outside human Access and continue to require their
provider signatures.

The private Sites environment supplies `COMMERCE_BACKEND_ORIGIN`, an exact
`COMMERCE_STOREFRONT_ORIGINS_JSON` containing only the private Sites origin,
`COMMERCE_SITES_OWNER_AUTH_ENABLED=true`, its exact owner-auth origin, and the
approved owner identity. The Sites bridge and Worker share the proxy and
controlled-HMAC secrets through their secret stores. No secret is copied into a
config file, release note or evidence bundle.

The production operator console is a separate administrator-only surface at
`/admin`. Human access uses the AJ Luxury account itself: a confirmed e-mail and
password create a short D1 administrator session. `/api/commerce/management/*`
is the public browser path and is internally mapped to the existing
rate-limited admin handlers. Every sensitive mutation still requires the short
session, same-origin request protection and an operation-specific replay guard.
Cloudflare Access remains an infrastructure rollback option only; it is not part
of Adam's or Jeremy's login journey and no MFA or physical key is required.

`COMMERCE_ADMIN_ALLOWED_EMAILS_JSON` contient exactement trois identités
distinctes après normalisation en minuscules : `adam.chabbi94@gmail.com`,
`jeremy@ajluxurystore.com` et `jeremyajluxurystore@gmail.com`. Deux, quatre,
un doublon ou une adresse supplémentaire ferment la console. Aucune adresse
n'est admise par domaine entier. Les valeurs non secrètes sont enregistrées dans
la preuve de configuration ; les cookies et mots de passe ne le sont jamais.

Before the controlled order, the release owner records and verifies these
runtime-only groups against the exact release SHA and Worker version:

- release, Adam/Jérémy, stock-manifest and public provider identity attestations;
- Stripe live settlement, webhook verification and controlled payment-session
  enablement;
- Sendcloud outbound shipment creation, sender attestation and delivery-reference
  vault key version ; l'automatisation exige simultanément
  `OUTBOUND_SHIPMENT_CREATION_ENABLED=true` et
  `AUTOMATIC_OUTBOUND_SHIPMENT_ENABLED=true` ;
- Resend webhook verification plus transactional dispatch enabled in
  `controlled` mode;
- Resend provider reconciliation enabled only for an owner-authorized,
  append-only lookup of a known provider message ID; it never enables replay;
- late-payment refund dispatch, reservation expiry, returns, shipment handover
  and reporting activation;
- the four controlled rate-limit bindings and the exact private bridge origin.

Flags such as `PRODUCTION_STOCK_IMPORT_ENABLED`,
`CONTROLLED_PAYMENT_SESSION_ENABLED`, `OUTBOUND_SHIPMENT_CREATION_ENABLED`,
`AUTOMATIC_OUTBOUND_SHIPMENT_ENABLED`,
`TRANSACTIONAL_EMAIL_DISPATCH_ENABLED`, `TRANSACTIONAL_EMAIL_DISPATCH_MODE`,
`TRANSACTIONAL_EMAIL_RECONCILIATION_ENABLED`,
`LATE_PAYMENT_REFUND_DISPATCH_ENABLED`, `RESERVATION_EXPIRY_ENABLED`,
`RETURNS_WORKFLOW_ENABLED`, `SHIPMENT_HANDOVER_ENABLED`,
`COMMERCE_REPORTING_ENABLED` are runtime release
decisions, not claims pre-signed in the committed config. The health response
must remain closed if any gate required for the current mode, schema proof or
identity is missing. The narrow `controlled` exception does not apply to
`live`: unproved mediator publication or monitoring approval keeps public
commerce closed.

### Vérification fail-closed et auto-étiquette sans dépense

Ces contrôles précèdent toute commande payante et tout appel Sendcloud capable
de créer un colis. Ils ne doivent transmettre ni cookie, ni JWT, ni en-tête owner,
ni clé fournisseur. Enregistrer seulement le code HTTP et l'horodatage UTC :

```powershell
$proof = [DateTimeOffset]::UtcNow.ToString('yyyyMMddTHHmmssZ')
curl.exe -sS -o NUL -w "commerce-anonyme=%{http_code}`n" "https://ajluxurystore.com/api/commerce/cart?proof=$proof"
curl.exe -sS -o NUL -w "admin-page-anonyme=%{http_code}`n" "https://ajluxurystore.com/admin?proof=$proof"
curl.exe -sS -o NUL -w "admin-api-anonyme=%{http_code}`n" "https://ajluxurystore.com/api/commerce/management/orders?proof=$proof"
npm run test:last-mile
```

Résultats obligatoires :

- `commerce-anonyme` retourne `401` ou `403` applicatif, jamais `200` ; une
  redirection Access ne suffit pas à prouver le fail-closed applicatif ;
- `admin-page-anonyme` peut afficher l'écran de connexion AJ Luxury, mais aucune
  donnée de commande ; `admin-api-anonyme` refuse l'accès avec `401` ou `403` ;
- les tests prouvent localement, avec fournisseur simulé, que les deux flags
  d'étiquette sont nécessaires, qu'un seul shipment/idempotency key est créé et
  qu'un résultat fournisseur ambigu s'arrête en revue manuelle ;
- une preuve de configuration expurgée lie les deux flags vrais au SHA et au
  Worker ID, sans afficher les secrets Sendcloud.

Cette preuve est une preuve de préparation, pas une preuve de colis réel. Aucun
appel de création Sendcloud, aucun achat d'étiquette et aucun paiement n'est
autorisé pendant cette étape. La preuve terrain A4 reste distincte, owner-only et
nécessite une autorisation explicite sur une commande réelle vérifiée.

### First controlled order evidence

Before any public promotion, retain one
redacted, timestamped evidence packet for the owner-only controlled order. It
must prove all of the following against one order ID without storing credentials
or card data:

1. health is ready on the exact SHA/version and the private Sites bridge reaches
   only the controlled Worker and D1;
2. the 12-line stock manifest is attested at 749 physical, 23 remaining gift
   reserve and 726 sellable, and the chosen unit or same-colour/mixed-colour pack
   decrements only its real variants;
3. the selected Sendcloud offer has a positive EUR price from V3, or an exact
   country/weight/dimensions/carrier/mode V2 fallback receipt;
4. Stripe records the expected EUR amount once, the webhook becomes processed,
   the order becomes paid and the stock movement is committed atomically;
5. exactly one `order_confirmation` and one `payment_confirmation` are proven.
   Normal delivery is an outbox row at `sent`. A historical terminal
   `delivery_ambiguous` row is acceptable only when the immutable reconciliation
   journal proves the exact expected Resend message as `delivered`, `opened` or
   `clicked`. No source row is rewritten and no unproved e-mail is replayed. The
   detailed order message contains lines, discounts, delivery, total, tax zero,
   article 293 B and the immutable CGV version/hash snapshot;
6. label creation is performed only for the real parcel. `label_ready` creates
   no shipment email. Its downloadable PDF is requested from Sendcloud in A4,
   printed at 100% and barcode-scanned. After the parcel is physically handed to
   the carrier, the first signed carrier-possession event records the handover
   and queues exactly one shipment confirmation; replaying the same event queues
   no second email. The manual owner handover route is reserved for a real,
   retained handover receipt when carrier evidence is unavailable;
7. provider receipts, D1 rows and audit events reconcile to the same order,
   payment, shipment and idempotency references.

La recette retour distincte requise avant promotion publique doit relier un
remboursement Stripe réellement confirmé à exactement un avoir automatique
`AJL-AV-YYYY-NNNNNN`. La facture d'origine reste inchangée ; le compte client et
la console admin affichent le même avoir dans l'ensemble A4, avec montant crédité
et solde restant concordants. Le rejeu du signal ne crée ni second avoir ni
second numéro.

### Controlled rollback and reconciliation

If any step is ambiguous, close new checkout traffic and preserve the controlled
D1 and provider receipts. Never delete or recreate a paid order to obtain a
clean retry. Reconcile Stripe payment/refund state first, then D1 order and stock
movements, then the two paid-order emails, then Sendcloud label/tracking state.
Unknown Stripe or Sendcloud outcomes require provider lookup and manual review;
they must never trigger a blind second charge, refund or label. Email retries use
the retained provider idempotency key. Restore the previous Worker and private
Sites versions together only after recording which D1 state they continue to
serve. A future live Worker must retain
the exact `COMMERCE_PROMOTED_FROM_RELEASE_SHA` plus
`COMMERCE_PROMOTED_FROM_VERSION_ID` written on the first order, while the
separate stock-evidence pair remains bound to the immutable importer.

A production release is anchored by both:

1. an immutable Git commit SHA containing only the approved AJ Luxury scope;
2. a saved Sites version linked to that exact SHA.

Before the controlled deployment, the release owner records the candidate SHA
and the currently deployed Worker/Sites version IDs. Adam CHABBI then Jérémy
SCHEPPLER approve that exact SHA for a controlled deployment. After deployment,
the handoff records the new Worker/Sites version IDs and the evidence packet.
Public promotion requires a second, separate pair of approvals explicitly tied
to SHA + Worker ID + Sites ID + proof ID. A version ID that does not yet exist
can never be a prerequisite for the first controlled deployment approval.
The gate requires a successful build, lint, complete automated test suite,
responsive visual QA, and a clean runtime-reference audit.

## Production verification

Après chaque déploiement contrôlé, enregistrer les sorties suivantes dans le
paquet de preuve, puis vérifier le domaine canonique :

```powershell
npx wrangler versions list --name aj-luxury-production --config cloudflare.production.jsonc --json
npx wrangler deployments list --name aj-luxury-production --config cloudflare.production.jsonc --json
```

- le SHA/tag Worker et le Worker ID actifs sont ceux du candidat ; le Sites ID
  affiché par l'hébergeur est celui enregistré, et le marqueur HTML porte le SHA ;
- `/api/commerce/health` retourne exactement `status="ready"`,
  `environment="production"`, `mode="controlled"`, `releaseSha="<SHA>"`,
  `origin="https://ajluxurystore.com"`,
  `launchZones=["EU","UK","US","CA","GCC"]`, `blockers=[]`,
  `capabilities.controlledOrder=true`, `capabilities.publicCommerce=false` ; le
  paquet D1 prouve séparément les migrations jusqu'à `0032`, le settlement live
  et les provenances ; le health ne contient ni
  `invoice-schema-0029-not-installed` ni
  `credit-note-schema-0030-not-installed` ;
- `COMMERCE_CONTROLLED_EDGE_ACCESS_ENFORCED` est absent ou faux ; la requête
  commerce anonyme du test fail-closed retourne `401`/`403` et aucune route
  mutante contrôlée ne repose uniquement sur Access ;
- `/admin` n'affiche aucune donnée sans connexion ; les trois adresses exactes
  passent après création et confirmation de leur compte AJ Luxury, toute autre
  adresse échoue, puis les protections de session, d'origine et contre les
  doubles clics restent actives ;
- la préparation auto-étiquette possède les deux flags vrais et sa preuve locale
  sans dépense ; cette preuve ne vaut pas création, impression ni scan d'un colis ;
- après promotion seulement, le même endpoint retourne exactement
  `status="ready"`, `environment="production"`, `mode="live"`,
  `releaseSha="<SHA>"`, `origin="https://ajluxurystore.com"`,
  `launchZones=["EU","UK","US","CA","GCC"]`, `blockers=[]`,
  `capabilities.controlledOrder=false`,
  `capabilities.publicCommerce=true` ; les provenances stock/commande/promotion
  concordent dans D1 et les zones UK/US/CA/GCC sont toutes attestées ;
- une commande de contrôle prouve panier, livraison sélectionnée, paiement Stripe
  unique, stock décrémenté une fois, compte client et deux confirmations e-mail
  distinctes ;
- cette commande payée possède une facture unique `AJL-YYYY-NNNNNN` ; le compte
  client et la console admin retournent le même rendu A4 et le même hash, alors
  que le lien d'étiquette reste explicitement distinct ;
- la recette de remboursement produit un avoir automatique unique
  `AJL-AV-YYYY-NNNNNN`, lié à la facture inchangée ; le compte client et la
  console admin retournent le même ensemble facture + avoirs A4 et le rejeu ne
  crée aucun second document ;
- la console prouve une session admin nominative sans exposer cookie/JWT, l'étiquette
  A4 unique, le scan transporteur, le suivi et les actions retour ;
- les quatre alertes monitoring possèdent chacune un evidence ID acquitté ;
- la preuve médiateur porte le SHA-256
  `f2b0cfddb88d0e8b2ede2b8abca8980e4d09e18d82cccb5a9107398cf67870b7` et les
  coordonnées documentées dans `docs/legal/mediation/README.md` figurent
  exactement dans les pages légales et la facture ; tant que cette publication
  runtime n'est pas prouvée, `mode=controlled` et
  `capabilities.publicCommerce=false` restent obligatoires ;

- the expected release marker is present in HTML;
- public HTML carries the expected shared `Cache-Control` policy without any
  `caches.default` permission error in the Worker logs;
- every hero URL uses `/media/`; posters respond successfully and an MP4
  request with `Range: bytes=0-1023` returns `206`, `Content-Range`,
  `Accept-Ranges: bytes` and exactly 1,024 bytes;
- `/media/i18n/en.json?v=v5` is immutable JSON with `nosniff`;
- `/images/review/*` and `/media/images/review/*` do not expose review proofs;
- `docs/internal/**` and client evidence are not bundled, routed or publicly served;
- no console error, broken image, horizontal overflow or language regression;
- private commerce routes remain excluded from shared HTML caching.

Do not close the release until the deployment status is successful and these
checks pass on `https://ajluxurystore.com`.

## Canonical and defensive domains

`ajluxurystore.com` is the sole production canonical domain. The registered
`ajluxurystore.fr` domain is a defensive asset and is outside a normal
application release: never publish a duplicate site or create mail service on
it by implication.

Any future `.fr` redirect requires a separately approved domain handoff tied to
`docs/internal/DOMAIN-PROTECTION-FR-2026-08-10.md`. It must cover the DNS and the
HTTP redirect service, HTTPS on the apex and `www`, a one-hop permanent `301` or
`308` redirect to the `.com`, an immediately prior zone snapshot, the explicit
e-mail policy, verification evidence and a documented rollback. Without that
exact handoff and Adam’s then Jérémy’s approval, leave the `.fr` unchanged.

## Application rollback

Worker et Sites se restaurent séparément. En incident API, remettre d'abord
le Worker ID précédent avec
`npx wrangler rollback <WORKER_VERSION_ID_PRECEDENT> --name aj-luxury-production --config cloudflare.production.jsonc --message "rollback AJ Luxury <INCIDENT_ID>"`,
vérifier `/api/commerce/health`, puis restaurer le Sites ID précédent depuis
Hébergement > Versions > `<SITES_VERSION_ID_PRECEDENT>` > Restaurer si le front
est aussi concerné. En
incident purement visuel, ne pas toucher au Worker. Ne jamais reconstruire une
ancienne version et ne jamais modifier DNS pendant ce rollback.

Les migrations additives jusqu'à `0032` restent en place lors d'un
rollback applicatif. Une restauration D1 est
une action destructive séparée, uniquement sur décision d'incident, à partir du
bookmark Time Travel conservé. Répéter ensuite les contrôles SHA/Worker/Sites,
mode/audience/zones, santé, paiement/livraison/e-mails, session admin, monitoring,
retours, Range média, cache et responsive. Conserver le commit et les version IDs en échec
pour diagnostic ; corriger par un nouveau commit et de nouvelles versions.

## DNS rollback

DNS changes are outside normal application rollback. Use the scoped domain
rollback procedure only when the incident is demonstrably DNS-related. Never
mix a DNS rollback with an application rollback without recording both actions.
Treat the `.com` and `.fr` zones independently; never restore one by copying the
other zone wholesale.
