# AJ Luxury — playbook d’incident commerce

Statut : `SOURCE DE RÉACTION COURANTE`

Dernière mise à jour : 3 septembre 2026

Principe : protéger l’argent, le client et l’unicité des objets avant de chercher
à aller vite. Conserver le numéro de commande, l’heure et le message exact ; ne
jamais copier de secret, de cookie, de carte ou d’adresse complète dans un ticket.

## Le client a payé mais voit « vérification du paiement »

1. Ne pas lui demander de payer une seconde fois.
2. Vérifier la commande dans Admin et le paiement dans Stripe.
3. Si Stripe indique `réussi`, attendre ou rapprocher le webhook avec le même
   PaymentIntent ; ne pas recréer la commande.
4. Si le résultat reste ambigu, laisser la commande en vérification et escalader
   à Adam avec le numéro de commande.

Résultat sain : un paiement, une commande, un stock décrémenté une fois.

## Un e-mail de confirmation manque

1. Vérifier séparément `confirmation commande` et `confirmation paiement` dans
   Admin ; ce sont deux messages distincts.
2. Rechercher le message correspondant dans Resend avec le numéro de commande.
3. Rapprocher la preuve fournisseur avec l’outbox existante.
4. Ne jamais recréer la commande ou renvoyer en boucle.

Résultat sain : une preuve par type d’e-mail, sans doublon de commande.

## L’étiquette n’est pas prête

1. Vérifier le statut de l’expédition et l’absence ou présence de référence
   Sendcloud.
2. Première commande historique seulement : si Admin propose la correction,
   Jérémy saisit le téléphone E.164 et confirme une fois.
3. Si Admin indique une vérification transporteur, ne pas recliquer.
4. Si une référence provider existe, rapprocher cette expédition dans Sendcloud
   au lieu d’en créer une autre.

Résultat sain : une expédition, une facturation transporteur, une étiquette A4.

## L’impression A4 est illisible

1. Retélécharger la même étiquette depuis Admin ; cette action ne crée pas un
   second colis lorsque l’étiquette existe déjà.
2. Imprimer en portrait, A4, échelle 100 %, sans « ajuster à la page ».
3. Vérifier visuellement l’adresse et le code-barres.
4. Ne pas acheter une nouvelle étiquette pour résoudre un problème d’imprimante.

## Un doublon d’expédition est suspecté

1. Stopper toute nouvelle création et tout nouveau clic.
2. Rapprocher la commande, le shipment D1, la référence provider et le tracking.
3. Vérifier l’audit et le reçu fournisseur.
4. Annuler chez le fournisseur uniquement après identification certaine du
   doublon et de l’étiquette à conserver.

## Le stock paraît faux

1. Suspendre la variante concernée si le risque de survente est réel.
2. Comparer stock physique, cadeaux, réservations actives et ventes confirmées.
3. Identifier le mouvement manquant ou en trop ; ne pas écraser le total à la main.
4. Corriger par un mouvement traçable et refaire l’agrégat.

Résultat sain : stock global et somme des douze variantes réconciliés.

## L’accès Admin échoue

1. Vérifier que l’adresse utilisée figure exactement dans l’allowlist courante.
2. Vérifier que le compte AJ Luxury a bien été confirmé par e-mail.
3. Réessayer une seule fois le mot de passe. Après cinq erreurs, attendre quinze
   minutes ou utiliser la procédure `Mot de passe oublié`.
4. Ouvrir `https://ajluxurystore.com/admin`. Aucun MFA, clé physique ou écran
   Cloudflare ne fait partie du parcours normal.
5. Si une personne non autorisée accède aux données de `/admin` ou à une API
   Admin, incident critique :
   repasser ou rester en mode contrôlé et corriger avant toute exploitation.

## La santé commerce n’est plus `ready`

1. Ne pas ouvrir de nouvelles ventes.
2. Conserver la réponse health et l’identifiant de version.
3. Restaurer d’abord le Worker précédent, puis les Assets si nécessaire.
4. Ne pas restaurer D1 automatiquement : les migrations sont additives et une
   restauration Time Travel écrase la base.

## Retour ou remboursement

1. Conserver la facture initiale inchangée.
2. Attendre la décision métier et le signal Stripe confirmé.
3. Vérifier qu’un avoir unique est créé pour le montant remboursé.
4. Ne jamais utiliser l’étiquette transporteur comme facture ou avoir.

## Informations minimales d’escalade

- numéro de commande ;
- heure UTC approximative ;
- écran ou étape concernée ;
- statut lisible dans Admin ;
- message d’erreur exact ;
- action déjà tentée, une seule fois ;
- présence ou absence de référence Stripe, Resend ou Sendcloud expurgée.
