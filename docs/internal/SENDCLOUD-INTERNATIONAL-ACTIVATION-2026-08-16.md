# Sendcloud international — activation contrôlée

Date : 16/08/2026
Statut : candidat local, production inchangée et fermée.

## Ce qui est prêt

- Devis Sendcloud v3 pour domicile et point relais selon les services réellement disponibles.
- France et Union européenne avec les profils colis validés : 150, 250 ou 350 g ; 40 × 32 × 4 cm.
- Royaume-Uni, États-Unis et Canada préparés en DAP : le client paie les droits et taxes d’import éventuellement dus.
- Pour le hors UE, le serveur produit automatiquement les lignes douanières par article : description, quantité, valeur EUR, poids net, code HS, origine, composition, SKU, taille et couleur.
- Le résultat Sendcloud n’est accepté que s’il prouve une étiquette A6 et au moins un document douanier.
- Adresse US/Canada sans État ou province, configuration altérée, EORI non attesté, donnée manquante ou approbation divergente : arrêt avant appel transporteur.

## Validation unique demandée à AJ Luxury

Jérémy fournit ou confirme une seule fois, sans secret API :

1. le pays de fabrication exact du boxer ;
2. la composition textile exacte figurant sur l’étiquette produit ;
3. le poids net mesuré d’un boxer, sans emballage ;
4. le code douanier HS à 8 chiffres, validé avec le conseil compétent ;
5. le numéro EORI saisi sur l’adresse expéditeur Sendcloud.

Adam transforme ces cinq faits en un contrat JSON canonique. Son empreinte SHA-256 doit être identique dans la configuration, l’approbation Adam et l’approbation Jérémy. Une correction de l’un des faits invalide automatiquement les trois preuves et referme le hors UE.

## Gate avant toute activation

- Compte Sendcloud et adresse AJ Luxury Belmont vérifiés ; identifiant expéditeur relevé sans exposer les clés.
- Services et prix réels publiés dans Dynamic Checkout pour EU, UK, US et CA.
- Un essai contrôlé par zone : devis, paiement de test, création de bordereau, document douanier, impression, annulation dans le délai prévu par Sendcloud.
- Aucun DDP, aucune autre destination et aucun contrat transporteur supplémentaire sans décision explicite.
- Aucun secret, numéro EORI ou donnée client dans Git, les journaux ou ce document.

Référence fournisseur : [Sendcloud — International shipping](https://sendcloud.dev/docs/shipments/international-shipping) et [Shipments API v3](https://sendcloud.dev/docs/shipments/create-a-shipment).
