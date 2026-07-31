# AJ Luxury - registre des actifs de maquette

## Actifs client

Les 60 photographies reçues le 23 juillet 2026 sont conservées sans modification
dans `inputs_assets/client-photos-2026-07-23`. Dix-huit copies WebP optimisées
alimentent la maquette dans `public/images/client`.

Les fichiers reçus sont exclusivement des vues portées. Aucun vrai packshot sans
mannequin n’est disponible. Les recadrages portés ne doivent donc pas être
présentés comme des packshots.

## Introduction

L’introduction associe deux éléments indépendants :

- la photographie client `IMG_5517.JPG`, exportée sans détourage ni
  transformation des personnes dans `public/images/client/hero-duo-static.webp` ;
- une matière métallique WebGL originale, calculée en temps réel par
  `app/components/MetallicField.tsx` et placée uniquement derrière la photo.

Elle ne dépend d’aucune vidéo, banque d’images ou source filigranée. La photo
reste fixe ; l’animation peut être figée par l’utilisateur et l’est
automatiquement lorsque le système demande une réduction des mouvements.

## Retouche des fonds

La direction proposée distingue :

- accueil : fonds campagne plus profonds, cohérents avec les trois coloris ;
- fiches produit : fonds blanc-gris très clairs avec relief lumineux.

Le remplacement des fonds est un travail de production visuelle distinct de la
conception et du développement du site. Il doit être évalué à partir des
originaux, validé sur un échantillon, puis chiffré avant traitement en série.

## Actifs exclus

Les anciens prototypes vidéo basés sur des previews filigranées ont été retirés
du site et des livrables partageables. Ils sont isolés dans
`tmp/quarantine-nonlicensed` et ne doivent pas être diffusés.

Les deux anciennes boucles hero générées mais désormais inutilisées sont
archivées dans `tmp/archive-unused-hero-videos`. Elles restent récupérables,
mais ne sont plus incluses dans le déploiement public.
