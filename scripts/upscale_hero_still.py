from __future__ import annotations

import argparse
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps


TARGET_SIZE = (3840, 2160)


def resize_exact(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image).convert("RGB")
    source_ratio = image.width / image.height
    target_ratio = TARGET_SIZE[0] / TARGET_SIZE[1]

    if abs(source_ratio - target_ratio) > 0.001:
        if source_ratio > target_ratio:
            width = round(image.height * target_ratio)
            left = (image.width - width) // 2
            image = image.crop((left, 0, left + width, image.height))
        else:
            height = round(image.width / target_ratio)
            top = (image.height - height) // 2
            image = image.crop((0, top, image.width, top + height))

    return image.resize(TARGET_SIZE, Image.Resampling.LANCZOS)


def restrained_microcontrast(image: Image.Image, amount: float) -> Image.Image:
    rgb = np.asarray(image, dtype=np.float32) / 255.0
    linear = np.power(rgb, 2.2)
    softened = cv2.GaussianBlur(linear, (0, 0), sigmaX=1.15, sigmaY=1.15)
    restored = np.clip(linear + amount * (linear - softened), 0.0, 1.0)
    srgb = np.power(restored, 1.0 / 2.2)
    return Image.fromarray(np.round(srgb * 255.0).astype(np.uint8), "RGB")


def save_outputs(source: Path, output_png: Path, amount: float) -> None:
    with Image.open(source) as image:
        result = restrained_microcontrast(resize_exact(image), amount)

    output_png.parent.mkdir(parents=True, exist_ok=True)
    result.save(output_png, format="PNG", optimize=True, compress_level=4)
    result.save(
        output_png.with_suffix(".webp"),
        format="WEBP",
        quality=96,
        method=6,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Identity-safe 4K upscale for the AJ Luxury hero still."
    )
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument(
        "--amount",
        type=float,
        default=0.16,
        help="Linear-light microcontrast strength. Keep below 0.25.",
    )
    args = parser.parse_args()
    save_outputs(args.source, args.output, args.amount)


if __name__ == "__main__":
    main()
