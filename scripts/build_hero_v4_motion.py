"""Build the approved V4 hero into a subtle one-shot motion film.

Only retained AJ Luxury pixels are used. The existing responsive posters are
the masters; the lower reflective floor is displaced and progressively
revealed while two soft studio shadows travel across the architecture. A
feathered protection matte keeps the models, faces, underwear and metallic
seat unchanged.

Usage: python scripts/build_hero_v4_motion.py
"""

from __future__ import annotations

import subprocess
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "public" / "images" / "client"
VIDEOS = ROOT / "public" / "videos"
FPS = 24
FRAME_COUNT = 216  # Nine seconds, played once and held on the final frame.


@dataclass(frozen=True)
class Rendition:
    name: str
    poster: str
    portrait: bool
    crf: int


RENDITIONS = (
    Rendition(
        "portrait-720x934",
        "hero-v4-portrait-720x934-poster.webp",
        True,
        18,
    ),
    Rendition(
        "tablet-1440x810",
        "hero-v4-tablet-1440x810-poster.webp",
        False,
        19,
    ),
    Rendition(
        "desktop-1920x1080",
        "hero-v4-desktop-1920x1080-poster.webp",
        False,
        18,
    ),
    Rendition(
        "xl-native-1920x1080",
        "hero-v4-xl-native-1920x1080-poster.webp",
        False,
        17,
    ),
)


def smoothstep(value: np.ndarray | float) -> np.ndarray | float:
    clipped = np.clip(value, 0.0, 1.0)
    return clipped * clipped * (3.0 - 2.0 * clipped)


def protection_matte(width: int, height: int, portrait: bool) -> np.ndarray:
    """Protect people and product using normalized, generously feathered mattes."""
    matte = np.zeros((height, width), dtype=np.float32)
    if portrait:
        polygons = (
            # Seated model and the liquid-metal chair.
            (
                (0.08, 0.05),
                (0.48, 0.04),
                (0.57, 0.38),
                (0.76, 0.59),
                (1.00, 0.99),
                (0.82, 1.00),
                (0.50, 0.63),
                (0.43, 1.00),
                (0.04, 1.00),
                (0.00, 0.54),
            ),
            # Standing model, boxer and legs.
            (
                (0.35, 0.04),
                (0.70, 0.04),
                (0.79, 0.47),
                (0.71, 0.88),
                (0.57, 0.88),
                (0.49, 0.55),
                (0.34, 0.42),
            ),
            # Foreground leg gets its own matte so no liquid grade can cross it.
            (
                (0.43, 0.52),
                (0.75, 0.52),
                (1.00, 0.91),
                (1.00, 1.00),
                (0.78, 1.00),
                (0.47, 0.66),
            ),
        )
    else:
        polygons = (
            # Seated model and chair.
            (
                (0.30, 0.02),
                (0.52, 0.02),
                (0.59, 0.39),
                (0.72, 0.62),
                (0.67, 1.00),
                (0.54, 1.00),
                (0.43, 0.58),
                (0.38, 1.00),
                (0.28, 1.00),
                (0.25, 0.56),
            ),
            # Standing model.
            (
                (0.45, 0.02),
                (0.64, 0.02),
                (0.70, 0.46),
                (0.65, 0.91),
                (0.54, 0.91),
                (0.48, 0.50),
            ),
            # Foreground leg, protected separately through the bottom edge.
            (
                (0.42, 0.47),
                (0.59, 0.47),
                (0.69, 1.00),
                (0.51, 1.00),
            ),
        )

    for polygon in polygons:
        points = np.array(
            [[round(x * width), round(y * height)] for x, y in polygon],
            dtype=np.int32,
        )
        cv2.fillPoly(matte, [points], 1.0)

    radius = max(5, round(min(width, height) * 0.012))
    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE,
        (radius * 2 + 1, radius * 2 + 1),
    )
    matte = cv2.dilate(matte, kernel)
    sigma = max(8.0, min(width, height) * 0.022)
    return np.clip(cv2.GaussianBlur(matte, (0, 0), sigma), 0.0, 1.0)


def build_frame(
    base: np.ndarray,
    protect: np.ndarray,
    grid_x: np.ndarray,
    grid_y: np.ndarray,
    frame_index: int,
    portrait: bool,
) -> np.ndarray:
    height, width = base.shape[:2]
    time = frame_index / (FRAME_COUNT - 1)
    growth = float(smoothstep((time - 0.035) / 0.76))
    phase = time * np.pi * 2.0
    horizon = 0.705 if portrait else 0.705

    x = grid_x / max(width - 1, 1)
    y = grid_y / max(height - 1, 1)
    floor = smoothstep((y - horizon) / (1.0 - horizon))

    # Reflection displacement increases towards the foreground. It never
    # reaches protected campaign pixels.
    amplitude = floor * (1.0 - protect) * (0.65 + 2.45 * growth)
    scale = min(width, height) / 934.0
    dx = amplitude * scale * (
        1.05 * np.sin(grid_y / (62.0 * scale) + phase * 0.82)
        + 0.46 * np.sin(grid_x / (131.0 * scale) - phase * 0.47)
    )
    dy = amplitude * scale * (
        1.60 * np.sin(grid_y / (39.0 * scale) - phase * 0.68)
        + 0.52 * np.sin((grid_x + grid_y) / (97.0 * scale) + phase * 0.31)
    )
    warped = cv2.remap(
        base,
        (grid_x + dx).astype(np.float32),
        (grid_y + dy).astype(np.float32),
        interpolation=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_REFLECT_101,
    ).astype(np.float32)

    # A local chrome grade deepens dark reflections and retains white speculars.
    luminance = cv2.cvtColor(base, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
    specular = smoothstep((luminance - 0.56) / 0.34)
    monochrome = np.repeat((luminance * 255.0)[..., None], 3, axis=2)
    horizon_px = horizon * (height - 1)
    reflected_y = np.clip(
        2.0 * horizon_px - grid_y + dy * 1.6,
        0,
        height - 1,
    ).astype(np.float32)
    reflected = cv2.remap(
        base,
        (grid_x + dx * 0.6).astype(np.float32),
        reflected_y,
        interpolation=cv2.INTER_LANCZOS4,
        borderMode=cv2.BORDER_REFLECT_101,
    ).astype(np.float32)
    reflected = cv2.GaussianBlur(reflected, (0, 0), max(0.8, scale * 0.9))
    chrome = warped * 0.52 + monochrome * 0.25 + reflected * 0.23
    chrome = (chrome - 118.0) * 1.22 + 126.0
    chrome *= 0.91 + 0.14 * specular[..., None]
    chrome += (11.0 * specular * floor)[..., None]

    # The pool grows from the models' contact zone across the floor. The edge
    # is broad and asymmetric so the reveal reads as liquid, never as a wipe.
    center_x = 0.54 if portrait else 0.52
    normalized_x = (x - center_x) / (0.11 + 0.59 * growth)
    normalized_y = (y - (horizon + 0.13)) / 0.39
    irregular = (
        0.060 * np.sin(x * 16.0 + phase * 0.23)
        + 0.035 * np.sin(x * 31.0 - phase * 0.17)
    )
    distance = np.sqrt(normalized_x * normalized_x + normalized_y * normalized_y)
    pool = smoothstep((1.06 + irregular - distance) / 0.105)
    pool *= floor * (1.0 - protect) * growth

    result = base.astype(np.float32) * (1.0 - pool[..., None])
    result += chrome * pool[..., None]

    # A narrow moving rim makes the growth distinct without tinting the image.
    rim = np.exp(-((distance - (1.00 + irregular)) / 0.035) ** 2)
    rim *= floor * (1.0 - protect) * growth * (1.0 - 0.35 * growth)
    result += (13.0 * rim)[..., None]

    # Two wide studio shadows move across architecture only. Their strength
    # ramps in and out, so the first frame is exactly the approved photograph.
    shadow_envelope = float(np.sin(np.pi * time) ** 1.35)
    diagonal = x + y * 0.31
    shadow_a_position = -0.16 + 1.42 * time
    shadow_b_position = 1.36 - 1.18 * time
    shadow = (
        np.exp(-((diagonal - shadow_a_position) / 0.15) ** 2)
        + 0.58 * np.exp(-((diagonal - shadow_b_position) / 0.22) ** 2)
    )
    architecture = 1.0 - smoothstep((y - (horizon - 0.07)) / 0.10)
    shadow_mask = (1.0 - protect) * architecture
    shadow_strength = 0.072 * shadow_envelope * shadow * shadow_mask
    result *= (1.0 - shadow_strength[..., None])

    return np.clip(np.round(result), 0, 255).astype(np.uint8)


def render(rendition: Rendition) -> tuple[str, int]:
    cv2.setNumThreads(1)
    source = IMAGES / rendition.poster
    base = cv2.imread(str(source), cv2.IMREAD_COLOR)
    if base is None:
        raise RuntimeError(f"Unable to read retained hero poster: {source}")

    height, width = base.shape[:2]
    grid_x, grid_y = np.meshgrid(
        np.arange(width, dtype=np.float32),
        np.arange(height, dtype=np.float32),
    )
    protect = protection_matte(width, height, rendition.portrait)
    output = VIDEOS / f"aj-luxury-hero-v4-motion-{rendition.name}.mp4"
    output.parent.mkdir(parents=True, exist_ok=True)

    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "bgr24",
        "-s",
        f"{width}x{height}",
        "-r",
        str(FPS),
        "-i",
        "-",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        str(rendition.crf),
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        "high",
        "-level",
        "4.1",
        "-g",
        str(FPS * 2),
        "-movflags",
        "+faststart",
        str(output),
    ]
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    assert process.stdin is not None
    try:
        for frame_index in range(FRAME_COUNT):
            frame = build_frame(
                base,
                protect,
                grid_x,
                grid_y,
                frame_index,
                rendition.portrait,
            )
            process.stdin.write(frame.tobytes())
    finally:
        process.stdin.close()
    return_code = process.wait()
    if return_code != 0:
        raise RuntimeError(f"ffmpeg failed for {rendition.name}: {return_code}")
    return output.name, output.stat().st_size


def main() -> None:
    with ProcessPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(render, RENDITIONS))
    for name, size in results:
        print(f"{name}: {size:,} bytes")


if __name__ == "__main__":
    main()
