# AJ Luxury — brief call Jérémy du 25 août 2026

Document de travail interne pour Adam. Le PDF final sera produit uniquement
après la fin du raccordement et de la recette réelle. Objectif du call : sortir
avec toutes les décisions et pièces qui permettent une première commande
réelle, puis l’ouverture au public. Durée conseillée : 30 minutes.

## Verdict en une phrase

Le site, le paiement et le stock sont techniquement prêts à être raccordés,
mais la vente publique doit rester fermée tant que le régime de TVA, l’activité
e-commerce, le numéro professionnel, le médiateur et le stock par taille/couleur
ne sont pas confirmés par Jérémy.

## 1. Ce qui est décidé

| Sujet | Décision |
|---|---|
| Produit unitaire | 29,99 € |
| Pack de 2 | 49,99 € — économie de 9,99 €, soit 16,66 % |
| Pack de 3 | 69,99 € — économie de 19,98 €, soit 22,21 % |
| Composition des packs | Deux ou trois coloris identiques ou différents ; pas de stock « pack » séparé |
| Disponibilité | Un pack est proposé seulement si chaque taille/coloris choisi est réellement disponible |
| Stock total | 756 pièces physiques : 730 vendables + 26 cadeaux/réserve |
| Livraison au lancement | France métropolitaine, Corse comprise, et les 26 autres pays de l’Union européenne |
| Hors Union européenne | EORI déjà valide ; ouverture séparée après validation des transporteurs, douanes, droits, taxes et retours |
| Transport | Options Sendcloud réellement disponibles selon le pays et l’adresse ; prix et délai affichés avant paiement |
| Expédition et retours | 3 A rue Principale, 67130 Belmont |
| Téléphone | Aucun numéro personnel publié ; ligne OVH séparée à 1,19 € TTC/mois |
| Médiateur | SMP, 30 € TTC pour 3 ans |
| Premier client | Adam passe lui-même la première commande avec sa carte ; Codex ne paie pas |

## 2. Comment fonctionne réellement le stock

Les packs ne créent pas de stock supplémentaire. Un pack de trois retire trois
pièces des tailles et coloris choisis. Deux pièces identiques sont possibles si
le stock de cette variante est au moins égal à deux.

La ventilation commerciale équilibrée proposée est la suivante :

| Coloris | S | M | L | XL | Total vendable |
|---|---:|---:|---:|---:|---:|
| Pourpre Impérial | 60 | 61 | 61 | 61 | 243 |
| Rose Velours | 61 | 61 | 61 | 61 | 244 |
| Lilas Céleste | 61 | 61 | 61 | 60 | 243 |
| **Total** | **182** | **183** | **183** | **182** | **730** |

Hypothèse à confirmer pendant le call : 63 pièces physiques sur chacune des 12
combinaisons couleur/taille. Les 26 cadeaux sont répartis à raison de 2 par
combinaison, avec 1 pièce supplémentaire mise de côté sur Pourpre S et Lilas XL.
Si le comptage physique diffère, on corrige la grille avant l’import ; on ne
triche jamais avec le stock affiché.

## 3. Ce qui fonctionne déjà

- Le site visuel est consultable sur la prévisualisation privée.
- Le code gère panier, packs, paiement, stock, livraison, e-mails et retours.
  Le checkout autorise la France et les 26 autres pays de l’Union européenne ;
  le hors UE reste fermé.
- Les contrôles automatiques critiques sont verts et la version candidate est
  figée sur la branche Codex.
- Le compte Stripe de Jérémy est vérifié en France : il peut encaisser et
  recevoir les virements. La clé de connexion est chiffrée localement et n’est
  ni dans Git ni dans le site.
- Le domaine d’e-mail AJ Luxury est vérifié chez Resend.
- Sendcloud contient l’intégration « AJ Luxury Site officiel », l’adresse de
  Belmont et les deux transporteurs Mondial Relay et Colissimo.
- La base de données de production existe déjà en Europe.

## 4. Ce que Jérémy doit confirmer ou faire

### Bloquants administratifs

1. **TVA France et Union européenne.** Demander à son comptable ou au Service
   des impôts des entreprises :
   « Mon entreprise individuelle est-elle en franchise en base de TVA, sans
   option TVA, pour l’ensemble de mes activités en 2025 et 2026 ? Pour les
   ventes à des particuliers dans les autres pays de l’Union européenne, dois-je
   facturer la TVA française ou utiliser le guichet OSS ? »
   - Si oui : le site affichera « TVA non applicable, article 293 B du CGI ».
   - Si non : les prix resteront ceux payés par le client, TVA de 20 % incluse,
     avec une marge hors taxe plus faible.
2. **Activité e-commerce.** Ajouter la vente en ligne de sous-vêtements à
   l’entreprise individuelle sur le Guichet unique INPI et transmettre l’accusé
   de dépôt. Aujourd’hui, l’activité officielle visible est encore la production
   de films.
3. **Téléphone.** Le choix est fait, mais la ligne n’est pas encore souscrite.
   Souscrire la ligne OVH dédiée à 1,19 € TTC/mois et donner le
   numéro obtenu. Elle peut être filtrée et renvoyée vers un répondeur ; le
   numéro personnel reste privé.
4. **Médiateur.** Le choix est fait, mais le contrat n’est pas encore souscrit.
   Souscrire SMP à 30 € TTC pour 3 ans au nom de l’entreprise
   individuelle et transmettre l’attestation et les coordonnées contractuelles.
   Le médiateur est un tiers indépendant qu’un client peut saisir gratuitement
   si une réclamation n’a pas été résolue directement avec AJ Luxury.

### Bloquants produit et stock

5. Confirmer ou corriger les 12 quantités physiques : 3 couleurs × 4 tailles.
6. Donner les mesures exactes S, M, L et XL, le pays de fabrication, les
   instructions d’entretien et le fonctionnement exact du scellé d’hygiène.
   La composition 94 % modal / 6 % élasthanne a été transmise par AJ Luxury,
   mais doit encore être recoupée avec l’étiquette fabricant définitive.
7. Confirmer que l’adresse de Belmont peut apparaître sur les colis et retours.
   Cette adresse est déjà confirmée verbalement ; le call la clôt formellement.
8. Prendre acte que l’EORI `FR944996487` est déjà valide dans le validateur
   officiel européen. Pour ouvrir le Royaume-Uni, la Suisse, les États-Unis, le
   Canada ou un autre pays hors Union européenne, il reste à valider avec
   Sendcloud les transporteurs, déclarations douanières, droits, taxes et
   retours par destination.

### Validation de la mise en ligne

9. Après les derniers changements, Jérémy vérifie la prévisualisation et
   approuve directement la version exacte et la grille de stock exacte. Une
   validation générale du projet ne suffit pas si la version change ensuite.
10. Autoriser la régénération des clés Sendcloud actuellement masquées, uniquement
   après avoir confirmé qu’aucun autre outil ne les utilise.

## 5. Coûts retenus

| Dépense | Coût | Pourquoi |
|---|---:|---|
| Ligne OVH Découverte | 1,19 € TTC/mois, sans engagement | Numéro public séparé, répondeur et filtrage |
| Médiateur SMP | 30 € TTC pour 3 ans | Obligation légale avant vente aux particuliers |
| Sendcloud | Offre gratuite au démarrage | Le client paie le tarif de livraison affiché avant paiement |
| Stripe | Pas d’abonnement mensuel retenu | Commission prélevée uniquement lorsqu’un paiement est encaissé |
| Resend | Offre actuelle suffisante pour le lancement | Confirmations de commande et d’expédition |

SMP facture en plus une médiation réellement ouverte : 150 € HT pour un dossier
simple ou 350 € HT pour un dossier complexe. Le client ne paie pas cette
médiation.

## 6. Séquence après le call

1. Adam transmet à Codex les confirmations et justificatifs ci-dessus.
2. Codex met à jour TVA, téléphone, médiateur, informations produit et stock.
3. Adam valide la version exacte ; Jérémy valide ensuite directement la même
   version et la même grille de stock.
4. Codex raccorde Stripe, Sendcloud et Resend sur une ouverture contrôlée,
   inaccessible au public.
5. Adam passe lui-même la première commande avec sa carte.
6. Codex vérifie paiement, baisse du stock, e-mail, étiquette et suivi.
7. Le colis test est remis au transporteur. Une fois la preuve complète obtenue,
   la même version est ouverte au public en France et dans l’Union européenne.
8. Le hors Union européenne est ouvert séparément après validation des tarifs,
   transporteurs, douanes, taxes et retours ; l’EORI est déjà valide.

## 7. Phrase d’ouverture du call

> Le site et Stripe peuvent fonctionner. Pour ouvrir proprement, il nous manque
> aujourd’hui quatre éléments administratifs et les confirmations produit et
> stock.
> Si on les clôt pendant ce call, je peux terminer le raccordement et te faire
> valider la première commande réelle sans exposer ton numéro personnel.

## 8. Phrase de clôture du call

> Je récapitule : tu m’envoies le régime TVA, l’accusé d’activité e-commerce,
> le numéro OVH, l’attestation SMP, les mesures et informations produit, puis tu
> confirmes les 12 lignes de stock. Je finalise la version ; Adam la valide,
> ensuite tu approuves exactement la même version avant sa première commande.

## 9. Résultat obligatoire du call

- Une réponse fiscale écrite ou un engagement daté du comptable/SIE.
- L’accusé de démarche d’activité e-commerce.
- Le numéro OVH professionnel ou la preuve de souscription.
- L’attestation SMP ou la preuve de souscription.
- Les 12 quantités physiques couleur × taille.
- Les mesures, l’origine, l’entretien et la preuve du dispositif d’hygiène.
- La décision sur les pays hors UE prioritaires et leur traitement douanier.
- L’accord pour régénérer les clés Sendcloud si elles ne servent nulle part ailleurs.
