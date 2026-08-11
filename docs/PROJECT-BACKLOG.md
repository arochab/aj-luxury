# AJ Luxury - Registre projet et backlog de livraison

Date de référence : 24 juillet 2026 — dernière mise à jour domaines/vidéo : 10 août 2026

## Gouvernance

- Client et décision métier : AJ Luxury, Jérémy et Alex, cofondateurs
- Responsable de la livraison : Adam CHABBI
- Périmètre Adam CHABBI : pilotage, cadrage, UX/UI, conception, réalisation, tests, documentation et coordination de production
- Actif vidéo v4 reçu d’Isabelle et intégré à la demande d’Adam en candidat test ;
  aucune obligation future, licence, disponibilité ou responsabilité d’Isabelle
  n’est inférée. Toute nouvelle contribution reste `PROPOSED — ISABELLE NOT YET CONFIRMED`.
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
| AJ-014 | Tester les parcours principaux | Terminé prototype | Adam CHABBI | Build réussi et tests automatisés sans échec | 75 tests sur 75 au candidat v4 | AJ-004 à AJ-013 |
| AJ-015 | Documenter la reprise | Terminé prototype | Adam CHABBI | Architecture, contenus, parité et backlog accessibles | `README.md`, `docs/` | AJ-001 à AJ-014 |
| AJ-101 | Valider direction visuelle et cadrages | À valider | AJ Luxury | Validation écrite de la version | Retour Jérémy et Alex | Prototype livré |
| AJ-102 | Connecter le prix validé | À connecter | Adam CHABBI | Prix de 29,99 € appliqué côté serveur ; promotions traitées séparément | `docs/COPY-SOURCE-REGISTER.md` | Backend commerce |
| AJ-103 | Déduire les réserves du stock physique connu | À valider | AJ Luxury | 756 unités enregistrées ; quantités cadeaux/influenceurs et sécurité isolées | `lib/commerce/internal-stock.ts` et décision Jérémy | Stratégie influence |
| AJ-104 | Produire les retouches photo HD | À produire | Adam CHABBI ; contribution d’Isabelle `PROPOSED — ISABELLE NOT YET CONFIRMED` | Masters homogènes, HD et validés | Dossier d’exports finaux | Assets originaux, accord direct d’Isabelle, droits et chiffrage |
| AJ-105 | Qualifier et intégrer le master vidéo d’accueil v4 | Terminé production `.com` | Adam CHABBI (intégration) ; AJ Luxury (décision) | Version Sites 31 du SHA `c7362d3` publiée ; autorisation directe d’Isabelle pour l’usage de la vidéo sur le site AJ Luxury archivée ; autoplay, lecture unique, replay, responsive, reduced-motion, médias, sécurité et vitesse HTTP contrôlés ; verdict indépendant PASS sans rollback | `docs/VIDEO-CANDIDATE-V4-2026-08-10.md`, `docs/internal/RELEASE-HANDOFF-HERO-V4-2026-08-10.md` | Surveillance et rollback version 30 |
| AJ-106 | Gouverner le `.com` canonique et le `.fr` défensif | `.com` terminé ; `.fr` bloqué accès | AJ Luxury, conseillé par Adam | `.com` canonique actif ; `.fr` enregistré et destiné uniquement à rediriger apex+www en HTTPS vers le `.com` ; aucun site dupliqué | `docs/internal/DNS-CUTOVER-2026-08-08.md`, `docs/internal/DOMAIN-PROTECTION-FR-2026-08-10.md`, facture et accès registrar | Jérémy doit partager la gestion domaine/DNS du `.fr` à Adam |
| AJ-107 | Configurer hébergement et e-mails | À connecter | Adam CHABBI | Environnement production et e-mails opérationnels | Déploiement et DNS | AJ-106 |
| AJ-108 | Choisir et connecter le paiement | À connecter | AJ Luxury + Adam | Paiement test autorisé, refusé et remboursé | Recette prestataire | Compte marchand, AJ-102 |
| AJ-109 | Configurer livraison et retours | À valider | AJ Luxury + Adam | Zones UE/Royaume-Uni/États-Unis/Canada et adresse Belmont acquises ; colis, tarifs, délais, droits/taxes et retours confirmés | Matrice logistique | Données colis, transporteur, validation comptable |
| AJ-110 | Finaliser et valider les contenus légaux | À valider | AJ Luxury + Adam | Socle CGV, mentions, confidentialité, cookies et retours intégré ; identité et opérations confirmées | `docs/LEGAL-LAUNCH-REGISTER.md` | Données société, logistique, paiement, médiateur, conseil juridique |
| AJ-111 | Configurer mesure et consentement | À connecter | Adam CHABBI | Consentement et événements commerce testés | Plan de taggage et recette | AJ-110 |
| AJ-112 | Recetter le commerce réel | À connecter | Adam + AJ Luxury | Paiement, stock, e-mails et erreurs testés | Procès-verbal de recette | AJ-102 à AJ-111 |
| AJ-113 | Mettre en ligne et documenter | À connecter | Adam CHABBI | Domaine actif, surveillance en place, accès transmis | URL production et runbook | AJ-112 |
| AJ-114 | Connecter la rétractation en ligne | À connecter | Adam CHABBI | Déclaration sans compte, confirmation explicite et accusé durable horodaté testés | Route `/withdrawal` et preuve de recette | Commandes, e-mail transactionnel, AJ-110 |

## Critères de passage en production

La mise en ligne commerciale exige la validation des prix, du stock réellement vendable, du domaine, du paiement, de la logistique, des textes légaux, des assets finaux et d’une recette complète. Le prototype démontre l’expérience et sécurise les choix de conception. Il ne remplace pas ces décisions de production.
