# AJ Luxury - Registre projet et backlog de livraison

Date de référence : 24 juillet 2026

## Gouvernance

- Client et décision métier : AJ Luxury, Jérémy et Alex, cofondateurs
- Responsable de la livraison : Adam CHABBI
- Périmètre Adam CHABBI : pilotage, cadrage, UX/UI, conception, réalisation, tests, documentation et coordination de production
- Contribution prévue d’Isabelle : retouche IA et production visuelle, après examen des assets, validation de faisabilité et chiffrage
- Statut : prototype e-commerce fonctionnel, sans paiement, commande ni stock de production connectés

## Besoin cadré

Créer une expérience e-commerce propriétaire pour AJ Luxury, sobre et premium, inspirée dans son agencement par la référence Abel Pirela sans en reprendre l’identité, les textes ou les assets. La première version doit présenter Apollon dans trois coloris, valoriser équitablement Jérémy et Alex, installer une expression métallique cohérente avec le logo et préparer un parcours d’achat évolutif sans dépendance à un builder fermé.

## Légende des statuts

- `Terminé prototype` : présent et vérifié dans la version livrée
- `À valider` : décision ou accord explicite attendu d’AJ Luxury
- `À produire` : production complémentaire à engager après validation du périmètre
- `À connecter` : service réel à sélectionner, configurer et recetter

## Backlog détaillé

| ID | Tâche | Statut | Owner | Critère d’acceptation | Preuve ou artefact | Dépendance |
|---|---|---|---|---|---|---|
| AJ-001 | Consolider besoin, charte, catalogue et référence | Terminé prototype | Adam CHABBI | Périmètre, contraintes et décisions ouvertes documentés | `docs/PROJECT-BASELINE.md` | Aucune |
| AJ-002 | Distinguer textes client et formulations de maquette | Terminé prototype | Adam CHABBI | Chaque texte public possède une origine ou un statut | `docs/COPY-SOURCE-REGISTER.md` | Contenus AJ Luxury |
| AJ-003 | Inventorier logo et photos | Terminé prototype | Adam CHABBI | Assets utiles identifiés et intégrés sans watermark | `public/images/client/` | Fichiers client |
| AJ-004 | Recomposer l’accueil | Terminé prototype | Adam CHABBI | Marque, duo, produit et accès boutique lisibles | Route `/` et captures QA | AJ-001 |
| AJ-005 | Supprimer les espaces artificiels | Terminé prototype | Adam CHABBI | Hauteurs resserrées sans perte de hiérarchie | Mesures UI dans la revue PDF | AJ-004 |
| AJ-006 | Déployer l’expression métal liquide | Terminé prototype | Adam CHABBI | Métal visible sans masquer visages ni produit | `MetallicField` et hero | AJ-003 |
| AJ-007 | Garantir la parité Jérémy et Alex | Terminé prototype | Adam CHABBI | Présence équilibrée dans les séquences principales | `docs/MODEL-PARITY.md` | Photos disponibles |
| AJ-008 | Définir cadrages desktop, intermédiaire et mobile | Terminé prototype | Adam CHABBI | Aucun visage tronqué aux breakpoints contrôlés | Captures 1440, 900 et 390 px | AJ-003 |
| AJ-009 | Ajouter une motion accessible | Terminé prototype | Adam CHABBI | Motion limitée à la lecture et désactivable | CSS `prefers-reduced-motion` | AJ-004 |
| AJ-010 | Structurer Apollon en trois coloris et S à XL | Terminé prototype | Adam CHABBI | Trois produits et quatre tailles exposés | `lib/products.ts` | Données AJ Luxury |
| AJ-011 | Intégrer matière et détails distinctifs | Terminé prototype | Adam CHABBI | Composition, ceinture et logo lisibles | Section matière et fiches | Descriptions client |
| AJ-012 | Simuler panier, checkout et compte | Terminé prototype | Adam CHABBI | Parcours navigable sans suggérer un paiement actif | Routes `/cart`, `/checkout`, `/account` | AJ-010 |
| AJ-013 | Créer boutique et pages de service | Terminé prototype | Adam CHABBI | Routes accessibles depuis la navigation | Build routes | AJ-010 |
| AJ-014 | Tester les parcours principaux | Terminé prototype | Adam CHABBI | Build réussi et tests automatisés sans échec | 16 tests sur 16 | AJ-004 à AJ-013 |
| AJ-015 | Documenter la reprise | Terminé prototype | Adam CHABBI | Architecture, contenus, parité et backlog accessibles | `README.md`, `docs/` | AJ-001 à AJ-014 |
| AJ-101 | Valider direction visuelle et cadrages | À valider | AJ Luxury | Validation écrite de la version | Retour Jérémy et Alex | Prototype livré |
| AJ-102 | Confirmer prix et promotions | À valider | AJ Luxury | Prix TTC et règles promotionnelles fournis | Décision métier | Discussion associés |
| AJ-103 | Confirmer stock vendable | À valider | AJ Luxury | Stock après réserve et dotations influenceurs | Tableau de stock validé | Stratégie influence |
| AJ-104 | Produire les retouches photo HD | À produire | Adam + Isabelle | Masters homogènes, HD et validés | Dossier d’exports finaux | Assets originaux, chiffrage |
| AJ-105 | Produire le master vidéo d’accueil | À produire | Adam + Isabelle | Boucle fluide, droits clairs, formats desktop/mobile | Fichiers vidéo masters | Direction validée, chiffrage |
| AJ-106 | Choisir et acheter le domaine | À valider | AJ Luxury, conseillé par Adam | Domaine détenu au nom d’AJ Luxury | Facture et accès registrar | Nom disponible |
| AJ-107 | Configurer hébergement et e-mails | À connecter | Adam CHABBI | Environnement production et e-mails opérationnels | Déploiement et DNS | AJ-106 |
| AJ-108 | Choisir et connecter le paiement | À connecter | AJ Luxury + Adam | Paiement test autorisé, refusé et remboursé | Recette prestataire | Compte marchand, AJ-102 |
| AJ-109 | Valider livraison et retours | À valider | AJ Luxury | Zones, tarifs, délais et politique confirmés | Matrice logistique | Transporteur |
| AJ-110 | Finaliser et valider les contenus légaux | À valider | AJ Luxury + Adam | Socle CGV, mentions, confidentialité, cookies et retours intégré ; identité et opérations confirmées | `docs/LEGAL-LAUNCH-REGISTER.md` | Données société, logistique, paiement, médiateur, conseil juridique |
| AJ-111 | Configurer mesure et consentement | À connecter | Adam CHABBI | Façade client inactive et bundle sans `order_paid` ; garde Vite client contre imports serveur directs, raw/url, glob et calculés ; produit `product_apollon`, 12 IDs `variant_boxer_*` et 12 références internes `AJ-APO-*` distinctes ; `order_paid` explicitement indisponible jusqu’à la D1 commerce canonique ; typecheck racine sans nouveau diagnostic Lot 2 | `docs/ANALYTICS-LOT-2.md` et tests automatisés | AJ-110 |
| AJ-112 | Recetter le commerce réel | À connecter | Adam + AJ Luxury | Paiement, stock, e-mails et erreurs testés | Procès-verbal de recette | AJ-102 à AJ-111 |
| AJ-113 | Mettre en ligne et documenter | À connecter | Adam CHABBI | Domaine actif, surveillance en place, accès transmis | URL production et runbook | AJ-112 |
| AJ-114 | Connecter la rétractation en ligne | À connecter | Adam CHABBI | Déclaration sans compte, confirmation explicite et accusé durable horodaté testés | Route `/withdrawal` et preuve de recette | Commandes, e-mail transactionnel, AJ-110 |

## Critères de passage en production

La mise en ligne commerciale exige la validation des prix, du stock réellement vendable, du domaine, du paiement, de la logistique, des textes légaux, des assets finaux et d’une recette complète. Le prototype démontre l’expérience et sécurise les choix de conception. Il ne remplace pas ces décisions de production.
