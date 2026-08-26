# Baseline DNS — ajluxurystore.com

Date du relevé : 2026-08-08

Source : zone DNS Hostinger, compte propriétaire de Jérémy SCHEPPLER, accès collaborateur d'Adam CHABBI.

État : relevé effectué avant toute modification liée à la mise en production AJ Luxury.

## Domaine

- Nom : `ajluxurystore.com`
- Statut Hostinger : actif
- Expiration affichée : `2029-08-07`
- Serveurs de noms :
  - `apollo.dns-parking.com`
  - `athena.dns-parking.com`

## Enregistrements présents avant bascule

| Type | Nom | Priorité | Contenu | TTL |
|---|---|---:|---|---:|
| CNAME | `www` | 0 | `ajluxurystore.com` | 300 |
| A | `@` | 0 | `2.57.91.91` | 50 |

La table Hostinger affichait exactement ces deux lignes. Aucun enregistrement MX, TXT, AAAA, CAA ou autre n'était affiché dans la zone au moment du relevé.

## Point de retour

En cas de retour arrière nécessaire, restaurer uniquement les deux enregistrements ci-dessus, sans modifier les serveurs de noms ni les paramètres de propriété du domaine.

## Règle de mutation

La bascule doit rester limitée aux enregistrements web et aux éventuels enregistrements de validation explicitement fournis par la plateforme d'hébergement. Toute configuration email découverte ultérieurement doit être préservée.
