SUPERSEDED — retained as history — replaced by `BRIEF-CALL-JEREMY-2026-08-25.md` on 2026-08-25

# Brief de préparation — call Jérémy du 21 août 2026

Document interne, pour Adam seul. Ne pas transmettre tel quel.
Établi le 2026-08-20. Chaque chiffre ci-dessous a été vérifié, pas estimé.

---

## 1. Ce que tu dois obtenir de lui, par ordre de blocage

**A. La composition exacte du boxer et son pays de fabrication.** C'est le seul
point réellement bloquant. Sans lui : pas de code douanier, donc aucune vente
hors Union européenne — Royaume-Uni, États-Unis, Canada. La position douanière
est 6107 (sous-vêtements masculins en bonneterie) mais la sous-position dépend
de la matière, coton ou fibres synthétiques. Une seule phrase de sa part
débloque tout.

**B. Combien d'unités il met réellement en vente.** Le stock est de 756 unités.
Combien il en garde de côté, combien partent en ligne.

**C. La confirmation de l'identité de la société et des conditions de vente.**
Nécessaire pour les mentions légales et les CGV.

**D. L'adresse d'expéditeur.** Elle est déjà enregistrée dans Sendcloud à son
nom. Vérifier avec lui que c'est bien une adresse qu'il assume : elle apparaît
sur les colis ET sur les étiquettes de retour. Si c'est son domicile personnel,
il doit le savoir.

---

## 2. Ce que tu peux lui annoncer comme acquis

**Le site existe et se visite**, sur une adresse privée. Quinze routes, cinq
langues, trois fiches produit complètes.

**La vente est fermée volontairement**, et c'est écrit sur le site : « La vente
en ligne ouvrira prochainement. » Ce n'est pas une panne, c'est un choix. Le
site le dit avec ses mots, pas avec un message d'erreur.

**Le compte Stripe est à son nom** — Scheppler Jeremy — et n'a jamais encaissé :
0,00 € de volume. C'est la bonne configuration : les flux financiers lui
appartiennent, tu ne les portes pas.

**Sendcloud est configuré.** L'intégration API existe, la livraison en point
relais est active, avec Colissimo et Mondial Relay.

**Le backend est construit** : paiement, livraison, points relais, douanes,
comptes clients, administration, e-mails, portes de mise en production. Environ
soixante-dix-sept commits de travail.

---

## 3. Ce que tu ne dois PAS promettre

**Le backend n'est pas intégré.** Il vit sur des branches, pas sur la ligne
principale. Pour donner l'ordre de grandeur : le serveur de la ligne principale
fait 11 807 octets, celui de la branche complète en fait 98 537, et il y a 5
migrations de base de données d'un côté contre 17 de l'autre. L'intégration est
un vrai chantier de réconciliation, pas une fusion mécanique.

**Le front n'est pas au niveau visé.** Un jury interne l'a noté 5,82 sur 10 avec
un seuil à 9,2. Le bureau est bon — meilleur qu'un site primé sur son premier
écran. Le téléphone ne l'est pas encore : il n'a jamais été composé, seulement
recadré depuis le bureau. C'est le chantier en cours.

**Aucune date de mise en vente.** Trois choses la conditionnent : ses réponses,
l'intégration backend, et son numéro EORI, toujours en attente de
l'administration française.

---

## 4. Décisions à prendre ensemble

**Le deuxième site.** C'est l'objet du call. Il existe déjà : une seconde
direction, plus expérientielle, sur une branche séparée. Point important pour
toi : le backend sera conçu pour être **indépendant du front**, donc quelle que
soit la version retenue, il n'y aura pas d'intégration à refaire.

**« Il n'en reste que N. »** Afficher le stock restant est un levier d'urgence
classique, mais ça publie son stock à ses concurrents. À trancher.

**Le contrat La Poste.** Lettre Suivie, format boîte aux lettres, est de loin le
tarif le moins cher pour un boxer. Ce n'est pas une case à cocher : il faut un
contrat, et ça prend des semaines. À lancer tôt même si ça ne bloque rien.
Réserve : peu ou pas d'assurance, pas de remise contre signature.

**Sa validation formelle.** Le code exige littéralement deux empreintes
d'approbation, la tienne et la sienne, pour autoriser une mise en production.
Ce n'est pas une formalité de gouvernance, c'est câblé dans le runtime.

---

## 5. Chiffres à avoir en tête

| | |
|---|---|
| Stock | 756 unités |
| Prix affiché | 29,99 € |
| Coloris | 3 — Rose Velours, Lilas Céleste, Pourpre Impérial |
| Tailles | S · M · L · XL |
| Routes du site | 15 |
| Langues | 5 — fr, en, de, es, it |
| Volume Stripe à ce jour | 0,00 € |
| Transporteurs actifs | 2 — Colissimo, Mondial Relay |
| Périmètre de livraison prévu | UE, Royaume-Uni, États-Unis, Canada |

---

## 6. La phrase à retenir si le call dérape

Le site est un objet fini qu'on peut montrer, la vente est fermée par choix et
non par accident, et ce qui reste avant d'ouvrir dépend d'abord de trois
réponses de sa part et d'un numéro que l'administration doit délivrer.
