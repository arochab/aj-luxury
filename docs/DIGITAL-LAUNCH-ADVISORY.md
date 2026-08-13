# AJ Luxury - recommandation de lancement digital

Dernière vérification tarifaire : 23 juillet 2026.

## Recommandation économique

Pour le lancement, éviter d’empiler des abonnements. La base la plus légère et
crédible est :

| Besoin | Recommandation initiale | Coût public constaté |
| --- | --- | --- |
| Domaine principal | `.fr` chez OVHcloud, au nom d’AJ Luxury | 5,99 € TTC la première année, puis 9,35 € TTC/an |
| E-mail professionnel | E-mail Starter inclus avec le domaine OVHcloud | Inclus selon l’offre `.fr` consultée |
| Hébergement du front | Cloudflare Pages Free | 0 $, avec domaine personnalisé et SSL |
| Paiement | Stripe Checkout hébergé | Aucun abonnement ; 1,5% + 0,25 € par carte standard EEE |
| Catalogue et stock | Base légère reliée au site, à confirmer après cadrage | Peut démarrer sur un palier gratuit, mais nécessite une intégration et une administration fiables |

Sources officielles :

- OVHcloud `.fr` : https://www.ovhcloud.com/fr/domains/tld/fr/
- Cloudflare Pages : https://pages.cloudflare.com/
- Stripe France : https://stripe.com/fr/pricing
- Stripe Checkout : https://stripe.com/fr/payments/checkout

## Pourquoi cette approche

- Très peu de coûts fixes avant les premières ventes.
- Le design et le code restent indépendants d’un thème e-commerce imposé.
- Stripe héberge la saisie bancaire : aucune donnée de carte ne transite par le
  site AJ Luxury.
- Le dispositif peut évoluer si les commandes, pays ou besoins opérationnels
  augmentent.

Ce scénario est le moins cher en coût récurrent, pas nécessairement en temps de
conception. Il demande de construire proprement le catalogue, le stock, les
commandes et les webhooks. Adam a explicitement écarté Shopify le 10 août 2026 :
le projet conserve donc un socle commerce indépendant, une administration minimale
et des prestataires spécialisés remplaçables, sans plateforme e-commerce imposée.

## Règle de propriété

Tous les comptes structurants doivent être créés au nom d’AJ Luxury :

- domaine et registrar ;
- hébergement et DNS ;
- compte de paiement ;
- plateforme e-commerce éventuelle ;
- analytics et outils marketing ;
- adresses e-mail.

Le prestataire intervient comme administrateur ou collaborateur. Il ne doit pas
être propriétaire du domaine, des moyens de paiement ou des données client.

## Méthode agentique et réversibilité

Le projet est le premier projet client conduit de bout en bout avec une
organisation de développement agentique. Cette transparence ne doit pas être
confondue avec une absence d’expertise technique : le code reste conçu, relu,
testé et maintenable par le prestataire, qui assume les choix et la qualité du
livrable.

L’IA sert à accélérer la recherche, les variantes de conception, la production,
les contrôles et la documentation. Elle n’est ni le propriétaire du résultat ni
un substitut à la validation humaine.

AJ Luxury doit pouvoir reprendre le projet avec le prestataire, en interne ou
avec un autre développeur. La remise finale doit donc inclure le code source, les
accès, les procédures d’installation et de déploiement, l’architecture, les
variables de configuration et un guide de modification des contenus.

## Points à décider pendant ou après le premier échange

1. Marché initial : France uniquement ou ambition internationale immédiate.
2. Domaine principal : `.fr`, `.com` ou réservation des deux.
3. Dénomination réellement disponible et cohérente avec la marque.
4. Nombre d’adresses e-mail nécessaires.
5. Niveau d’autonomie attendu pour les stocks, commandes et remboursements.
6. Préférence entre coûts fixes faibles avec davantage de sur-mesure, ou
   abonnement plus élevé avec back-office prêt à l’emploi.

## Élargissement naturel de la prestation

La mission peut être structurée en lots indépendants :

1. cadrage produit, marque et parcours ;
2. création des comptes, domaine, e-mails et gouvernance des accès ;
3. production et normalisation des actifs visuels ;
4. design et développement du site ;
5. paiement, stock, commandes et intégrations ;
6. SEO, analytics, consentement et préparation du lancement ;
7. maintenance, optimisation de conversion et accompagnement de croissance.

Chaque lot doit avoir son périmètre, ses livrables, ses validations et son coût.
