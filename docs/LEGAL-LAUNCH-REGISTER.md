# AJ Luxury — registre juridique de pré-lancement

Date de revue : 1er septembre 2026

Responsable de l’intégration : Adam CHABBI

Statut : socle rédigé et intégré, ouverture commerciale bloquée jusqu’aux confirmations listées ci-dessous.

## Documents publics intégrés

| Document | Route | Contenu couvert | Statut |
|---|---|---|---|
| Conditions générales de vente | `/terms` | Produits, prix, commande, paiement, livraison, rétractation, garanties, responsabilité, médiation | Identité et franchise de TVA renseignées ; logistique, paiement et médiateur à finaliser |
| Politique de confidentialité | `/privacy` | Finalités, bases légales, catégories de données, durées, destinataires, transferts, droits | Stripe, Sendcloud, Resend et Cloudflare nommés ; validation juridique finale requise |
| Cookies et traceurs | `/cookies` | Stockages réellement utilisés, futur consentement, réglages | Conforme au prototype actuel ; à réviser avant tout nouvel outil |
| Mentions légales | `/legal-notice` | Éditeur, publication, hébergeur, propriété intellectuelle, responsabilité | Identité, téléphone professionnel et hébergeur documentés |
| Livraison et retours | `/shipping-returns` | Livraison, suivi, rétractation, remboursement, non-conformité | Aucun scellé hygiène revendiqué ; valeurs opérationnelles à confirmer |
| Rétractation en ligne | `/withdrawal` | Accès direct, informations requises, confirmation et accusé durable | Route visible ; backend et e-mail transactionnel à connecter |

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
- Médiation : AJ Luxury doit conventionner avec un médiateur référencé et publier ses coordonnées. L’ancienne plateforme européenne ODR, fermée en 2025, ne doit pas être ajoutée.

## État technique vérifié

| Élément | État constaté |
|---|---|
| Paiement réel | Connecteur Stripe Checkout codé ; compte, clés et drill réel absents, donc inactif |
| Commande réelle | Routeur codé et testé localement ; non déployé et commerce fermé |
| Compte client réel | Inactif |
| Newsletter | Inactive |
| Publicité / pixels sociaux | Inactifs |
| Mesure d’audience | Reporting agrégé D1 codé ; aucune route publique ni SDK tiers |
| Stockage de langue | `localStorage` : `aj-luxury.locale.v1` |
| Introduction déjà vue | `sessionStorage` : `aj-luxury-intro-seen` |
| Hébergement de prévisualisation | Cloudflare |

## Verrous avant ouverture des ventes

| Priorité | Information ou action requise | Responsable | Preuve attendue |
|---|---|---|---|
| Fait le 01/09/2026 | Téléphone professionnel publié uniquement sur Contact, Mentions légales et CGV | Adam | `+33 6 88 42 40 62` ; aucun usage dans le footer, le checkout ou les données transporteur |
| Bloquant | Médiateur de la consommation conventionné | AJ Luxury | Convention et coordonnées |
| Bloquant | Pays, transporteurs, tarifs, délais, douane et responsabilité import | AJ Luxury + Adam | Matrice logistique validée |
| Bloquant | Compte Stripe, bénéficiaire, moyens activés et webhook | AJ Luxury + Adam | Compte marchand et recette signée |
| Bloquant | Formulaire de rétractation relié aux commandes et accusé durable | Adam | Test bout en bout horodaté |
| Bloquant | DPA/registres Stripe, Sendcloud, Resend, Cloudflare et hébergement final | Adam + AJ Luxury | Registre des sous-traitants validé |
| Bloquant | Règles actives de conservation et procédure d’effacement/anonymisation des commandes | AJ Luxury + conseil juridique + Adam | Politique versionnée, migration et tests de droits |
| Bloquant si activé | Bandeau et gestionnaire de consentement avant analytics/marketing | Adam | Recette avant/après consentement |
| Vérification produit | Étiquette de composition fixée au boxer | AJ Luxury | Confirmation oui/non ; aucune photo d’emballage requise |
| Après démarrage | Ajout de l’activité de vente en ligne au RNE | AJ Luxury | Dépôt au guichet unique dans le mois suivant le changement |
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
