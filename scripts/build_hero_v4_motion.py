"""Build the approved V4 hero into a fast, fluid liquid-motion film.

Only retained AJ Luxury pixels are used. The existing responsive posters are
the masters; a plum-chrome liquid front spreads from the models' contact zone
across the reflective floor, then remains alive with source-derived refraction
and caustics. The effect returns to the untouched poster for a seamless replay.
A feathered protection matte keeps the models, faces, underwear, metallic seat
and foreground leg unchanged.

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
FPS = 30
DURATION_SECONDS = 5.6
FRAME_COUNT = round(FPS * DURATION_SECONDS)


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


def polygon_matte(
    width: int,
    height: int,
    polygons: tuple[tuple[tuple[float, float], ...], ...],
) -> np.ndarray:
    matte = np.zeros((height, width), dtype=np.uint8)
    for polygon in polygons:
        points = np.array(
            [[round(x * width), round(y * height)] for x, y in polygon],
            dtype=np.int32,
        )
        cv2.fillPoly(matte, [points], 1)
    return matte


def seed_connected_component(candidate: np.ndarray, seed: np.ndarray) -> np.ndarray:
    component_count, labels = cv2.connectedComponents(candidate.astype(np.uint8), 8)
    overlaps = [
        int(np.count_nonzero(seed & (labels == label)))
        for label in range(1, component_count)
    ]
    if not overlaps or max(overlaps) == 0:
        raise RuntimeError("poster-derived subject matte lost its interior seed")
    return labels == (int(np.argmax(overlaps)) + 1)


def poster_lower_skin_matte(base: np.ndarray, portrait: bool) -> np.ndarray:
    """Extract lower-body skin from the retained poster without spanning floor."""
    height, width = base.shape[:2]
    hsv = cv2.cvtColor(base, cv2.COLOR_BGR2HSV)
    ycrcb = cv2.cvtColor(base, cv2.COLOR_BGR2YCrCb)
    hue, saturation, _ = cv2.split(hsv)
    luma, red_difference, blue_difference = cv2.split(ycrcb)
    skin = (
        ((hue <= 25) | (hue >= 170))
        & (saturation >= 30)
        & (red_difference >= 137)
        & (red_difference <= 180)
        & (blue_difference >= 75)
        & (blue_difference <= 130)
        & (luma >= 28)
    ).astype(np.uint8)

    roi = np.zeros_like(skin)
    left, right = ((0.390, 0.830) if portrait else (0.425, 0.690))
    roi[round(height * 0.515) :, round(width * left) : round(width * right)] = 1
    skin *= roi
    kernel_size = max(7, round(min(width, height) / 100.0))
    kernel_size += 1 - kernel_size % 2
    kernel = cv2.getStructuringElement(
        cv2.MORPH_ELLIPSE,
        (kernel_size, kernel_size),
    )
    skin = cv2.morphologyEx(skin, cv2.MORPH_CLOSE, kernel)

    # Reject isolated chroma noise while retaining every actual lower limb.
    component_count, labels, stats, _ = cv2.connectedComponentsWithStats(skin, 8)
    retained = np.zeros_like(skin)
    minimum_area = max(48, round(width * height * 0.00005))
    for label in range(1, component_count):
        if stats[label, cv2.CC_STAT_AREA] >= minimum_area:
            retained[labels == label] = 1
    return retained.astype(np.float32)


def poster_foreground_calf_matte(base: np.ndarray, portrait: bool) -> np.ndarray:
    """Fit the foreground limb to retained-poster colour and visible edges."""
    height, width = base.shape[:2]
    if portrait:
        seed_polygons = (
            ((0.568, 0.681), (0.616, 0.666), (0.777, 0.974),
             (0.784, 0.998), (0.738, 0.998), (0.646, 0.846)),
        )
        evaluation_polygons = (
            ((0.493, 0.651), (0.813, 0.651), (0.813, 0.999), (0.493, 0.999)),
        )
    else:
        seed_polygons = (
            ((0.544, 0.692), (0.574, 0.679), (0.612, 0.958),
             (0.599, 0.989), (0.579, 0.963), (0.555, 0.767)),
        )
        evaluation_polygons = (
            ((0.492, 0.674), (0.665, 0.674), (0.665, 0.999), (0.492, 0.999)),
        )

    seed = polygon_matte(width, height, seed_polygons).astype(bool)
    evaluation = polygon_matte(width, height, evaluation_polygons).astype(bool)
    search_radius = max(20, round(min(width, height) * 0.055))
    search = cv2.dilate(
        seed.astype(np.uint8),
        cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (search_radius * 2 + 1, search_radius * 2 + 1),
        ),
    ).astype(bool) & evaluation

    lab = cv2.cvtColor(base, cv2.COLOR_BGR2LAB).astype(np.float32)
    seed_pixels = lab[seed]
    median = np.median(seed_pixels, axis=0)
    deviation = np.abs(seed_pixels - median)
    scale = np.maximum(
        np.percentile(deviation, 85, axis=0),
        np.array((12.0, 7.0, 7.0), dtype=np.float32),
    )
    colour_distance = np.sqrt(np.sum(((lab - median) / scale) ** 2, axis=2))

    grabcut = np.full((height, width), cv2.GC_BGD, dtype=np.uint8)
    grabcut[search] = cv2.GC_PR_BGD
    grabcut[(colour_distance <= 3.6) & search] = cv2.GC_PR_FGD
    grabcut[seed] = cv2.GC_FGD
    background_model = np.zeros((1, 65), np.float64)
    foreground_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(
        base,
        grabcut,
        None,
        background_model,
        foreground_model,
        7,
        cv2.GC_INIT_WITH_MASK,
    )
    candidate = (
        (grabcut == cv2.GC_FGD) | (grabcut == cv2.GC_PR_FGD)
    ) & search
    calf = seed_connected_component(candidate, seed)
    calf = cv2.morphologyEx(
        calf.astype(np.uint8),
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)),
    ).astype(bool)
    calf = seed_connected_component(calf | seed, seed)
    contours, _ = cv2.findContours(
        calf.astype(np.uint8),
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE,
    )
    filled = np.zeros((height, width), dtype=np.uint8)
    cv2.drawContours(filled, contours, -1, 1, cv2.FILLED)
    return (filled.astype(bool) & search).astype(np.float32)


def lower_subject_interior_matte(
    width: int,
    height: int,
    portrait: bool,
) -> np.ndarray:
    """Protect dark foot interiors that colour segmentation may conservatively omit."""
    if portrait:
        polygons = (
            ((0.530, 0.830), (0.575, 0.820), (0.598, 0.893), (0.545, 0.903)),
            ((0.685, 0.845), (0.735, 0.838), (0.782, 0.893), (0.705, 0.903)),
            ((0.500, 0.670), (0.595, 0.645), (0.692, 0.820), (0.592, 0.850)),
            ((0.590, 0.810), (0.685, 0.795), (0.820, 0.982),
             (0.738, 1.000), (0.635, 0.900)),
        )
    else:
        polygons = (
            ((0.500, 0.845), (0.535, 0.835), (0.550, 0.905), (0.510, 0.918)),
            ((0.590, 0.840), (0.630, 0.835), (0.652, 0.902), (0.605, 0.912)),
            ((0.495, 0.655), (0.560, 0.635), (0.620, 0.825), (0.550, 0.855)),
            ((0.550, 0.805), (0.620, 0.790), (0.660, 1.000), (0.580, 1.000)),
        )
    return polygon_matte(width, height, polygons).astype(np.float32)


def protection_matte(base: np.ndarray, portrait: bool) -> np.ndarray:
    """Protect retained subjects with tightly traced, softly antialiased silhouettes."""
    height, width = base.shape[:2]
    matte = np.zeros((height, width), dtype=np.float32)
    if portrait:
        polygons = (
            # Seated model: head/hair.
            (
                (0.235, 0.055),
                (0.420, 0.055),
                (0.485, 0.150),
                (0.465, 0.245),
                (0.385, 0.290),
                (0.285, 0.245),
                (0.235, 0.170),
            ),
            # Seated model: torso, left arm and hand.
            (
                (0.235, 0.185),
                (0.420, 0.180),
                (0.485, 0.260),
                (0.465, 0.390),
                (0.515, 0.490),
                (0.470, 0.535),
                (0.390, 0.500),
                (0.345, 0.535),
                (0.310, 0.625),
                (0.270, 0.675),
                (0.225, 0.650),
                (0.215, 0.575),
                (0.155, 0.545),
                (0.105, 0.485),
                (0.100, 0.390),
                (0.130, 0.310),
                (0.200, 0.245),
            ),
            # Seated underwear, hips and upper thighs.
            (
                (0.270, 0.440),
                (0.515, 0.425),
                (0.580, 0.535),
                (0.695, 0.595),
                (0.745, 0.655),
                (0.690, 0.725),
                (0.545, 0.705),
                (0.435, 0.645),
                (0.290, 0.650),
            ),
            # Liquid-metal chair, traced separately from anatomy.
            (
                (0.095, 0.595),
                (0.315, 0.585),
                (0.355, 0.625),
                (0.345, 0.740),
                (0.400, 0.895),
                (0.450, 0.920),
                (0.465, 1.000),
                (0.075, 1.000),
                (0.085, 0.915),
                (0.105, 0.800),
                (0.090, 0.690),
            ),
            # Standing model: head, torso, arms and boxer.
            (
                (0.485, 0.045),
                (0.625, 0.045),
                (0.660, 0.190),
                (0.725, 0.230),
                (0.795, 0.305),
                (0.790, 0.390),
                (0.720, 0.450),
                (0.715, 0.555),
                (0.630, 0.575),
                (0.610, 0.445),
                (0.505, 0.445),
                (0.490, 0.555),
                (0.420, 0.565),
                (0.425, 0.455),
                (0.355, 0.405),
                (0.355, 0.315),
                (0.420, 0.245),
                (0.480, 0.200),
            ),
            # Standing boxer, kept separate so its lower edge stays tight.
            (
                (0.490, 0.390),
                (0.720, 0.390),
                (0.745, 0.545),
                (0.505, 0.570),
            ),
        )
    else:
        polygons = (
            # Seated model: head/hair.
            (
                (0.385, 0.085),
                (0.475, 0.085),
                (0.495, 0.180),
                (0.475, 0.275),
                (0.420, 0.285),
                (0.390, 0.225),
            ),
            # Seated torso, arm and hand.
            (
                (0.385, 0.195),
                (0.475, 0.190),
                (0.500, 0.310),
                (0.485, 0.440),
                (0.520, 0.535),
                (0.480, 0.570),
                (0.435, 0.525),
                (0.410, 0.610),
                (0.400, 0.680),
                (0.370, 0.680),
                (0.355, 0.595),
                (0.330, 0.525),
                (0.325, 0.400),
                (0.345, 0.290),
            ),
            # Seated underwear and thighs.
            (
                (0.390, 0.505),
                (0.510, 0.490),
                (0.555, 0.555),
                (0.625, 0.615),
                (0.625, 0.690),
                (0.565, 0.730),
                (0.485, 0.695),
                (0.410, 0.675),
            ),
            # Liquid-metal chair.
            (
                (0.320, 0.630),
                (0.420, 0.625),
                (0.440, 0.690),
                (0.435, 0.800),
                (0.465, 0.955),
                (0.485, 1.000),
                (0.320, 1.000),
                (0.325, 0.900),
                (0.335, 0.790),
            ),
            # Standing model: head, torso, arms and boxer.
            (
                (0.505, 0.045),
                (0.565, 0.045),
                (0.580, 0.185),
                (0.620, 0.220),
                (0.655, 0.310),
                (0.650, 0.420),
                (0.620, 0.480),
                (0.615, 0.570),
                (0.545, 0.575),
                (0.530, 0.465),
                (0.485, 0.475),
                (0.475, 0.570),
                (0.445, 0.555),
                (0.450, 0.445),
                (0.425, 0.395),
                (0.430, 0.300),
                (0.465, 0.230),
                (0.500, 0.190),
            ),
        )

    for polygon in polygons:
        points = np.array(
            [[round(x * width), round(y * height)] for x, y in polygon],
            dtype=np.int32,
        )
        cv2.fillPoly(matte, [points], 1.0)

    matte = np.maximum(matte, poster_foreground_calf_matte(base, portrait))
    matte = np.maximum(
        matte,
        lower_subject_interior_matte(width, height, portrait),
    )

    # Feather strictly inward. Protection is exactly zero on the first pixel
    # outside the poster-derived silhouettes, eliminating any static moat.
    inside_distance = cv2.distanceTransform(
        matte.astype(np.uint8),
        cv2.DIST_L2,
        cv2.DIST_MASK_PRECISE,
    )
    return np.clip(inside_distance / 2.0, 0.0, 1.0).astype(np.float32)


def build_frame(
    base: np.ndarray,
    protect: np.ndarray,
    grid_x: np.ndarray,
    grid_y: np.ndarray,
    frame_index: int,
    portrait: bool,
) -> np.ndarray:
    height, width = base.shape[:2]
    # The input frame is deliberately exact at both ends. This keeps the poster
    # first-paint faithful and makes the looping video close without a visual cut.
    if frame_index == 0 or frame_index == FRAME_COUNT - 1:
        return base.copy()

    seconds = frame_index / FPS
    time = seconds / DURATION_SECONDS

    # Immediate onset, broad spread in under two seconds, a living hold, then a
    # clean return. Ease-out growth prevents the old slow/subtle first seconds.
    growth_input = float(np.clip((seconds - 0.06) / 1.68, 0.0, 1.0))
    extent = 1.0 - (1.0 - growth_input) ** 3.0
    arrival = float(smoothstep(seconds / 0.18))
    dissolve = float(1.0 - smoothstep((seconds - 4.32) / 1.18))
    visibility = arrival * dissolve
    phase = seconds * np.pi * 2.0
    horizon = 0.705 if portrait else 0.705

    x = grid_x / max(width - 1, 1)
    y = grid_y / max(height - 1, 1)
    # The reflective plane gains full liquid energy shortly after the horizon;
    # stretching this ramp to the bottom created a permanently weak foreground.
    floor = smoothstep((y - horizon) / 0.13)

    # Reflection displacement increases towards the foreground. Faster crossing
    # wave families make the filled pool visibly flow at 30 fps.
    amplitude = (
        floor
        * (1.0 - protect)
        * visibility
        * (2.0 + 10.0 * extent)
    )
    scale = min(width, height) / 934.0
    dx = amplitude * scale * (
        1.15 * np.sin(grid_y / (54.0 * scale) + phase * 0.86)
        + 0.58 * np.sin(grid_x / (103.0 * scale) - phase * 0.61)
        + 0.31 * np.sin((grid_x + grid_y) / (47.0 * scale) + phase * 1.12)
    )
    dy = amplitude * scale * (
        1.75 * np.sin(grid_y / (37.0 * scale) - phase * 0.77)
        + 0.68 * np.sin((grid_x + grid_y) / (81.0 * scale) + phase * 0.49)
        + 0.28 * np.sin(grid_x / (43.0 * scale) - phase * 1.19)
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

    # A signed travel field gives the pool a true advancing front instead of a
    # global tint. It originates between chair and feet, curls around protected
    # subjects and reaches the phone frame edges before 2 seconds.
    center_x = 0.61 if portrait else 0.55
    source_y = horizon + 0.105
    travel_x = np.abs(x - center_x) / (0.58 if portrait else 0.64)
    travel_down = np.maximum(y - source_y, 0.0) / 0.25
    travel_up = np.maximum(source_y - y, 0.0) / 0.13
    distance = np.sqrt(travel_x**2 + (travel_down + travel_up) ** 2)
    irregular = (
        0.095 * np.sin(x * 15.0 + y * 4.0 + phase * 0.19)
        + 0.052 * np.sin(x * 33.0 - y * 7.0 - phase * 0.27)
        + 0.025 * np.sin(x * 71.0 + phase * 0.43)
    )
    front = 0.035 + 1.43 * extent
    pool = smoothstep((front + irregular - distance) / 0.045)
    pool *= floor * (1.0 - protect) * visibility

    result = base.astype(np.float32) * (1.0 - pool[..., None])
    result += chrome * pool[..., None]

    # The plum undertow is sampled from the approved campaign palette. Its
    # stronger separation from the silver floor makes the propagation legible
    # on a small phone without adding any external image asset.
    liquid_tint = np.array([66.0, 20.0, 82.0], dtype=np.float32)
    tint_mix = pool * (0.36 + 0.22 * (1.0 - specular))
    result = result * (1.0 - tint_mix[..., None])
    result += liquid_tint[None, None, :] * tint_mix[..., None]

    # Crossing specular ribbons continuously re-form after the front has
    # passed. The signal is spatially modulated so it feels fluid, not striped.
    flow_a = np.sin(x * 31.0 + y * 12.0 + phase * 0.91)
    flow_b = np.sin(x * 57.0 - y * 19.0 - phase * 1.17)
    flow_c = np.sin((x + y) * 23.0 + 0.72 * np.sin(phase * 0.73))
    caustic = smoothstep((0.52 * flow_a + 0.31 * flow_b + 0.17 * flow_c + 0.08) / 0.72)
    caustic *= pool * (0.44 + 0.56 * specular)
    result += (42.0 * caustic)[..., None]
    dark_current = smoothstep((-0.58 * flow_a + 0.42 * flow_b - 0.18) / 0.68)
    result *= (1.0 - (0.16 * dark_current * pool)[..., None])

    # A broad low-frequency current keeps even smooth silver floor regions in
    # motion. It is deliberately achromatic: the retained campaign colour still
    # comes only from the plum undertow above.
    broad_current = np.sin(x * 17.0 + y * 11.0 + phase * 1.31)
    result += (22.0 * broad_current * pool)[..., None]

    # A bright mercury meniscus plus a darker inner lip makes the growth
    # unmistakable on phone screens without crossing the protected subjects.
    rim = np.exp(-((distance - (front + irregular)) / 0.022) ** 2)
    rim *= floor * (1.0 - protect) * visibility
    inner_lip = np.exp(-((distance - (front - 0.055 + irregular)) / 0.042) ** 2)
    inner_lip *= floor * (1.0 - protect) * visibility
    result *= (1.0 - (0.22 * inner_lip)[..., None])
    result += (112.0 * rim)[..., None]

    # A source-derived pressure ring travels through the filled pool during the
    # hold, so the liquid never freezes after reaching full extent.
    pressure = np.sin(distance * 24.0 - phase * 1.48)
    pressure_band = np.exp(-((pressure - 0.78) / 0.20) ** 2)
    pressure_band *= pool * (0.25 + 0.75 * specular)
    result += (30.0 * pressure_band)[..., None]

    # Two wide studio shadows move across architecture only. Their strength
    # ramps in and out, so the first frame is exactly the approved photograph.
    shadow_envelope = float((np.sin(np.pi * time) ** 0.9) * dissolve)
    diagonal = x + y * 0.31
    shadow_a_position = -0.18 + 1.60 * time
    shadow_b_position = 1.38 - 1.42 * time
    shadow = (
        np.exp(-((diagonal - shadow_a_position) / 0.15) ** 2)
        + 0.58 * np.exp(-((diagonal - shadow_b_position) / 0.22) ** 2)
    )
    architecture = 1.0 - smoothstep((y - (horizon - 0.07)) / 0.10)
    shadow_mask = (1.0 - protect) * architecture
    shadow_strength = 0.13 * shadow_envelope * shadow * shadow_mask
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
    protect = protection_matte(base, rendition.portrait)
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
        "medium",
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
    # Each HD rendition holds several float32 fields. Two workers keep the
    # generator inside commodity CI/desktop memory limits without changing the
    # encoded result.
    with ProcessPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(render, RENDITIONS))
    for name, size in results:
        print(f"{name}: {size:,} bytes")


if __name__ == "__main__":
    main()
