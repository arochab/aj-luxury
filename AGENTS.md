# AJ Luxury — standards d’implémentation

Ces règles s’appliquent à toute évolution visuelle du projet, quel que soit l’agent ou l’outil utilisé.

## Périmètre e-commerce durable

- L’architecture de livraison est internationale et extensible. Au lancement, seules l’Union européenne, le Royaume-Uni, les États-Unis et le Canada sont dans le périmètre ; toute autre destination reste bloquée jusqu’à une instruction explicite et datée d’Adam.
- Le socle comprend le frontend et le backend standard de commerce nécessaires au catalogue, au paiement, aux comptes clients, au stock en ligne, aux commandes, à la livraison mondiale, à l’administration, aux e-mails, au déploiement et à la documentation.
- Le stock est géré en ligne par variante, avec administration protégée, contrôle avant paiement, décrément après commande payée et règles d’affichage publique convenues.
- Shopify est explicitement exclu par Adam depuis le 10 août 2026 ; ne jamais le réintroduire sans une nouvelle instruction explicite et datée.
- Les références internes des variantes sont générées par l’équipe projet à partir du modèle, du coloris et de la taille. Ne jamais demander à Jérémy de créer ou de fournir des SKU. Un éventuel code-barres EAN existant est facultatif et ne bloque pas le backend.
- Ne jamais réintroduire une limitation « France métropolitaine » ou une exclusion générale de la livraison internationale sans instruction explicite et datée d’Adam.
- Le contrat commercial AJ Luxury reste strictement bipartite entre AJ Luxury, représentée par Jérémy SCHEPPLER, et Adam CHABBI.

## Gouvernance et légèreté du dossier

- Maintenir un seul livrable canonique courant par usage ; supprimer les brouillons remplacés, rendus de contrôle, caches, profils temporaires et copies de déploiement devenus reproductibles après validation.
- Toute suppression reste bornée au projet, précédée d’un manifeste daté et d’une vérification des chemins, puis contrôlée contre les livrables et sources protégés.
- Conserver les sources de vérité, contrats de référence, preuves client, retours, actifs retenus, code, tests, quarantaines et archives non explicitement visées.
- Ne jamais conserver une ancienne variante contractuelle ambiguë ou tripartite à côté du contrat canonique lorsqu’elle a été explicitement remplacée.

## Mise en page

- Construire les compositions avec une grille, des ratios et des espacements explicites. Aucun correctif ponctuel par marge arbitraire.
- Un espace vide doit servir la hiérarchie, la respiration ou le focus. Un vide créé par deux hauteurs incompatibles est un défaut.
- Deux médias appariés sur une même ligne doivent partager le même cadre et finir à la même hauteur, à 1 px près.
- Les textes d’achat restent alignés à gauche pour la lisibilité. « Centré » signifie ici une composition équilibrée, pas un centrage systématique de chaque élément.
- Préserver en priorité le produit, le logo de ceinture et les visages. Aucun recadrage involontaire.

## Responsive et interactions

- Vérifier les trois fiches produits en 1920×1080, 1440×900, 1280×800, 1024×768, 768×1024, 430×932, 390×844 et 360×800.
- Aucun débordement horizontal du document.
- Les contenus doivent se réorganiser proprement à 320 px de large, sans perte d’information.
- Les cibles interactives principales mesurent au moins 44×44 px.
- Le zoom, le clavier, le focus visible et la fermeture par Échap doivent rester fonctionnels.

## Validation

- Exécuter `npm run lint`, `npm run build` et `npm test` après toute modification fonctionnelle ou visuelle importante.
- Contrôler visuellement les trois coloris, pas seulement une route représentative.
- Avant toute proposition de promotion : aucun bloqueur, aucune bande vide accidentelle, aucune coupe de visage et validation finale par un regard design, un regard responsive/accessibilité et un regard client.

## Retouches média ciblées — boucle courte obligatoire

- Une remarque limitée à une ou plusieurs photos, illustrations, vidéos, couleurs de fond ou règles de cadrage ouvre une **boucle de retouche média**, pas une nouvelle release. Elle n’autorise ni build complet, ni recette e-commerce globale, ni upload Cloudflare, ni déploiement contrôlé ou public.
- Pendant cette boucle, travailler uniquement sur une copie candidate locale des médias concernés et, si nécessaire, sur le composant qui les affiche. Ne toucher ni au backend, ni aux bindings, ni aux migrations, ni aux secrets, ni aux réglages de production.
- Produire d’abord une prévisualisation ciblée et légère : intégrité et dimensions du fichier, contrôle du recadrage, puis capture du seul écran concerné en mobile et desktop. Étendre les viewports ou les routes uniquement si la remarque les concerne réellement.
- Présenter les variantes à Adam avant de les intégrer définitivement. Tant qu’Adam continue à donner des retours photo, cumuler les corrections dans **un seul lot média non déployé** ; ne pas créer successivement plusieurs candidats Cloudflare.
- Pour une retouche média isolée, la vérification intermédiaire se limite au média et à la route impactée : chargement sans erreur, absence de déformation, visage et produit préservés, absence de débordement et cohérence mobile/desktop. La suite complète `lint + build + tests + recette e-commerce` n’est exécutée qu’une fois, quand le lot visuel est déclaré final.
- Les mots « corrige », « retravaille », « remplace l’image » ou « montre-moi » ne signifient jamais « déploie ». Un déploiement ne commence qu’après une instruction explicite de déployer le lot final et reste soumis aux validations exactes prévues ci-dessous.
- Avant la release finale, figer la liste des médias retenus, leurs emplacements et leurs empreintes ; regrouper toutes les retouches approuvées dans un seul commit, un seul SHA candidat, une seule recette proportionnée puis, si autorisé, un seul cycle de déploiement.
- Décision explicite d’Adam du 3 septembre 2026 : un lot strictement graphique (médias, fonds, cadrages et CSS de présentation, sans changement fonctionnel, commercial, de données, de sécurité, d’infrastructure, de binding ou de configuration) peut être déployé après sa recette proportionnée sans recueillir à nouveau les doubles approbations de release. Cette exception n’autorise jamais plusieurs mises en production successives pour une même boucle : cumuler les retours, puis effectuer un seul déploiement final. Toute modification qui sort de ce périmètre reste soumise aux validations de production ordinaires ci-dessous.

## Environnements et production

- La production est une référence en lecture seule. Ne jamais y développer, y tester ni y appliquer directement une modification.
- `ajluxurystore.com` reste l’unique domaine canonique de production. Le domaine `ajluxurystore.fr`, enregistré le 10 août 2026 comme réservation défensive, ne devient ni un second site, ni une nouvelle production, ni une zone e-mail sans décision explicite.
- Décision courante d’Adam du 11 août 2026 : le lancement e-commerce reste concentré sur `ajluxurystore.com`. Le `.fr` est reporté, hors chemin critique et hors critères d’ouverture. Une future activation devra uniquement rediriger en HTTPS `301` ou `308` l’apex et `www.ajluxurystore.fr` vers le `.com`, après un handoff séparé et une nouvelle validation explicite. Ne jamais maintenir deux déploiements ou contenus divergents ni présenter la release actuelle comme disponible sur le `.fr`.
- Toute éventuelle redirection du `.fr` est une mutation de domaine séparée combinant, selon la solution, DNS et service HTTP : apex et `www` en HTTPS, redirection permanente sans contenu dupliqué, snapshot préalable, preuve de recette et retour arrière documenté. Ne jamais recopier en bloc la zone DNS du `.com` vers le `.fr`.
- Les preuves sous `docs/internal/evidence/` sont internes et non publiables. Ne jamais les déplacer sous `public/`, les intégrer au bundle ou les exposer par une route du site.
- Toute évolution est d’abord isolée dans un environnement local ou de test distinct, avec une version candidate identifiable et un rollback préparé.
- Un résultat satisfaisant en test ne vaut pas autorisation de déploiement.
- Déployer une version candidate en production uniquement après validation explicite de cette même version, d’abord par Adam CHABBI puis par Jérémy SCHEPPLER.
- Sans ces deux validations explicites, rester en test et ne modifier ni la production, ni son domaine, ni sa configuration.
