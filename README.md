# AJ Luxury

Source privée et gouvernée du site e-commerce AJ Luxury.

## État courant

- Production canonique : [ajluxurystore.com](https://ajluxurystore.com)
- Domaine `.fr` : réservation défensive, hors chemin critique
- Production : lecture seule ; aucune modification sans validation d'Adam CHABBI puis de Jérémy SCHEPPLER
- Backend Lot 2 : développé sur des branches dédiées, non connecté et non déployé tant que les gates ne sont pas passés
- Shopify : explicitement exclu

Les règles permanentes sont dans [`AGENTS.md`](./AGENTS.md). Le point d'entrée
unique de la documentation est [`docs/README.md`](./docs/README.md) ; l'état
opérationnel courant est consigné dans
[`docs/SYSTEM-STATUS.md`](./docs/SYSTEM-STATUS.md). La baseline reste dans
[`docs/PROJECT-BASELINE.md`](./docs/PROJECT-BASELINE.md) et ne doit pas être
confondue avec le statut du runtime.

## Dépôts GitHub

- Code, tests, migrations et documentation gouvernée : `arochab/aj-luxury`
- Contrats, preuves, voix et médias sources : [`arochab/aj-luxury-private-vault`](https://github.com/arochab/aj-luxury-private-vault), accès privé uniquement

Les données client sensibles ne doivent jamais être ajoutées au dépôt code. Elles sont conservées sous forme d'archives privées avec manifeste et hashes dans le coffre séparé.

## Démarrage local

Prérequis : Node.js `>=22.13.0`.

```bash
git clone https://github.com/arochab/aj-luxury.git
cd aj-luxury
npm ci
npm run lint
npm test
```

`npm test` exécute le build puis les tests de non-régression. Les branches Lot 2 disposent de tests supplémentaires propres à leur périmètre.

## Branches importantes au gel GitHub

- `main` : baseline gouvernée du frontend validé
- `candidate/hero-v4-2026-08-10` : candidat vidéo d'accueil validé
- `codex/lot2-integrated-i06-20260811` : intégration Lot 2 actuellement acceptée comme fondation
- `codex/lot2-customer-journey-demo-20260811` : démonstration locale isolée, données fictives uniquement
- `codex/lot2-d03-fulfillment-20260811` : travail fulfillment conservé en WIP, non approuvé pour production

Les autres branches historiques sont conservées sur GitHub pour traçabilité. Elles ne deviennent pas automatiquement des sources de vérité.

## Déploiement

Le dépôt GitHub est la source de collaboration et de reprise. Le remote `sites-origin` reste le canal technique d'hébergement. Un push GitHub ne déploie rien en production.

Avant toute promotion : build, lint, tests, revue sécurité, validation d'Adam puis validation de Jérémy, avec rollback documenté.
