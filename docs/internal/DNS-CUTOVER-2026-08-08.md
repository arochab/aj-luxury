# Bascule DNS — ajluxurystore.com

Date : 2026-08-08

Statut : bascule effectuée et contrôlée.

## Cible publiée

- Projet : AJ Luxury
- Version publiée : `26`
- Source publiée : `3cdce23a9381a9dbdcf8a5d736349d70b646a3a1`
- Domaine principal : `https://ajluxurystore.com`
- Variante `www` : `https://www.ajluxurystore.com`

## Zone DNS finale observée dans Hostinger

| Type | Nom | Contenu | TTL |
|---|---|---|---:|
| A | `@` | `162.159.143.30` | 300 |
| A | `@` | `172.66.3.26` | 300 |
| CNAME | `www` | `custom-domains.chatgpt.site` | 300 |
| TXT | `_openai-site-verification` | `openai-site-verification=TvHro2yT7oiShrI4d0QA7QM7B1FZ1zuteNdt69W6f_k` | 300 |
| TXT | `_cf-custom-hostname` | `455e5340-94a1-417d-a8e2-bfec8c7974f7` | 300 |
| TXT | `_openai-site-verification.www` | `openai-site-verification=d37XVG-CU3Np5Dcsnj2vDI0fFpsp-0GUGn56sBeIMho` | 300 |
| TXT | `_cf-custom-hostname.www` | `0920ee1c-6ea7-49e8-9730-54411fa96b22` | 300 |

Serveurs de noms inchangés :

- `apollo.dns-parking.com`
- `athena.dns-parking.com`

## Contrôles réalisés

- Les deux serveurs de noms autoritatifs renvoient les deux adresses A et le CNAME attendus.
- Les quatre TXT de validation se résolvent publiquement.
- Les domaines principal et `www` sont déclarés `active`, avec fournisseur `active` et SSL `active` côté hébergement.
- Les deux hôtes répondent en HTTPS.
- L’accueil, la boutique, les trois fiches produit, le panier, le paiement, le compte et les pages d’information répondent avec succès sur le domaine principal.
- Les trois vidéos responsives répondent avec le type `video/mp4`.

## Messagerie

Aucun enregistrement MX n’était présent avant la bascule et aucun n’a été ajouté, modifié ou supprimé. La mise en service de `contact@ajluxurystore.com` reste une opération séparée nécessitant un service de messagerie et ses enregistrements dédiés.

## Retour arrière

Le point de retour précédent est documenté dans `DNS-BASELINE-2026-08-08.md`. Un retour arrière doit restaurer uniquement l’ancien A `@ → 2.57.91.91` et l’ancien CNAME `www → ajluxurystore.com`, sans toucher aux serveurs de noms ni aux données de propriété.

## Domaine défensif séparé

Depuis le 10 août 2026, `ajluxurystore.fr` est enregistré comme protection. Il
n’est ni le domaine canonique ni une extension de la zone ci-dessus. Son état,
ses preuves et le gate de son éventuelle redirection sont gouvernés séparément
dans `DOMAIN-PROTECTION-FR-2026-08-10.md`.
