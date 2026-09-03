# AJ Luxury — registre juridique de pré-lancement

Date de revue : 1er septembre 2026

Responsable de l’intégration : Adam CHABBI

Statut : médiateur, téléphone professionnel et socle contractuel intégrés. Aucun
blocage juridique déclaré pour l’ouverture France/Union européenne ; la mise en
ligne reste conditionnée uniquement à la promotion technique du même SHA et à
un health check sans blocker.

## Documents publics intégrés

| Document | Route | Contenu couvert | Statut |
|---|---|---|---|
| Conditions générales de vente | `/terms` | Produits, prix, commande, paiement, facture, avoir, livraison, rétractation, garanties, responsabilité, médiation | Version `2026-09-01-r2` hashée ; médiateur et facturation intégrés |
| Politique de confidentialité | `/privacy` | Finalités, bases légales, catégories de données, durées, destinataires, transferts, droits | Stripe, Sendcloud, Resend et Cloudflare nommés ; validation juridique finale requise |
| Cookies et traceurs | `/cookies` | Stockages réellement utilisés, futur consentement, réglages | Conforme au prototype actuel ; à réviser avant tout nouvel outil |
| Mentions légales | `/legal-notice` | Éditeur, publication, hébergeur, propriété intellectuelle, responsabilité | Identité, téléphone professionnel et hébergeur documentés |
| Livraison et retours | `/shipping-returns` | Livraison, suivi, rétractation, remboursement, avoir, non-conformité | France/UE couverts ; hors UE maintenu fermé tant qu’une option provider exacte manque |
| Rétractation en ligne | `/withdrawal` | Accès direct, informations requises, confirmation et accusé durable | Route, backend et e-mail transactionnel intégrés |

## Décisions juridiques retenues

- Délai de rétractation : 14 jours à compter de la réception.
- Retour : notification sous 14 jours, puis expédition sous 14 jours.
- Remboursement : prix et livraison standard initiale, sous 14 jours, avec possibilité d’attendre le bien ou la preuve d’expédition.
- Sous-vêtements : aucune exclusion générale du droit de rétractation et aucune
  preuve d’emballage ou de scellé demandée. Seule une éventuelle dépréciation
  liée à une manipulation excessive peut être justifiée.
- Garantie légale de conformité : 2 ans à compter de la délivrance.
- Garantie des vices cachés : action dans les 2 ans suivant la découverte du vice.
- Stocks : aucune quantité interne publiée ; seuls les états disponible, stock faible ou épuisé sont destinés au client.
- Paiement : Stripe Checkout est retenu ; AJ Luxury ne reçoit ni ne conserve le numéro complet de carte ou le cryptogramme.
- Livraison : Sendcloud v3 est retenu comme agrégateur provider-agnostic ; aucun transporteur individuel n’est promis avant activation des services réels.
- E-mails transactionnels : Resend est retenu, sans prospection ni envoi réel avant validation du domaine expéditeur.
- Pilotage : agrégats D1 internes sans SDK publicitaire ou profilage tiers.
- Cookies : aucun outil publicitaire ou d’audience soumis au consentement n’est actuellement actif.
- Consentement futur : accepter et refuser au même niveau, choix granulaire, aucune activation avant consentement, conservation du choix de référence pendant 6 mois.
- Rétractation 2026 : une fonctionnalité directement accessible, gratuite et disponible pendant le délai légal doit être connectée avant toute commande.
- Médiation : Société Médiation Professionnelle est conventionnée ; les
  coordonnées et le lien de saisine sont publiés. La preuve source est conservée
  sous `docs/legal/mediation/` sans exposition de ses données bancaires.
- Facturation : après paiement confirmé, une facture immuable
  `AJL-YYYY-NNNNNN` est créée. Chaque remboursement confirmé produit un avoir
  immuable `AJL-AV-YYYY-NNNNNN` lié à la facture initiale. Facture et avoirs
  restent distincts de l’étiquette transporteur.

## État technique vérifié

| Élément | État constaté |
|---|---|
| Paiement réel | Stripe Checkout et webhook testés sur une première commande payante ; replay idempotent |
| Commande réelle | Chaîne commande, paiement, stock, e-mails et remboursement testée ; promotion du SHA final encore requise |
| Compte client réel | Actif sur le runtime contrôlé ; historique, suivi, facture et avoirs protégés par ownership |
| Newsletter | Inactive |
| Publicité / pixels sociaux | Inactifs |
| Mesure d’audience | Reporting agrégé D1 codé ; aucune route publique ni SDK tiers |
| Stockage de langue | `localStorage` : `aj-luxury.locale.v1` |
| Introduction déjà vue | `sessionStorage` : `aj-luxury-intro-seen` |
| Hébergement | Cloudflare Worker + Assets/Sites, avec release et health liés au même SHA |

## État des gates d’ouverture

| Priorité | Information ou action requise | Responsable | Preuve attendue |
|---|---|---|---|
| Formalité post-lancement — échéance 03/10/2026 | Publier une coordonnée téléphonique professionnelle validée ; le numéro personnel de Jérémy reste absent | AJ Luxury + Adam | Autorisation de l’avocat rapportée par Adam le 03/09/2026 : ouverture immédiate admise avec intégration sous 30 jours ; `contact@ajluxurystore.com` reste le contact public entre-temps |
| Passé le 01/09/2026 | Médiateur de la consommation conventionné | AJ Luxury | Source interne hashée ; coordonnées publiques intégrées |
| Passé | France/UE, transporteurs, tarifs et délais | AJ Luxury + Adam | Matrice et providers testés ; les zones hors UE non prouvées restent fermées sans affecter l’ouverture France/UE |
| Passé | Compte Stripe, paiement et webhook | AJ Luxury + Adam | Première commande payante et effets D1 prouvés |
| Passé | Formulaire de rétractation, remboursement et accusé durable | Adam | Tests D1 et e-mails ; facture initiale inchangée et avoir automatique |
| Passé | Sous-traitants Stripe, Sendcloud, Resend, Cloudflare et hébergement final | Adam + AJ Luxury | Services nommés dans la politique de confidentialité |
| Passé techniquement | Conservation et droits sur les commandes | AJ Luxury + Adam | Politique versionnée, exports et anonymisation testés ; toute activation de purge reste explicite |
| Bloquant si activé | Bandeau et gestionnaire de consentement avant analytics/marketing | Adam | Recette avant/après consentement |
| Vérification produit | Étiquette de composition fixée au boxer | AJ Luxury | Confirmation oui/non ; aucune photo d’emballage requise |
| Après démarrage | Ajout de l’activité de vente en ligne au RNE | AJ Luxury | Dépôt au guichet unique dans le mois suivant le changement |
| Gate de release, non juridique | Déployer les migrations jusqu’à `0031`, Worker et Assets sur le même SHA approuvé | Adam + Jérémy | Health `ready=true`, mode `live`, `publicCommerce=true`, aucun blocker |
| Recommandé | Relecture par un professionnel du droit avant ouverture internationale | AJ Luxury | Avis et corrections tracés |

## Tests juridiques à inclure dans la recette commerce

1. Le bouton final indique sans ambiguïté l’obligation de paiement.
2. Le prix total, les taxes, les frais, le délai et l’adresse sont vérifiables avant paiement.
3. La confirmation et les CGV sont envoyées sur un support durable.
4. Le retour et la rétractation restent accessibles sans compte.
5. Le formulaire de rétractation génère un accusé daté et reprend le contenu envoyé.
6. Aucun stock interne, cryptogramme ou secret de paiement n’apparaît côté client.
7. Aucun traceur non essentiel ne se déclenche avant consentement.
8. Refuser les cookies est aussi simple que les accepter.
9. Les liens juridiques restent accessibles sur ordinateur et mobile.
10. L’identité du vendeur, le médiateur et l’hébergeur sont complets sur toutes les pages pertinentes.

## Sources officielles de référence

- DGCCRF, règles du commerce électronique : https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/e-commerce-les-regles-entre-professionnels-et-consommateurs
- Service Public, mentions obligatoires d’un site professionnel : https://entreprendre.service-public.gouv.fr/vosdroits/F37351
- Légifrance, droit de rétractation : https://www.legifrance.gouv.fr/codes/id/LEGISCTA000032226844
- France Num, rétractation en ligne depuis le 19 juin 2026 : https://www.francenum.gouv.fr/guides-et-conseils/developpement-commercial/gestion-de-la-relation-client/la-retractation-en-1-clic
- DGCCRF, garanties légales : https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/les-garanties-legales-de-conformite-et-contre-les-vices-caches
- DGCCRF, médiation de la consommation : https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/la-mediation-de-la-consommation-ce-que-vous-devez-savoir
- CNIL, information des personnes : https://cnil.fr/fr/conformite-rgpd-information-des-personnes-et-transparence
- CNIL, recommandations cookies consolidées 2026 : https://www.cnil.fr/sites/default/files/2026-01/recommandation_cookies_consolidee.pdf
- CNIL, paiement à distance par carte : https://www.cnil.fr/fr/le-paiement-distance-par-carte-bancaire

## Benchmark de structure

Le benchmark des boutiques de mode consultées confirme l’intérêt de séparer clairement CGV, confidentialité, cookies, livraison/retours et mentions légales. Cette structure est plus accessible et maintenable qu’un document unique mélangeant toutes les finalités. Les formulations commerciales concurrentes n’ont pas été recopiées : seuls les patterns de navigation et les rubriques utiles ont été comparés.

> Ce registre documente la conception et facilite la validation. Il ne remplace pas une consultation juridique adaptée à l’identité réelle d’AJ Luxury, à ses pays de vente et à sa chaîne logistique.
