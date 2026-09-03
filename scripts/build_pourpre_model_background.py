#!/usr/bin/env python3
"""Recompose la photo Pourpre sur le même mur chromatique que Lilas/Rose.

La photographie d'Alex reste l'autorité : ses pixels et ses coordonnées ne
sont ni générés, ni étirés, ni déplacés. Comme pour les autres portraits du
carrousel, on isole uniquement le sujet avec un masque de segmentation puis on
remplace le studio gris par un mur coloré. Le mur est échantillonné sur la
variante Pourpre déjà validée afin de conserver exactement sa gamme bordeaux.

Contrairement à l'ancienne v2, aucune ligne n'est coupée ou recopiée : la
silhouette garde donc le cadrage vertical du master 1731 x 2600.

Usage : python scripts/build_pourpre_model_background.py
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parent.parent
MASTER = (
    ROOT
    / "public"
    / "images"
    / "client"
    / "raw"
    / "product-card-pourpre.webp"
)
PALETTE = (
    ROOT
    / "public"
    / "images"
    / "client"
    / "apollon-world"
    / "apollon-pourpre-model-color-v2.webp"
)
OUTPUT = (
    ROOT
    / "public"
    / "images"
    / "client"
    / "apollon-world"
    / "apollon-pourpre-model-color-v4.webp"
)
MODEL = "birefnet-general-lite"
ALPHA_BACKGROUND = 0.02
ALPHA_SOLID = 0.98


def subject_alpha(source: Image.Image) -> np.ndarray:
    """Return an alpha mask only; the model never redraws the photograph."""
    from rembg import new_session, remove

    mask = remove(source, session=new_session(MODEL), only_mask=True)
    alpha = np.asarray(mask).astype(np.float32) / 255.0

    # A tiny close seals isolated pinholes in skin/fabric without expanding the
    # silhouette. The final blur only antialiases the already detected edge.
    solid = (alpha > 0.55).astype(np.uint8) * 255
    solid = cv2.morphologyEx(solid, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    softened = Image.fromarray(solid).filter(ImageFilter.GaussianBlur(0.65))
    return np.maximum(
        alpha,
        np.asarray(softened).astype(np.float32) / 255.0,
    )


def decontaminate(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Remove the former grey studio colour from semi-transparent edge pixels."""
    subject = (alpha > ALPHA_BACKGROUND).astype(np.uint8)
    erase = cv2.dilate(subject, np.ones((25, 25), np.uint8))
    background = cv2.inpaint(
        cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2BGR),
        erase,
        15,
        cv2.INPAINT_TELEA,
    )
    background = cv2.cvtColor(background, cv2.COLOR_BGR2RGB).astype(np.float32)

    edge = (alpha > ALPHA_BACKGROUND) & (alpha < ALPHA_SOLID)
    a = np.clip(alpha[..., None], 1e-3, 1.0)
    return np.where(
        edge[..., None],
        np.clip((rgb - (1.0 - a) * background) / a, 0, 255),
        rgb,
    )


def pourpre_wall(size: tuple[int, int]) -> np.ndarray:
    """Rebuild the validated Pourpre wall from its clean right-hand edge."""
    width, height = size
    palette = np.asarray(Image.open(PALETTE).convert("RGB")).astype(np.float32)
    if palette.shape[:2] != (height, width):
        raise ValueError("Le master et la palette Pourpre doivent avoir le même format")

    # The outer 7.5 % on the right is clean wall at every height in the
    # validated asset. Its row median preserves the subtle studio falloff.
    edge_width = max(32, round(width * 0.075))
    row_colour = np.median(palette[:, -edge_width:, :], axis=1)
    row_colour = cv2.GaussianBlur(row_colour[:, None, :], (1, 81), 0)[:, 0, :]
    wall = np.broadcast_to(row_colour[:, None, :], (height, width, 3)).copy()

    # Lilas and Rose are not flat swatches: they retain a discreet central
    # studio glow. Recreate the same restrained depth without adding objects.
    x = np.linspace(-1.0, 1.0, width, dtype=np.float32)
    glow = (1.0 - np.square(np.abs(x))) * 0.055 - 0.018
    wall *= (1.0 + glow[None, :, None])
    return np.clip(wall, 0, 255)


def save_variants(image: Image.Image) -> None:
    image.save(OUTPUT, "WEBP", quality=94, method=6)
    for width in (360, 720, 1080):
        height = round(image.height * width / image.width)
        variant = image.resize((width, height), Image.Resampling.LANCZOS)
        variant.save(
            OUTPUT.with_name(f"{OUTPUT.stem}-{width}{OUTPUT.suffix}"),
            "WEBP",
            quality=90,
            method=6,
        )


def main() -> None:
    source = Image.open(MASTER).convert("RGB")
    rgb = np.asarray(source).astype(np.float32)
    alpha = subject_alpha(source)
    foreground = decontaminate(rgb, alpha)
    wall = pourpre_wall(source.size)
    composite = foreground * alpha[..., None] + wall * (1.0 - alpha[..., None])
    image = Image.fromarray(np.clip(composite, 0, 255).astype(np.uint8), "RGB")
    save_variants(image)

    ys, xs = np.where(alpha > 0.5)
    bbox = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    print(f"source {source.width}x{source.height}; sujet bbox={bbox}; aucun déplacement")
    print(f"sortie {OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size // 1024} Ko)")


if __name__ == "__main__":
    main()
