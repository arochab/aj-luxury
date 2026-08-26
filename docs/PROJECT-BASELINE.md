# AJ Luxury — base de projet

## Statut

Au 7 août 2026, le périmètre contractuel du premier socle e-commerce est fixé
dans le contrat bipartite AJ Luxury / Adam CHABBI. La maquette responsive reste
la base visuelle ; le contrat et ses annexes gouvernent désormais les fonctions,
la recette, les responsabilités et les limites du forfait.

Dernière mise à jour de la gouvernance des domaines et de la release Hero : 11 août 2026.
Dernière décision stock d’Adam : 25 août 2026.

## Périmètre contractuel actuel

### Confirmé

- Site e-commerce orienté mobile et ordinateur.
- Identité AJ Luxury distincte de la référence ABEL P.
- Apollon, décliné en Pourpre Impérial, Rose Velours et Lilas Céleste.
- Tailles S à XL, 94% modal, 6% élasthanne.
- 756 unités initiales ; la fiche courante totalise 749 pièces après 4 ventes
  et 3 cadeaux déjà remis. 23 cadeaux restent réservés et 726 pièces sont
  vendables, soit 242 par coloris. La grille exacte par variante est dans
  `docs/internal/STOCK-LAUNCH-RECONCILIATION-2026-08-25.md`.
  à 61 vendables et 2 variantes à 60, selon
  `docs/internal/STOCK-VENTILATION-DECISION-2026-08-25.md`.
- Prix validé : 29,99 €.
- Frontend et backend standard de commerce nécessaires au périmètre convenu.
- Panier, paiement, comptes clients, commandes et e-mails transactionnels.
- Gestion en ligne des produits, variantes, prix, stocks, clients et commandes.
- Zones de lancement : Union européenne, Royaume-Uni, États-Unis et Canada, avec
  adresses internationales, tarifs, délais indicatifs, éligibilité et suivi standard.
- Adresse d’expédition et de retour retenue par Adam : 3 A rue Principale,
  67130 Belmont, issue du contrat contresigné.
- Code, accès et documentation à remettre selon l’architecture retenue.
- Validation par étapes.
- Domaine `ajluxurystore.com` actif et site publié sur l'hébergement AJ Luxury depuis le 8 août 2026 ; `www` est également actif en HTTPS.
- Domaine `ajluxurystore.fr` déclaré acheté par Jérémy le 10 août 2026 en réservation défensive et confirmé enregistré par l’AFNIC jusqu’au 10 août 2029. Décision courante d’Adam du 11 août : il reste parqué et reporté, hors chemin critique du lancement `.com`. Toute future activation sera une redirection vers le `.com`, sans second site et avec un handoff séparé.
- Aucun service d'e-mail professionnel ni compte de paiement n'est encore documenté comme opérationnel.
- Le candidat vidéo d’accueil v4 est intégré, recetté puis publié sur le `.com` comme
  version Sites 31 liée au SHA exact `c7362d3d04af6fc6070a15112a1fdff7878e09bd` :
  autoplay muet et `playsInline`, entrée progressive, lecture unique, pause/replay,
  sources responsive et politiques `prefers-reduced-motion`/`Save-Data`. Le déploiement
  du 11 août 2026 et le contrôle indépendant mobile/desktop sont PASS sans rollback ;
  la preuve courante est `docs/internal/RELEASE-HANDOFF-HERO-V4-2026-08-10.md`.

### Prérequis à fournir ou valider par AJ Luxury

- Double attestation du manifeste exact : responsable stock et responsable release.
- Grille UE/Royaume-Uni/États-Unis/Canada : transporteur, tarifs, délais, droits/taxes.
- Poids/dimensions du colis pour les tarifs réels. La composition 94 % modal /
  6 % élasthanne est confirmée et publiée ; Jérémy confirme simplement que
  l’étiquette textile correspondante est fixée aux produits, sans envoyer de
  photos d’emballage ni justifier un dispositif d’hygiène.
- CGV, mentions légales, traductions et textes d’e-mails validés.
- Comptes, contrats, vérifications d’identité et accès techniques des services tiers.
- Gouvernance des comptes : tous les actifs structurants restent au nom d’AJ Luxury.
- Pour le `.fr` défensif : aucune action n’est requise avant le lancement `.com`. Conserver la preuve de propriété, le renouvellement, la récupération, la double authentification et le verrou de transfert ; l’accès, la redirection et la politique e-mail seront traités ultérieurement.
- Pour la vidéo v4 : la confirmation écrite directe d’Isabelle, les validations Adam et
  Jérémy, le SHA, la version Sites, le déploiement et les smoke tests sont reliés dans le
  handoff interne. Conserver cette chaîne de preuve et le rollback version 30.

### Travaux séparés à évaluer

- Détourage et remplacement d’arrière-plans.
- Retouche photo en série.
- Création ou montage vidéo.
- Rédaction ou réécriture approfondie des contenus.
- Traductions.
- Services, abonnements, licences et frais de prestataires tiers.
- Backend ou API sur mesure, multi-entrepôts, moteur douanier ou fiscal sur mesure,
  logistique physique automatisée et intégrations supplémentaires non prévues au contrat.

## Séquence recommandée

1. Appel de cadrage.
2. Compte rendu et inventaire des actifs.
3. Proposition du périmètre de la première version.
4. Arborescence et direction visuelle.
5. Validation du planning et des responsabilités.
6. Conception des écrans principaux.
7. Choix technique après validation des besoins.
8. Développement, intégration, tests et mise en ligne.

## Périmètre de conseil

La prestation peut dépasser le développement du site : domaine, e-mails,
gouvernance des accès, production des actifs, paiement, stock, analytics, SEO,
préparation du lancement, documentation et accompagnement post-lancement.

## Règle de changement

Toute demande nouvelle est d’abord classée comme correction du périmètre validé,
option ou évolution ultérieure. Elle n’est intégrée qu’après confirmation écrite
de son impact sur le planning et, le cas échéant, sur le budget.
