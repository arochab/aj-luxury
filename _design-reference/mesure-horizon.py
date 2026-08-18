"""
mesure-horizon.py — le banc de mesure de l'horizon du diptyque Apollon.

POURQUOI CE FICHIER EXISTE
==========================
Plusieurs passes ont « mesuré » la couture du diptyque et produit autant
d'échelles incomparables, faute de protocole écrit. Ce script EST le protocole.
Toute affirmation chiffrée sur l'horizon du diptyque doit sortir d'ici.

    python _design-reference/mesure-horizon.py            # le tableau
    python _design-reference/mesure-horizon.py --pics     # arêtes candidates
    python _design-reference/mesure-horizon.py --preuve DOSSIER   # planches

CE QU'ON APPELLE « HORIZON »
============================
L'horizon est UNE arête et une seule : la ligne où le MUR du studio rencontre
le SOL de marbre. Ce n'est pas « l'arête la plus contrastée du cadre ». Les
trois plateaux sont trois prises du même décor, et ce décor contient d'autres
arêtes fortes, plus basses, posées SUR le sol : le carquois, l'arc, les
flèches, le laurier. C'est la confusion entre ces arêtes-là et l'horizon qui a
produit les faux diagnostics — voir « L'ERREUR À NE PAS REFAIRE ».

LE PROTOCOLE, POINT PAR POINT
=============================
1. BOÎTE — chaque prise est rendue dans une boîte de 473 x 711 px en
   `object-fit: contain`, ce que rend le CSS de `.demi` / `.prise` à 1440x900.
   Le rapport de la boîte (0,6653) est plus étroit que ceux des fichiers
   (0,6667 pour le « seul », 0,6658 pour le porté) : les deux images sont donc
   contraintes en LARGEUR, remplissent la boîte de bord à bord et ne laissent
   qu'une lisière haute/basse de 1,5 px et 0,6 px. Retenir ce chiffre : il
   condamne `object-position` comme outil de recalage (voir LA CALE).
2. BANDE — on ne mesure pas le cadre entier mais la bande de 34 px adjacente à
   la couture : les 34 colonnes de DROITE du « seul », les 34 colonnes de
   GAUCHE du porté. C'est ce que l'oeil compare de part et d'autre de la
   gouttière. Le centre du cadre, occupé par le vêtement ou par le corps, ne
   dit rien du décor.
3. PROFIL — pour chaque ligne de la bande, la luminance moyenne (BT.601 sur
   RGB). 711 valeurs, une par ligne de boîte.
4. LISSAGE — moyenne glissante sur 5 lignes, bords répliqués. Le grain du
   marbre produit sinon des pics parasites plus hauts que l'horizon lui-même.
5. HORIZON — défini par SEUIL À MI-HAUTEUR, et non par pic de gradient :
     • référence MUR = médiane du profil sur 50 %-64 % (mur nu, sous les
       accessoires suspendus, au-dessus de toute retombée de sol) ;
     • référence SOL = médiane du profil sur 88 %-97 % (marbre de premier
       plan) ;
     • seuil = mi-chemin entre les deux ;
     • horizon = la PREMIÈRE ligne sous 60 % où le profil lissé franchit ce
       seuil vers le haut et s'y maintient 12 lignes.
   Le maintien sur 12 lignes distingue l'horizon d'un reflet ou d'un liseré.
   Exprimé en pourcentage de la hauteur de boîte, 0 % en haut.
6. CONTRASTE — l'écart SOL − MUR en niveaux de luminance 0-255. C'est une
   différence de PLAGES, pas une pente : 138 signifie « le sol est en moyenne
   138 niveaux plus clair que le mur dans cette bande ». Un contraste faible
   (< 30) signale un décor à faible séparation, donc une position d'horizon
   moins sûre — pas un horizon faux. Les passes précédentes rapportaient un
   « contraste » tantôt pente lissée, tantôt écart de plages : c'est cette
   ambiguïté-là qu'on arrête ici.
7. RUPTURE — l'écart, en POINTS de pourcentage, entre l'horizon du bord droit
   du « seul » et celui du bord gauche du porté. Seule grandeur qui décide.
   Seuil d'acceptation : 2 points.
8. MARGE — passer le seuil ne suffit pas à dire qu'un plateau est tranquille.
   Le tableau porte donc une colonne `marge`, pour qu'on lise l'état d'un
   plateau sans avoir à relire cet en-tête :
     • `. FRANC`   — rupture <= 1,5 pt ET les deux contrastes >= 35 ;
     • `! LIMITE`  — accepté, mais soit la rupture dépasse 1,5 pt (marge
       d'écart entamée), soit un contraste passe sous 35 (détection moins
       sûre) ; le motif exact est imprimé à côté ;
     • `X HORS SEUIL` — rupture > 2,0 pt.
   Les deux bornes de vigilance (1,5 pt et 35 niveaux) sont volontairement plus
   sévères que les seuils de rejet (2,0 pt et 30 niveaux) : elles servent à
   voir venir, pas à condamner. En l'état, le pourpre est FRANC, le rose est
   LIMITE par contraste faible (32,1 / 33,1) et le lilas LIMITE par rupture
   (1,8 pt, 91 % du budget).

L'ERREUR À NE PAS REFAIRE
=========================
Le critère naïf — « la ligne où le gradient lissé est maximal en valeur
absolue » — annonce des ruptures de 10,4 pt (rose) et 12,9 pt (lilas). C'est
faux, et `--pics` le montre en une commande : sur le rose il retient 82,8 % du
côté « seul », qui est le CARQUOIS doré posé sur le marbre (pente 13,2), alors
que l'horizon mur/sol est à 68,6 % avec une pente de 7,0 seulement. Sur le
lilas il retient 81,2 % du côté porté — encore le carquois. Le détecteur
comparait un accessoire à un horizon. Les accessoires sont les objets les plus
contrastés du décor et ils ne sont PAS à la même place d'une prise à l'autre :
les mesurer fabrique une rupture qui n'existe pas. D'où le seuil à mi-hauteur,
qui ne peut désigner qu'une séparation de plages mur/sol.

LA CALE — POURQUOI IL N'Y EN A PAS
==================================
Un correctif « une cale verticale par plateau sur la demi-boîte portée » a été
envisagé, en `object-position: center calc(50% + var(--aj-cale-porte))`. Deux
raisons de ne pas l'écrire :
  1. Elle n'a rien à corriger : les trois ruptures mesurées sont sous 2 points.
     Poser +10,4 % sur le rose CRÉERAIT une rupture de dix points.
  2. Elle serait inerte de toute façon. En `object-fit: contain` avec une image
     contrainte en largeur, le jeu vertical total vaut 1,5 px (« seul ») et
     0,6 px (porté) sur 711. `object-position` en pourcentage ne répartit que
     CE jeu : la course complète de 0 % à 100 % déplace le cadrage de 0,2 % de
     la hauteur de boîte. Une consigne de 10,4 % se sature à 0,06 px.
Si un plateau dérivait réellement, le levier ne serait pas `object-position`
mais un `transform: translateY()` sur `.prise`, qui déplace vraiment le
contenu — au prix d'un rognage en bas et d'une lisière de mur nu en haut. Le
paramètre `cale` de ce script simule EXACTEMENT ce levier, rognage compris,
pour qu'on en voie le coût avant de l'écrire.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

RACINE = Path(__file__).resolve().parent.parent

BOITE_L, BOITE_H = 473, 711
BANDE = 34
LISSAGE = 5
ZONE_MUR = (0.50, 0.64)
ZONE_SOL = (0.88, 0.97)
DEPART = 0.60
MAINTIEN = 12
TOLERANCE = 2.0
# Bornes de VIGILANCE, plus sévères que les seuils de rejet (2,0 pt / 30
# niveaux) : au-delà, le plateau est encore accepté mais signalé `! LIMITE`.
VIGILANCE_RUPTURE = 1.5
VIGILANCE_CONTRASTE = 35.0

# cle: (« seul », porté, cale en % de la hauteur de boîte — 0 partout, cf. LA CALE)
PLATEAUX: dict[str, tuple[str, str, float]] = {
    "rose": (
        "public/images/editorial/isabelle-apollon/apollon-rose-lyre-v1.webp",
        "public/images/client/apollon-world/apollon-rose-model-world-v1.webp",
        0.0,
    ),
    "lilas": (
        "public/images/editorial/isabelle-apollon/apollon-lilas-lyre-v1.webp",
        "public/images/client/apollon-world/apollon-lilas-model-world-v1.webp",
        0.0,
    ),
    "pourpre": (
        "public/images/editorial/isabelle-apollon/apollon-pourpre-lyre-v1.webp",
        "public/images/client/apollon-world/apollon-pourpre-model-world-v1.webp",
        0.0,
    ),
}


def boite_contain(chemin: str, cale_pct: float = 0.0) -> Image.Image:
    """Rend l'image dans la boîte en contain. `cale_pct` simule un
    `transform: translateY()` : positif vers le bas, rognage compris."""
    src = Image.open(RACINE / chemin).convert("RGB")
    l, h = src.size
    k = min(BOITE_L / l, BOITE_H / h)
    rendu = src.resize((max(1, round(l * k)), max(1, round(h * k))), Image.LANCZOS)
    toile = Image.new("RGB", (BOITE_L, BOITE_H), (255, 255, 255))
    toile.paste(
        rendu,
        (
            (BOITE_L - rendu.width) // 2,
            (BOITE_H - rendu.height) // 2 + round(BOITE_H * cale_pct / 100.0),
        ),
    )
    return toile


def profil(boite: Image.Image, cote: str) -> np.ndarray:
    """Luminance moyenne par ligne sur la bande de 34 px, lissée sur 5."""
    a = np.asarray(boite, dtype=float)
    x0 = BOITE_L - BANDE if cote == "droite" else 0
    b = a[:, x0 : x0 + BANDE, :]
    p = (0.299 * b[:, :, 0] + 0.587 * b[:, :, 1] + 0.114 * b[:, :, 2]).mean(axis=1)
    noyau = np.ones(LISSAGE) / LISSAGE
    return np.convolve(np.pad(p, LISSAGE // 2, mode="edge"), noyau, mode="valid")


def horizon(p: np.ndarray) -> tuple[float, float]:
    """(position de l'horizon mur/sol en % de la boîte, contraste sol − mur)."""
    mur = float(np.median(p[int(ZONE_MUR[0] * BOITE_H) : int(ZONE_MUR[1] * BOITE_H)]))
    sol = float(np.median(p[int(ZONE_SOL[0] * BOITE_H) : int(ZONE_SOL[1] * BOITE_H)]))
    seuil = (mur + sol) / 2
    for y in range(int(DEPART * BOITE_H), BOITE_H - MAINTIEN):
        if p[y] >= seuil and bool(np.all(p[y : y + MAINTIEN] >= seuil)):
            return 100.0 * y / BOITE_H, sol - mur
    return float("nan"), sol - mur


def couture(cle: str, cale: float | None = None):
    seul, porte, defaut = PLATEAUX[cle]
    hg, cg = horizon(profil(boite_contain(seul), "droite"))
    hd, cd = horizon(
        profil(boite_contain(porte, defaut if cale is None else cale), "gauche")
    )
    return hg, cg, hd, cd, abs(hg - hd)


def marge(r: float, cg: float, cd: float) -> str:
    """Le marqueur de marge — voir le point 8 du protocole. Trois etats, et le
    motif exact des que le plateau n'est pas franc."""
    if r > TOLERANCE:
        return f"X HORS SEUIL  (rupture {r:.1f} > {TOLERANCE:.1f} pt)"
    motifs = []
    if r > VIGILANCE_RUPTURE:
        motifs.append(f"rupture {r:.1f} pt = {100 * r / TOLERANCE:.0f} % du budget")
    faibles = [c for c in (cg, cd) if c < VIGILANCE_CONTRASTE]
    if faibles:
        motifs.append(f"contraste {min(faibles):.1f} < {VIGILANCE_CONTRASTE:.0f}")
    if motifs:
        return "! LIMITE      (" + " ; ".join(motifs) + ")"
    return ". FRANC"


def tableau() -> None:
    print(
        f"\n{'plateau':9} {'seul, bord DROIT':>24} {'porte, bord GAUCHE':>24}"
        f" {'rupture':>10}  marge"
    )
    for cle in PLATEAUX:
        hg, cg, hd, cd, r = couture(cle)
        print(
            f"{cle:9} {hg:10.1f} % (contraste {cg:5.1f}) "
            f"{hd:10.1f} % (contraste {cd:5.1f}) {r:6.1f} pt  {marge(r, cg, cd)}"
        )
    print(
        f"\nSeuil de rejet : {TOLERANCE:.1f} pt. Vigilance : rupture > "
        f"{VIGILANCE_RUPTURE:.1f} pt ou contraste < {VIGILANCE_CONTRASTE:.0f}."
    )
    print(
        ". FRANC = rien a surveiller | ! LIMITE = accepte mais sans marge"
        " | X HORS SEUIL = a corriger"
    )
    print("Protocole : en-tete du fichier.")


def pics() -> None:
    """Les arêtes candidates : montre ce que le critère « gradient max »
    retenait à tort (les accessoires) au lieu de l'horizon (mur/sol)."""
    print("\n== aretes candidates, gradient lisse (position, pente) — le piege ==")
    for cle, (s_, p_, c) in PLATEAUX.items():
        for lab, img, cote in (
            ("seul  bord D", boite_contain(s_), "droite"),
            ("porte bord G", boite_contain(p_, c), "gauche"),
        ):
            p = profil(img, cote)
            d = np.convolve(np.diff(p), np.ones(5) / 5, mode="same")
            idx = [
                i
                for i in range(int(0.30 * BOITE_H), int(0.97 * BOITE_H))
                if abs(d[i]) >= abs(d[i - 1])
                and abs(d[i]) >= abs(d[i + 1])
                and abs(d[i]) > 3
            ]
            idx.sort(key=lambda i: -abs(d[i]))
            h, _ = horizon(p)
            print(
                f"{cle:8} {lab}  horizon retenu {h:5.1f} %  |  pics : "
                + ", ".join(f"{100 * i / BOITE_H:.1f} % ({d[i]:+.1f})" for i in idx[:4])
            )


def preuve(dest: str) -> None:
    """Planches annotées : l'horizon retenu tracé sur les deux demi-boîtes."""
    out = Path(dest)
    out.mkdir(parents=True, exist_ok=True)
    gouttiere = 16
    for cle in PLATEAUX:
        seul, porte, cale = PLATEAUX[cle]
        g, d = boite_contain(seul), boite_contain(porte, cale)
        hg, _, hd, _, r = couture(cle)
        planche = Image.new("RGB", (BOITE_L * 2 + gouttiere, BOITE_H), (232, 230, 226))
        planche.paste(g, (0, 0))
        planche.paste(d, (BOITE_L + gouttiere, 0))
        t = ImageDraw.Draw(planche)
        yg, yd = round(hg / 100 * BOITE_H), round(hd / 100 * BOITE_H)
        t.line([(BOITE_L - BANDE, yg), (BOITE_L, yg)], fill=(255, 40, 40), width=3)
        t.line(
            [(BOITE_L + gouttiere, yd), (BOITE_L + gouttiere + BANDE, yd)],
            fill=(0, 210, 255),
            width=3,
        )
        t.text(
            (6, 6),
            f"{cle} — seul {hg:.1f} %  porte {hd:.1f} %  rupture {r:.1f} pt",
            fill=(255, 40, 40),
        )
        planche.save(out / f"horizon-{cle}.png")
    print(f"planches : {out}")


if __name__ == "__main__":
    if "--pics" in sys.argv:
        pics()
    elif "--preuve" in sys.argv:
        preuve(sys.argv[sys.argv.index("--preuve") + 1])
    else:
        tableau()
