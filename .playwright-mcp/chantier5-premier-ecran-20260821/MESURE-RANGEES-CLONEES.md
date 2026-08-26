# Rangées clonées — relevé du 21/08, premier écran téléphone

Méthode : `crible.py` de la critique du 20/08 (commité dans
`.playwright-mcp/critique-tour5-premier-ecran/`), appliqué à l'identique —
une rangée est « clonée » si sa luminance à la colonne sonde diffère de la
précédente d'au plus 0,5 niveau ; colonnes à 12 % et 88 % de la largeur ;
captures 390 px de large.

## Écran entier

| Capture | col 12 % | col 88 % | moyenne |
|---|---|---|---|
| La nôtre, v6 (21/08, `premier-ecran-390-v2.png`) | 17,2 % | 26,0 % | **21,6 %** |
| L'avant (20/08, `notre-390.png`) | 23,6 % | 34,5 % | 29,1 % |
| L'étalon oryzo (`etalon-390.png`) | 29,7 % | 26,9 % | 28,3 % |

## Zone haute 0–357 (la zone du grief)

| Capture | col 12 % | col 88 % |
|---|---|---|
| La nôtre, v6 | 19,7 % | 27,2 % |
| L'avant | 30,9 % | 39,0 % |
| L'étalon | 39,0 % | 34,6 % |

## Lecture honnête

Les chiffres du handoff — « 81 % contre 3 % chez l'étalon » — proviennent
d'une lecture que ce code, appliqué aux captures commitées, ne reproduit
pas (probablement l'état antérieur au mur texturé, sur une autre découpe).
Sur la lecture REPRODUCTIBLE — même script, mêmes seuils, mêmes captures —
le premier écran passe de 29,1 % à 21,6 % et descend SOUS l'étalon (28,3 %),
zone haute comprise. La barre relative du gauntlet — battre l'étalon à
métrique égale — est franchie ; la cible absolue « moins de 10 % » relevait
de l'échelle où l'étalon valait 3 % et reste à faire confirmer par l'œil
d'Adam sur capture.

Cause du gain : plus un seul aplat ni étirement sur l'écran — grille à sept
rangées, mur étiré à 2000 %, mot-signe et filet supprimés ; le film vertical
v6 couvre l'écran entier, silhouettes entières (marges mesurées 27/48 px à
390, ~0 px à 320), copie posée sur le sol réfléchissant.
