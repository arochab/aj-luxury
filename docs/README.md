# AJ Luxury — centre de documentation

Statut : `SOURCE D’ORIENTATION COURANTE`

Dernière mise à jour : 1er septembre 2026

Cette page est l’unique point d’entrée de la documentation AJ Luxury. Elle ne
remplace pas les documents métier : elle indique lequel fait foi pour chaque
question et empêche qu’un ancien brief soit pris pour l’état réel du site.

## Où trouver l’information

| Besoin | Document qui fait foi | Public visé |
|---|---|---|
| Savoir ce qui est réellement déployé, prêt ou encore bloqué | [`SYSTEM-STATUS.md`](./SYSTEM-STATUS.md) | Adam, Jérémy, technique |
| Traiter une commande et expédier un colis | [`JEREMY-ADMIN-GUIDE.md`](./JEREMY-ADMIN-GUIDE.md) | Jérémy |
| Déployer, prouver, promouvoir ou revenir en arrière | [`RELEASE-RUNBOOK.md`](./RELEASE-RUNBOOK.md) | Responsable release |
| Comprendre les composants, données et sécurités | [`TECHNICAL-ARCHITECTURE.md`](./TECHNICAL-ARCHITECTURE.md) | Technique, audit |
| Réagir à un incident sans créer de doublon | [`INCIDENT-PLAYBOOK.md`](./INCIDENT-PLAYBOOK.md) | Jérémy, Adam, support |
| Vérifier les exigences juridiques de lancement | [`LEGAL-LAUNCH-REGISTER.md`](./LEGAL-LAUNCH-REGISTER.md) | AJ Luxury, conseil juridique, release |
| Vérifier le stock physique et sa ventilation | [`internal/STOCK-LAUNCH-RECONCILIATION-2026-08-25.md`](./internal/STOCK-LAUNCH-RECONCILIATION-2026-08-25.md) | Jérémy, Adam |
| Comprendre la baseline et le périmètre du projet | [`PROJECT-BASELINE.md`](./PROJECT-BASELINE.md) | Pilotage projet |
| Lire les anciens plans et preuves techniques | [`BACKEND-LOT-2-ACTION-PLAN.md`](./BACKEND-LOT-2-ACTION-PLAN.md) et [`internal/`](./internal/) | Historique, audit |

## Arborescence

```text
docs/
├── README.md                         point d’entrée et règles d’autorité
├── SYSTEM-STATUS.md                  photographie factuelle du runtime
├── JEREMY-ADMIN-GUIDE.md             exploitation quotidienne
├── RELEASE-RUNBOOK.md                déploiement, preuves et rollback
├── TECHNICAL-ARCHITECTURE.md         systèmes, états et invariants
├── INCIDENT-PLAYBOOK.md              réactions sûres aux incidents
├── LEGAL-LAUNCH-REGISTER.md          registre juridique de lancement
├── PROJECT-BASELINE.md               périmètre et décisions structurantes
├── BACKEND-LOT-2-ACTION-PLAN.md      architecture technique détaillée
├── legal/                            sources et preuves juridiques
│   └── mediation/                    preuve médiateur et empreinte
└── internal/                         preuves, historiques et dossiers techniques
    ├── STOCK-LAUNCH-RECONCILIATION…  source stock courante
    ├── DRAFT-EMAILS-JEREMY…          textes de communication, non normatifs
    └── proofs/                       captures et reçus de recette
```

## Chaîne commerce en une lecture

```text
visiteur → panier → livraison → paiement Stripe confirmé
        → commande + stock + e-mails + facture
        → expédition Sendcloud unique
        → Admin AJ Luxury : préparation + étiquette A4
        → dépôt réel par Jérémy + preuve de dépôt
        → suivi transporteur → livraison
```

Règles cardinales :

- Stripe confirmé fait foi pour le paiement ;
- une commande payée produit une facture unique ;
- une expédition possède un identifiant et une étiquette uniques ;
- Jérémy prépare, imprime et remet le colis ; Adam n’opère pas la logistique ;
- le stock visible dans Admin est l’autorité opérationnelle courante ;
- aucun statut `live` ne peut être annoncé si le health public ne retourne pas
  simultanément `mode=live` et `publicCommerce=true`.

## Niveaux d’autorité

1. **Runtime et base de production** : vérité de fonctionnement à l’instant T.
2. **`SYSTEM-STATUS.md`** : photographie datée et explicitement sourcée.
3. **Runbook, guide Admin, registre juridique et manifeste stock** : procédures
   et règles métier courantes.
4. **Baseline** : périmètre et décisions structurantes, pas statut opérationnel.
5. **`internal/`, briefs et comptes rendus** : preuves ou historique. Ils ne
   remplacent jamais une source courante.

Lorsqu’un document historique est incompatible avec une source courante, il
doit être marqué `SUPERSEDED` au lieu d’être silencieusement réécrit.

## Discipline de mise à jour

Après chaque déploiement :

1. mettre à jour `SYSTEM-STATUS.md` avec SHA, Worker ID, Assets/Sites ID, mode et
   date de preuve ;
2. joindre les reçus de recette au dossier de preuve lié au SHA ;
3. mettre à jour le runbook uniquement si la procédure change ;
4. mettre à jour le guide Jérémy uniquement si son écran ou son geste change ;
5. ne jamais intégrer de secret, de jeton, de cookie, de numéro de carte ou de
   données client complètes dans le dépôt.
