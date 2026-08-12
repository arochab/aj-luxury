# Migration GitHub AJ Luxury - 12 août 2026

Statut : `COMPLETE - REMOTE RECOVERY VERIFIED`

## Architecture finale

1. `arochab/aj-luxury`, privé : code, tests, migrations, documentation gouvernée et assets web optimisés.
2. `arochab/aj-luxury-private-vault`, privé : archives client sensibles et actifs sources, hors historique du dépôt code.
3. `sites-origin` : canal d'hébergement conservé ; aucune promotion production déclenchée par la migration.

## Baseline vérifiée

- Branche par défaut : `main`.
- Baseline code testée : `742e337f420620121d5899c460d0da7720538058` ; le commit documentaire final est porté par `main`.
- CI GitHub : succès sur la baseline code ; le commit documentaire ne modifie aucun code exécutable.
- Clone indépendant : `npm ci`, lint, build, 188 tests et audit production réussis.
- Coffre : 10 actifs distants, manifests et SHA-256 concordants.
- Restauration : 336 fichiers client/source/preuve sur 336 vérifiés ; bundle Git valide ; archive Git finale lisible avec 1 950 entrées.
- Accès : dépôts privés, propriétaire unique `arochab` au contrôle.
- Production : aucun deployment, environnement, hook, secret ou GitHub Pages créé par cette migration.

## État fonctionnel gelé

- Frontend et vidéo d'accueil : production existante inchangée.
- Lot 2 intégré : branche `codex/lot2-integrated-i06-20260811`.
- Démo client : branche `codex/lot2-customer-journey-demo-20260811`, sans service réel.
- Fulfillment D03 : branche WIP `codex/lot2-d03-fulfillment-20260811`, deux gates P1 encore ouverts au gel ; non déployable.

## Gates de suppression locale

- [x] Tous les travaux suivis ou utiles sont commités sur une branche nommée ou archivés dans le coffre.
- [x] Toutes les branches et tous les tags retenus sont présents sur GitHub.
- [x] Le coffre privé contient archives, manifests et SHA-256.
- [x] Un bundle Git complet est attaché au coffre privé et a été retéléchargé puis vérifié.
- [x] Un clone vierge passe installation, lint, build, tests et audit production.
- [x] Les téléchargements de contrôle correspondent aux SHA-256 et leurs contenus aux manifests.
- [x] Le dépôt est privé, sans collaborateur inattendu, et `main` est la branche par défaut.
- [x] `sites-origin` est documenté et aucune production n'a été modifiée.
- [ ] Les 14 jonctions locales doivent être supprimées comme liens sans suivre leurs cibles.
- [ ] Après retrait local, le seul artefact AJ Luxury doit être le raccourci GitHub.

## Risque résiduel accepté

La protection de branche GitHub n'est pas disponible pour ce dépôt privé avec l'offre actuelle. La CI reste obligatoire par gouvernance avant toute évolution. Les propositions Dependabot incompatibles ont été fermées sans fusion.

L'audit des dépendances de production est à zéro vulnérabilité. GitHub signale encore des avis sur des dépendances de développement/outillage ; ils ne sont pas fusionnés automatiquement et doivent être traités dans une évolution de compatibilité séparée.

## Restauration

```bash
git clone https://github.com/arochab/aj-luxury.git
cd aj-luxury
npm ci
npm run lint
npm test
npm audit --omit=dev --audit-level=high
```

Les archives client se téléchargent depuis la release privée `local-migration-2026-08-11` du coffre. Elles ne doivent jamais être extraites dans un dépôt public ni copiées sous `public/`.
