# Migration GitHub AJ Luxury - 11 août 2026

Statut : `IN PROGRESS - NO LOCAL DELETE BEFORE RESTORE PROOF`

## Architecture cible

1. `arochab/aj-luxury`, privé : code, tests, migrations, documentation gouvernée et assets web optimisés.
2. `arochab/aj-luxury-private-vault`, privé : archives client sensibles et actifs sources, hors historique du dépôt code.
3. `sites-origin` : canal d'hébergement conservé ; aucune promotion production déclenchée par la migration.

## État gelé

- Frontend et vidéo d'accueil : production existante inchangée.
- Lot 2 intégré : branche `codex/lot2-integrated-i06-20260811`.
- Démo client locale : branche `codex/lot2-customer-journey-demo-20260811`, sans service réel.
- Fulfillment D03 : branche WIP `codex/lot2-d03-fulfillment-20260811`, deux gates P1 encore ouverts au gel ; non déployable.

## Gates obligatoires avant suppression locale

- [ ] Tous les travaux suivis ou utiles sont commités sur une branche nommée.
- [ ] Toutes les branches et tous les tags retenus sont présents sur GitHub.
- [ ] Le coffre privé contient les archives, leurs manifests et leurs SHA-256.
- [ ] Un `git bundle` complet est attaché au coffre privé.
- [ ] Un clone vierge du dépôt principal passe installation, lint, build et tests.
- [ ] Un téléchargement de contrôle des archives du coffre correspond aux SHA-256.
- [ ] Le dépôt est privé, sans collaborateur inattendu, et `main` est la branche par défaut.
- [ ] Le remote `sites-origin` est documenté et aucune production n'a été modifiée.
- [ ] Le chemin local exact a été revérifié et les jonctions sont supprimées sans suivre leur cible.
- [ ] Le seul artefact local AJ Luxury restant est un raccourci vers GitHub.

## Restauration

```bash
git clone https://github.com/arochab/aj-luxury.git
cd aj-luxury
npm ci
npm run lint
npm test
```

Les archives client se téléchargent depuis les releases privées du coffre. Elles ne doivent pas être extraites dans un dépôt public ni copiées sous `public/`.
