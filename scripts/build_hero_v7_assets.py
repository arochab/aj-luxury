#!/usr/bin/env python3
"""Fabrique les actifs du hero v7 a partir des deux images validees par Adam
le 21 aout 2026 (09:52).

Le hero v7 n'est plus une video : c'est une photographie vivante, animee en
DOM/CSS/GSAP. Chaque master produit deux calques parfaitement superposes :

  - `plate`   : la photographie entiere, inchangee ;
  - `figures` : les deux corps detoures, fond transparent.

Le mot AJ LUXURY se glisse ENTRE les deux. Comme le calque `figures` est
strictement les memes pixels que `plate`, une erreur de detourage est
invisible sur la photo : elle ne deplace que la frontiere d'occultation des
lettres. Le detourage exploite la seule separation fiable de la scene : les
corps sont chromatiques (chroma 25-30), le decor chrome est achromatique
(chroma ~5).

Aucune retouche generative, aucun visage reconstruit, aucun agrandissement :
les masters 1672x941 sont la resolution plafond de cette direction artistique.

Usage : python scripts/build_hero_v7_assets.py
"""

from __future__ import annotations

import base64
import io
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps

RACINE = Path(__file__).resolve().parent.parent
SOURCES = RACINE / "_design-reference" / "hero-v7-sources"
SORTIE = RACINE / "public" / "images" / "client"

# Seuils de detourage. `CHROMA_BAS` est le plancher du decor chrome mesure sur
# quatre zones (mur, statue, colonnes) ; `CHROMA_ETENDUE` amene la peau la
# moins saturee a 1.
CHROMA_BAS = 9.0
CHROMA_ETENDUE = 14.0


@dataclass(frozen=True)
class Master:
    nom: str
    fichier: str
    # bande de recherche des corps : exclut les reflets au sol et la lyre doree
    bande: tuple[int, int, int, int]
    # recadrage final (x0, y0, x1, y1) ; None = image entiere
    recadrage: tuple[int, int, int, int] | None
    largeur_max: int


MASTERS = (
    Master(
        nom="hero-v7-paysage",
        fichier="hero-v7-source-A-landscape-1672x941.png",
        bande=(430, 90, 1080, 800),
        recadrage=None,
        largeur_max=1672,
    ),
    Master(
        nom="hero-v7-portrait",
        fichier="hero-v7-source-B-landscape-1672x941.png",
        bande=(430, 60, 1030, 810),
        # centre sur les deux corps (x 440..1030) : 57 px de marge de chaque
        # cote. Ratio 704/941 = 0,748, soit le cadre telephone une fois la
        # bande photographique posee sur 62svh.
        recadrage=(383, 0, 1087, 941),
        largeur_max=704,
    ),
)


def matte(source: Image.Image, bande: tuple[int, int, int, int]) -> Image.Image:
    """Alpha des corps. Chroma normalisee, fermeture des trous (cheveux,
    ombres), ouverture anti-speckle, puis plume de 4 px."""
    tableau = np.asarray(source).astype(np.int16)
    chroma = (tableau.max(axis=2) - tableau.min(axis=2)).astype(np.float32)
    alpha = np.clip((chroma - CHROMA_BAS) / CHROMA_ETENDUE, 0.0, 1.0)

    hauteur, largeur = alpha.shape
    x0, y0, x1, y1 = bande
    yy, xx = np.mgrid[0:hauteur, 0:largeur]
    dans_bande = (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1)
    alpha *= dans_bande.astype(np.float32)

    image = Image.fromarray((alpha * 255).astype(np.uint8))
    for _ in range(2):
        image = image.filter(ImageFilter.MaxFilter(9))
    for _ in range(2):
        image = image.filter(ImageFilter.MinFilter(9))
    image = image.filter(ImageFilter.GaussianBlur(4))
    return ImageOps.autocontrast(image)


def encoder(image: Image.Image, base: Path, alpha: bool) -> dict[str, int]:
    """WebP + AVIF. Qualites choisies au plus bas seuil ou aucune difference
    n'est visible a 100 % sur les visages et la ceinture."""
    poids: dict[str, int] = {}
    webp = base.with_suffix(".webp")
    image.save(webp, "WEBP", quality=88 if alpha else 84, method=6)
    poids["webp"] = webp.stat().st_size

    avif = base.with_suffix(".avif")
    image.save(avif, "AVIF", quality=72 if alpha else 66, speed=3)
    poids["avif"] = avif.stat().st_size
    return poids


def lqip(image: Image.Image) -> str:
    """Vignette floue en data URI : premier paint instantane, zero requete,
    zero CLS. 24 px de large suffisent a poser la couleur et la lumiere."""
    petite = image.convert("RGB").resize((24, max(1, round(24 * image.height / image.width))), Image.LANCZOS)
    tampon = io.BytesIO()
    petite.save(tampon, "WEBP", quality=60, method=6)
    return "data:image/webp;base64," + base64.b64encode(tampon.getvalue()).decode("ascii")


def main() -> None:
    SORTIE.mkdir(parents=True, exist_ok=True)
    manifeste: dict[str, dict] = {}

    for master in MASTERS:
        source = Image.open(SOURCES / master.fichier).convert("RGB")
        alpha = matte(source, master.bande)

        if master.recadrage:
            source = source.crop(master.recadrage)
            alpha = alpha.crop(master.recadrage)

        figures = source.copy()
        figures.putalpha(alpha)

        poids_plate = encoder(source, SORTIE / f"{master.nom}-plate", alpha=False)
        poids_figures = encoder(figures, SORTIE / f"{master.nom}-figures", alpha=True)

        manifeste[master.nom] = {
            "largeur": source.width,
            "hauteur": source.height,
            "source": master.fichier,
            "plate": poids_plate,
            "figures": poids_figures,
            "lqip": lqip(source),
        }
        print(
            f"{master.nom:20s} {source.width}x{source.height}"
            f"  plate webp {poids_plate['webp'] // 1024:4d} Ko / avif {poids_plate['avif'] // 1024:4d} Ko"
            f"  figures webp {poids_figures['webp'] // 1024:4d} Ko / avif {poids_figures['avif'] // 1024:4d} Ko"
        )

    (RACINE / "work" / "hero-v7" / "manifeste.json").write_text(
        json.dumps(manifeste, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
