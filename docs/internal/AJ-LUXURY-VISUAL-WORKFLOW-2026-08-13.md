# AJ Luxury — workflow visuel gouverné

Statut : `PROPOSED — ISABELLE NOT YET CONFIRMED`
Périmètre : préproduction privée uniquement. Aucun actif nouveau attribué à
Isabelle ne peut être publié avant son accord direct, la vérification de ses
droits et l'inventaire de provenance.

## Direction retenue : Reflet d'Apollon

Le site conserve le décor métallique et la vidéo V4 déjà validés. Les
interventions sont locales et réversibles : cadrage protégé, visages issus de la
photographie client autorisée, puis reflet métallique procédural lent. Aucun
visage, corps ou produit n'est généré.

Les références suivantes servent uniquement de prismes techniques généraux ;
aucun style individuel n'est copié et aucune participation n'est suggérée :

- Irving Penn : priorité au sujet, composition retenue et précision ;
  https://www.metmuseum.org/exhibitions/listings/2017/irving-penn-centennial
- Lillian Bassman : séparation lumineuse et contours argentés ;
  https://www.metmuseum.org/art/collection/search/933658
- Tim Walker : cohérence entre décor, matière et narration ;
  https://www.vam.ac.uk/exhibitions/tim-walker
- Nick Knight / SHOWstudio : technologie au service d'une direction humaine ;
  https://www.showstudio.com/projects/ai/conversation-nick-knight-and-mario-klingemann-on-the-potentials-of-ai
- Sølve Sundsbø / SHOWstudio : mouvement lent concentré sur la matière ;
  https://www.showstudio.com/projects/perroquet/fashion-film

## Intake des prochains visuels

Chaque export proposé doit arriver dans un lot daté, hors dossier public, avec :

1. fichier source et export final, au moins 2400 px sur le grand côté ;
2. auteur, outil et références d'entrée ;
3. personnes représentées et preuve de leur accord ;
4. droits d'usage commercial AJ Luxury et éventuelles contraintes d'employeur ;
5. transformations effectuées et présence éventuelle d'IA générative ;
6. hash SHA-256 et destination proposée : accueil, histoire ou éditorial ;
7. validation directe d'Isabelle, puis validation d'Adam et Jérémy.

Formats préparés : 16:9 avec zone sûre centrale, 4:5, 3:4 et 1:1. Les têtes,
les produits et les logos doivent rester entièrement visibles. Aucun fichier ne
sera copié dans `public/` avant le dernier gate.

## Règles de production

- Les identités et produits restent photographiques et inchangés.
- L'IA peut proposer un décor original ou une matière, jamais remplacer un
  visage réel ou inventer une caractéristique produit.
- Les retouches se limitent au fond, à la colorimétrie, au grain, à l'ombre de
  contact et au raccord de lumière.
- Les noms, logos et codes reconnaissables d'autres marques sont exclus.
- Les fichiers intermédiaires restent dans le workspace ; seuls les exports
  approuvés et leur manifeste peuvent rejoindre la préproduction.
- Une approbation de préproduction ne vaut jamais approbation de production.

## Gate qualité

- Comparaison à la photographie source à 100 % : identité et produit fidèles.
- Contrôle aux viewports 1920x1080, 1440x900, 1280x800, 1024x768,
  768x1024, 430x932, 390x844, 360x800 et vérification sans perte à 320 px.
- Aucun halo, découpe visible, visage déformé, membre ajouté ou texte inventé.
- `prefers-reduced-motion`, pause utilisateur, hors écran et onglet masqué
  doivent arrêter le mouvement.
- Lint, build, tests, audit indépendant, capture desktop/mobile et validation
  humaine sur le SHA exact précèdent toute publication privée.
