# AJ Luxury — dry run commerce et non-régression

Statut : `ACTIVE RUNBOOK — 2026-08-27`
Owner final : Adam CHABBI

Ce document ne remplace pas l’état vivant du projet. Il fixe les erreurs réellement rencontrées pendant la première commande contrôlée et les contrôles obligatoires avant toute nouvelle démonstration.

## Règle de démonstration

- Un dry run répétable s’arrête sur l’écran Stripe avant le dernier clic « Payer ».
- Un paiement réel n’est jamais supprimé pour recommencer une démonstration. Il exige le flux normal de commande, puis un remboursement si Adam le décide explicitement.
- Le compte et la commande de démonstration utilisent des identifiants exacts relevés après création. Aucun nettoyage par e-mail seul, motif large ou ancien identifiant.

## Incidents rencontrés et règle permanente

| Incident observé | Cause ou mécanisme | Règle de non-régression |
|---|---|---|
| Création ou connexion au compte affichant « service momentanément indisponible » | Runtime cryptographique, liaison D1 ou configuration Worker incohérente | Tester inscription, connexion, déconnexion et mot de passe oublié dans le navigateur public avant chaque démo. |
| Lien de confirmation aboutissant à une erreur Cloudflare 1101 | Exception Worker et tentative de réécriture d’un historique de commande immuable | Vérifier le lien réel reçu par e-mail et préserver les snapshots de commande immuables. |
| E-mail de confirmation classé en spam | Réputation et authentification expéditeur encore jeunes | Tester réception réelle, SPF, DKIM, DMARC, expéditeur stable et contenu transactionnel sobre. |
| Devis de livraison indisponible ou retour impossible après réservation | Citation Sendcloud expirée, session de panier ancienne ou commande déjà réservée | Tester panier neuf, adresse, citation, modification de livraison et retour au panier sur le domaine officiel. |
| Domicile absent alors que seul le relais apparaît | Services transporteurs ou mapping de modes incomplets | Vérifier séparément domicile et point relais pour chaque transporteur réellement activé. |
| Ancienne interface servie après correction | Cache navigateur, cache edge ou URL de preuve ancienne | Vérifier le SHA public, utiliser une URL fraîche et purger uniquement le cache nécessaire. |
| Nom personnel visible dans Stripe | Branding du compte Stripe incomplet | Vérifier « AJ Luxury » sur l’écran Stripe final avant toute démonstration. |
| Compte non associé ou non recréable après un essai | Compte encore actif, sessions ou mot de passe conservés | Le reset doit libérer l’e-mail, supprimer le mot de passe et révoquer sessions, challenges et liens. |
| Suppression physique du client refusée | La commande conserve un lien historique protégé et immuable | Utiliser l’anonymisation logique prévue, jamais désactiver les triggers ni casser l’historique. |
| Changement direct du statut de paiement refusé | D1 exige un événement prestataire vérifié | Ne jamais forcer un paiement. Vérifier Stripe et passer par le webhook authentique ou conserver une trace locale non payée. |
| Événement Stripe d’expiration reçu comme « stale » | Les réservations avaient déjà expiré avant l’événement | Ne pas le convertir artificiellement en paiement. Vérifier zéro stock bloqué, puis annuler séparément la commande impayée. |
| Création d’une clé API temporaire inquiétante pour Adam | Intention de sécurité insuffisamment expliquée avant l’action | Expliquer avant création, privilégier le secret existant chiffré, limiter strictement, révoquer immédiatement et prouver la disparition. |

## Reset autorisé d’un dry run impayé

1. Relever l’identifiant exact de la session Stripe, de la commande, du paiement, du panier et du client.
2. Vérifier côté Stripe : `livemode=true`, montant exact, `payment_status=unpaid`, session encore ouverte ou déjà expirée.
3. Expirer la session Stripe exacte. Vérifier `status=expired` et toujours `unpaid`.
4. Vérifier en D1 qu’aucun paiement n’est `succeeded` ou `refunded`.
5. Vérifier qu’aucune réservation n’est `active` ou `converted`. Une réservation `expired` ne bloque plus le stock.
6. Passer la commande de `pending_payment` à `cancelled` uniquement avec `paid_at=NULL`.
7. Anonymiser le compte de test, supprimer son secret de mot de passe et révoquer sessions, challenges et liens.
8. Conserver uniquement la trace immuable « commande annulée / non payée ».
9. Refaire les contrôles ci-dessous avant de donner le GO.

## Gate obligatoire avant GO démonstration

- Stripe : session expirée et impayée pour l’ancien essai.
- Commande précédente : `cancelled`, `paid_at=NULL`.
- Stock : zéro réservation active ou convertie et zéro unité bloquée.
- Identité : aucun client actif avec l’e-mail de démonstration, aucun mot de passe, aucune session, aucun challenge et aucun lien actif.
- Santé commerce : `status=ready`, `blockers=[]`, SHA public attendu.
- Navigateur public : la page Compte propose « Créer un compte » sans message d’indisponibilité.
- Parcours neuf : compte, e-mail, confirmation, connexion, packs, livraison, Stripe.

## Critère de réussite du dry run solo

Le dry run solo est réussi lorsque le compte est confirmé, la connexion fonctionne, le panier et les packs sont cohérents, une livraison est sélectionnée, la commande est réservée et l’écran Stripe affiche AJ Luxury, le bon e-mail, le bon contenu, le bon montant et les bons frais. Adam s’arrête avant « Payer », transmet l’écran final, puis demande explicitement le reset.
