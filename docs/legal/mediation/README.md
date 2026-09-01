# AJ Luxury — preuve du médiateur de la consommation

Date de réception et de contrôle documentaire : 1er septembre 2026  
Owner métier : Jérémy Scheppler  
Owner intégration : Adam Chabbi

## Verdict

Le blocage documentaire « médiateur non contracté » est **résolu**. La facture
`FACWEB022328`, datée du 1er septembre 2026, atteste le paiement d'une adhésion
triannuelle à la médiation de la consommation auprès de Société Médiation
Professionnelle.

Ce constat ne vaut pas, à lui seul, preuve d'ouverture publique. Le passage en
`live` reste conditionné à l'intégration des coordonnées ci-dessous dans le
candidat exact, à son déploiement, puis à une vérification sur
`https://ajluxurystore.com` liée au SHA, aux identifiants Worker/Sites et à un
horodatage UTC.

## Preuve conservée

- fichier interne : `mediator-source-2026-09-01.pdf` ;
- SHA-256 :
  `f2b0cfddb88d0e8b2ede2b8abca8980e4d09e18d82cccb5a9107398cf67870b7` ;
- objet constaté : adhésion triannuelle à la médiation de la consommation ;
- titulaire constaté : Jérémy Scheppler ;
- montant constaté : 30,00 EUR TTC ;
- statut documentaire : payé selon la facture fournie.

La facture source reste un justificatif interne. Elle ne doit être ni incluse
dans le build public, ni exposée par une route web, ni jointe à une facture
client AJ Luxury.

## Coordonnées à publier

- organisme : **Société Médiation Professionnelle – Médiateur de la
  consommation** ;
- adresse : **Alteritae, 5 rue Salvaing, 12000 Rodez, France** ;
- site : <https://www.mediateur-consommation-smp.fr/> ;
- saisine en ligne :
  <https://www.mediateur-consommation-smp.fr/demander-une-mediation/>.

## Emplacements et contrôle d'acceptation

Avant toute déclaration d'ouverture publique, le même libellé doit être visible
et cliquable aux emplacements prévus par le produit et les textes applicables :

1. conditions générales de vente ;
2. mentions légales ou page de contact juridique ;
3. parcours de commande lorsqu'un rappel juridique y est présenté ;
4. facture commerciale AJ Luxury, conformément à la décision métier reçue.

Le contrôle runtime doit conserver une capture expurgée ou un relevé HTTP des
pages publiques, le SHA exact et les identifiants Worker/Sites. Une divergence
de nom, d'adresse ou de lien ferme le gate juridique jusqu'à correction.

## Distinction avec la facturation client

Ce justificatif d'adhésion au médiateur est une facture fournisseur reçue par
Jérémy. Il est distinct des factures commerciales qu'AJ Luxury doit émettre à
ses acheteurs après confirmation du paiement. Ces factures client suivent la
chaîne décrite dans `docs/RELEASE-RUNBOOK.md` et ne réutilisent aucune donnée de
paiement portée par ce document source.
