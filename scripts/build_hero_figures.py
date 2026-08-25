#!/usr/bin/env python3
"""Découpe les deux corps du hero à partir de la SEULE photographie validée.

Master : public/images/client/campaign-duo-lilas-seated.webp (1484x2229), la
vraie prise de studio. Les images composites « salle de chrome » ont été
refusées par Adam le 21/08 : visages déformés, décor kitsch.

CE QUI TOUCHE LES VISAGES, ET CE QUI N'Y TOUCHE PAS. Un modèle GÉNÉRATIF
redessine les pixels : les visages dérivent à chaque passe, c'est structurel.
Un modèle de SEGMENTATION ne produit qu'un canal alpha — il décide quels
pixels garder, jamais à quoi ils ressemblent. Les pixels sortis d'ici sont
donc, au sens strict, ceux de la photographie d'origine. Aucun visage n'est
reconstruit, aucun détail n'est inventé.

Trois étapes :
  1. alpha par segmentation (BiRefNet general-lite, modèle local déjà en
     cache, aucun téléchargement) ;
  2. décontamination des bords : un pixel semi-transparent a été mélangé au
     gris du studio. Posé tel quel sur le métal sombre il porterait un liseré
     clair. On estime le fond par inpainting, puis on résout la couleur réelle
     du premier plan ;
  3. rognage sur la boîte englobante de l'alpha, pour ne pas transporter des
     mégapixels transparents.

Le socle noir sur lequel s'assoit le modèle de gauche est CONSERVÉ : décision
d'Adam du 21/08. Sur un champ de métal liquide, il joue le rôle d'un socle mat.

Usage : python scripts/build_hero_figures.py
"""

from __future__ import annotations

import base64
import io
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

RACINE = Path(__file__).resolve().parent.parent
MASTER = RACINE / "public" / "images" / "client" / "campaign-duo-lilas-seated.webp"
SORTIE = RACINE / "public" / "images" / "client"
MODELE = "birefnet-general-lite"

# Sous ce seuil le pixel est du fond pur, au-dessus c'est du premier plan pur ;
# entre les deux, il est mélangé et doit être décontaminé.
ALPHA_FOND = 0.02
ALPHA_PLEIN = 0.98


def alpha_par_segmentation(source: Image.Image) -> np.ndarray:
    from rembg import new_session, remove

    masque = remove(source, session=new_session(MODELE), only_mask=True)
    return np.asarray(masque).astype(np.float32) / 255.0


def decontaminer(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Retire le gris du studio des pixels de bord.

    Observé = a*F + (1-a)*B. On estime B en effaçant le sujet par inpainting,
    puis on résout F. Sans cette étape, chaque cheveu porte une frange claire
    qui trahit le détourage dès que le fond devient sombre.
    """
    sujet = (alpha > ALPHA_FOND).astype(np.uint8)
    # On efface large : le halo du sujet ne doit pas servir à estimer le fond.
    a_effacer = cv2.dilate(sujet, np.ones((25, 25), np.uint8))
    fond = cv2.inpaint(
        cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2BGR),
        a_effacer,
        15,
        cv2.INPAINT_TELEA,
    )
    fond = cv2.cvtColor(fond, cv2.COLOR_BGR2RGB).astype(np.float32)

    bord = (alpha > ALPHA_FOND) & (alpha < ALPHA_PLEIN)
    a = np.clip(alpha[..., None], 1e-3, 1.0)
    premier_plan = np.where(
        bord[..., None],
        np.clip((rgb - (1.0 - a) * fond) / a, 0, 255),
        rgb,
    )
    return premier_plan


def lqip(rgba: Image.Image) -> str:
    """Vignette 24 px, fond transparent aplati sur le noir de marque."""
    petite = rgba.resize((24, max(1, round(24 * rgba.height / rgba.width))), Image.LANCZOS)
    fond = Image.new("RGB", petite.size, (8, 8, 10))
    fond.paste(petite, mask=petite.split()[3])
    tampon = io.BytesIO()
    fond.save(tampon, "WEBP", quality=60, method=6)
    return "data:image/webp;base64," + base64.b64encode(tampon.getvalue()).decode("ascii")


def main() -> None:
    source = Image.open(MASTER).convert("RGB")
    rgb = np.asarray(source).astype(np.float32)

    alpha = alpha_par_segmentation(source)
    premier_plan = decontaminer(rgb, alpha)

    rgba = np.dstack([premier_plan, alpha * 255.0]).astype(np.uint8)
    image = Image.fromarray(rgba, "RGBA")

    boite = image.getbbox()
    image = image.crop(boite)
    print(f"master {source.width}x{source.height} -> découpe {image.width}x{image.height}  boîte {boite}")

    poids = {}
    for format_, qualite in (("webp", 90), ("avif", 74)):
        chemin = SORTIE / f"hero-figures.{format_}"
        image.save(chemin, format_.upper(), quality=qualite, method=6) if format_ == "webp" else image.save(
            chemin, "AVIF", quality=qualite, speed=3
        )
        poids[format_] = chemin.stat().st_size
        print(f"  {format_:4s} {poids[format_] // 1024:4d} Ko")

    transition = np.mean((alpha > ALPHA_FOND) & (alpha < ALPHA_PLEIN)) * 100
    print(f"  couverture {np.mean(alpha > 0.5) * 100:.1f} %  bord doux {transition:.2f} %")
    print(f"  lqip {lqip(image)[:64]}…")
    (RACINE / "work" / "hero-v7" / "lqip-figures.txt").write_text(lqip(image), encoding="utf-8")


if __name__ == "__main__":
    main()
