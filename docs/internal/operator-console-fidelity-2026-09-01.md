# Console opérateur — registre de fidélité visuelle

Référence : `operator-console-concept-2026-09-01.png`
Rendus contrôlés : `operator-console-render-desktop-2026-09-01.png` et
`operator-console-render-mobile-2026-09-01.png`.

## Comparaison au-dessus de la ligne de flottaison

| Point | Référence | Implémentation | Verdict |
| --- | --- | --- | --- |
| Barre de marque | noir, marque à gauche, opérations/déconnexion à droite | même composition et même contraste | fidèle |
| Titre | capitales espacées, très grand, souligné par une règle fine | même hiérarchie, reflow propre sur mobile | fidèle |
| Résumé | deux lignes sobres avant la table | mêmes informations, formulation plus opérationnelle | écart volontaire |
| Table commandes | grille ouverte, aucun bloc arrondi | même principe, aucune carte décorative | fidèle |
| Action A4 | bouton noir unique et explicite | même action, libellé identique | fidèle |
| Statuts | texte et échelle de gris | même codage sans couleur ambiguë | fidèle |
| Mobile | non fourni dans la référence | empilement vertical, largeur 375 px sans débordement | adaptation nécessaire |

## Différences intentionnelles

- Le rendu local montre le verrou de sécurité au lieu de fausses commandes :
  aucune donnée de démonstration n'est injectée dans la console réelle.
- Le texte rappelle d'attendre le premier scan transporteur ; il évite de faire
  croire qu'un simple téléchargement vaut remise du colis.
- Le mobile compacte la navigation et empile la légende afin de préserver la
  lisibilité et l'absence de scroll horizontal.

## Contrôles

- Desktop : aucune carte arrondie, aucun gradient, aucun débordement.
- Mobile : `scrollWidth === clientWidth === 375` au viewport contrôlé.
- Les captures ne contiennent aucune PII ni commande réelle.
- La page reste fermée lorsque MFA/Access/D1 ne sont pas configurés.
