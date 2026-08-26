"""Build independent frame-by-frame evidence for the V4 hero films.

Subject-contamination ROIs and free-floor zones are held out. The critical calf
annulus is derived from retained-poster colour and edge evidence around a small,
conservative interior seed. This file neither imports nor recreates the film
generator's production matte, preventing the evidence from validating itself.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "public" / "images" / "client"
VIDEOS = ROOT / "public" / "videos"
OUTPUT = ROOT / "artifacts" / "hero-motion-v4-proof" / "canonical-r2"
MANIFEST = OUTPUT / "hero-motion-proof-manifest.json"
GENERATOR = ROOT / "scripts" / "build_hero_v4_motion.py"
PROOF_SCRIPT = Path(__file__).resolve()
PROOF_TEST = ROOT / "tests" / "production-hero-motion.test.mjs"

EXPECTED_FPS = 30.0
EXPECTED_DURATION_SECONDS = 5.6
EXPECTED_FRAME_COUNT = 168
MAX_PAYLOAD_BYTES = 9 * 1024 * 1024
MIN_PAYLOAD_BYTES = 128 * 1024
ONSET_DEADLINE_SECONDS = 0.25
ONSET_MIN_COVERAGE_PERCENT = 3.0
COVERAGE_PIXEL_DELTA = 6.0
TEMPORAL_PIXEL_DELTA = 3.0
FLOOR_COVERAGE_AT_2S_MIN_PERCENT = 80.0
HOLD_MIN_PERCENT = 30.0
HOLD_START_SECONDS = 2.0
HOLD_END_SECONDS = 4.3
HOLD_WINDOW_SECONDS = 0.1
ANNULUS_INNER_PIXELS = 4.0
ANNULUS_OUTER_PIXELS = 20.0
CALF_SEARCH_DILATION_FRACTION = 0.055
LOOP_MEAN_DELTA_MAX = 2.0
LOOP_P95_DELTA_MAX = 5.0
POSTER_MEAN_DELTA_MAX = 3.0
POSTER_P95_DELTA_MAX = 8.0

CONTACT_TIMES = (0.0, 0.23, 0.60, 1.20, 2.00, 3.367, 4.30, 5.567)
LABELS = (
    "0.00 s - SOURCE",
    "0.23 s - DEPART",
    "0.60 s - PROPAGATION",
    "1.20 s - EXPANSION",
    "2.00 s - SOL COUVERT",
    "3.367 s - SURFACE VIVANTE",
    "4.30 s - RETOUR",
    "5.56 s - BOUCLE",
)


@dataclass(frozen=True)
class EvidenceRendition:
    name: str
    poster: str
    width: int
    height: int
    portrait: bool


RENDITIONS = (
    EvidenceRendition(
        "portrait-720x934",
        "hero-v4-portrait-720x934-poster.webp",
        720,
        934,
        True,
    ),
    EvidenceRendition(
        "tablet-1440x810",
        "hero-v4-tablet-1440x810-poster.webp",
        1440,
        810,
        False,
    ),
    EvidenceRendition(
        "desktop-1920x1080",
        "hero-v4-desktop-1920x1080-poster.webp",
        1920,
        1080,
        False,
    ),
    EvidenceRendition(
        "xl-native-1920x1080",
        "hero-v4-xl-native-1920x1080-poster.webp",
        1920,
        1080,
        False,
    ),
)


# Conservative subject interiors traced separately from the production matte.
PORTRAIT_REGIONS = {
    "face": (
        ((0.315, 0.080), (0.450, 0.072), (0.465, 0.205), (0.345, 0.225)),
        ((0.510, 0.060), (0.625, 0.060), (0.635, 0.190), (0.520, 0.205)),
    ),
    "underwear": (
        ((0.285, 0.475), (0.510, 0.445), (0.555, 0.575), (0.355, 0.625)),
        ((0.505, 0.405), (0.710, 0.405), (0.730, 0.535), (0.520, 0.555)),
    ),
    "chair": (
        ((0.105, 0.640), (0.345, 0.625), (0.400, 0.905), (0.115, 0.955)),
    ),
    "foot": (
        ((0.535, 0.835), (0.570, 0.825), (0.592, 0.888), (0.550, 0.895)),
        ((0.690, 0.850), (0.730, 0.845), (0.775, 0.888), (0.710, 0.895)),
    ),
    "shin": (
        ((0.505, 0.675), (0.590, 0.650), (0.685, 0.815), (0.595, 0.845)),
    ),
    "calf": (
        ((0.595, 0.815), (0.680, 0.800), (0.815, 0.985), (0.735, 1.000), (0.640, 0.900)),
    ),
}

LANDSCAPE_REGIONS = {
    "face": (
        ((0.405, 0.115), (0.475, 0.105), (0.485, 0.245), (0.420, 0.255)),
        ((0.515, 0.075), (0.565, 0.070), (0.575, 0.205), (0.520, 0.215)),
    ),
    "underwear": (
        ((0.395, 0.515), (0.515, 0.500), (0.550, 0.630), (0.420, 0.680)),
        ((0.505, 0.445), (0.610, 0.435), (0.620, 0.560), (0.515, 0.565)),
    ),
    "chair": (
        ((0.345, 0.720), (0.375, 0.720), (0.375, 0.910), (0.345, 0.910)),
    ),
    "foot": (
        ((0.505, 0.850), (0.530, 0.840), (0.545, 0.900), (0.515, 0.910)),
        ((0.595, 0.845), (0.625, 0.840), (0.645, 0.895), (0.610, 0.905)),
    ),
    "shin": (
        ((0.500, 0.660), (0.555, 0.640), (0.615, 0.825), (0.555, 0.850)),
    ),
    "calf": (
        ((0.555, 0.810), (0.615, 0.795), (0.655, 1.000), (0.585, 1.000)),
    ),
}

PORTRAIT_FLOOR = (
    ((0.820, 0.735), (0.990, 0.735), (0.990, 0.980), (0.890, 0.980), (0.835, 0.860)),
)
LANDSCAPE_FLOOR = (
    ((0.015, 0.815), (0.285, 0.815), (0.285, 0.985), (0.015, 0.985)),
    ((0.720, 0.820), (0.970, 0.820), (0.970, 0.985), (0.720, 0.985)),
)

# The calf annulus is not traced from the generator. A small conservative seed
# sits strictly inside real skin in the retained poster. GrabCut then follows
# poster colour and edge evidence to the visible subject boundary. Search and
# evaluation zones merely bound that image operation; none is a subject outline.
PORTRAIT_CALF_SEED = (
    ((0.568, 0.681), (0.616, 0.666), (0.777, 0.974),
     (0.784, 0.998), (0.738, 0.998), (0.646, 0.846)),
)
LANDSCAPE_CALF_SEED = (
    ((0.544, 0.692), (0.574, 0.679), (0.612, 0.958),
     (0.599, 0.989), (0.579, 0.963), (0.555, 0.767)),
)
PORTRAIT_CALF_EVALUATION = (
    ((0.493, 0.651), (0.813, 0.651), (0.813, 0.999), (0.493, 0.999)),
)
LANDSCAPE_CALF_EVALUATION = (
    ((0.492, 0.674), (0.665, 0.674), (0.665, 0.999), (0.492, 0.999)),
)


def mask_from_polygons(
    width: int,
    height: int,
    polygons: tuple[tuple[tuple[float, float], ...], ...],
) -> np.ndarray:
    mask = np.zeros((height, width), dtype=np.uint8)
    for polygon in polygons:
        points = np.array(
            [[round(x * width), round(y * height)] for x, y in polygon],
            dtype=np.int32,
        )
        cv2.fillPoly(mask, [points], 1)
    return mask.astype(bool)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def relative_path(path: Path) -> str:
    return path.resolve().relative_to(ROOT).as_posix()


def file_record(path: Path) -> dict[str, object]:
    return {
        "path": relative_path(path),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def canonical_payload_sha256(payload: dict[str, object]) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def video_path(rendition: EvidenceRendition) -> Path:
    return VIDEOS / f"aj-luxury-hero-v4-motion-{rendition.name}.mp4"


def require(
    condition: bool,
    failures: list[str],
    rendition: EvidenceRendition,
    message: str,
) -> None:
    if not condition:
        failures.append(f"{rendition.name}: {message}")


def ffprobe(path: Path) -> dict[str, object]:
    command = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        (
            "format=duration,size,format_name:"
            "stream=index,codec_type,codec_name,width,height,avg_frame_rate,"
            "r_frame_rate,nb_frames,duration"
        ),
        "-of",
        "json",
        str(path),
    ]
    try:
        completed = subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as error:
        raise RuntimeError("ffprobe is required by the hero-motion proof gate") from error
    except subprocess.CalledProcessError as error:
        raise RuntimeError(
            f"ffprobe could not inspect {relative_path(path)}: {error.stderr.strip()}"
        ) from error
    return json.loads(completed.stdout)


def top_level_atoms(path: Path) -> list[dict[str, int | str]]:
    atoms: list[dict[str, int | str]] = []
    file_size = path.stat().st_size
    with path.open("rb") as stream:
        offset = 0
        while offset + 8 <= file_size:
            stream.seek(offset)
            header = stream.read(8)
            size = int.from_bytes(header[:4], "big")
            atom_type = header[4:8].decode("latin-1")
            header_size = 8
            if size == 1:
                extended = stream.read(8)
                if len(extended) != 8:
                    break
                size = int.from_bytes(extended, "big")
                header_size = 16
            elif size == 0:
                size = file_size - offset
            if size < header_size or offset + size > file_size:
                break
            atoms.append({"type": atom_type, "offset": offset, "size": size})
            offset += size
    return atoms


def rate_as_float(value: str | None) -> float:
    if not value or value == "0/0":
        return 0.0
    return float(Fraction(value))


def frame_index(seconds: float, fps: float) -> int:
    return int(round(seconds * fps))


def hold_windows(fps: float) -> list[tuple[float, float, int, int]]:
    window_count = round(
        (HOLD_END_SECONDS - HOLD_START_SECONDS) / HOLD_WINDOW_SECONDS
    )
    return [
        (
            round(HOLD_START_SECONDS + step * HOLD_WINDOW_SECONDS, 3),
            round(HOLD_START_SECONDS + (step + 1) * HOLD_WINDOW_SECONDS, 3),
            frame_index(HOLD_START_SECONDS + step * HOLD_WINDOW_SECONDS, fps),
            frame_index(
                HOLD_START_SECONDS + (step + 1) * HOLD_WINDOW_SECONDS,
                fps,
            ),
        )
        for step in range(window_count)
    ]


def decode_all_frames(
    path: Path,
    fps: float,
) -> tuple[dict[int, np.ndarray], np.ndarray, int, bool]:
    windows = hold_windows(fps)
    onset_last_index = int(np.floor(ONSET_DEADLINE_SECONDS * fps + 1e-9))
    selected_indices = set(range(onset_last_index + 1))
    selected_indices.update(frame_index(seconds, fps) for seconds in CONTACT_TIMES)
    selected_indices.update(index for window in windows for index in window[2:])

    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        raise RuntimeError(f"OpenCV could not open {relative_path(path)}")

    frames: dict[int, np.ndarray] = {}
    decoded_count = 0
    dimensions: tuple[int, int] | None = None
    dimensions_consistent = True
    last_frame: np.ndarray | None = None
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        current_dimensions = (frame.shape[1], frame.shape[0])
        if dimensions is None:
            dimensions = current_dimensions
        elif current_dimensions != dimensions:
            dimensions_consistent = False
        if decoded_count in selected_indices:
            frames[decoded_count] = frame.copy()
        last_frame = frame.copy()
        decoded_count += 1
    capture.release()

    if decoded_count == 0 or last_frame is None:
        raise RuntimeError(f"OpenCV decoded no frames from {relative_path(path)}")
    missing = sorted(index for index in selected_indices if index >= decoded_count)
    if missing:
        raise RuntimeError(
            f"{relative_path(path)} ended before required frame indices {missing}"
        )
    return frames, last_frame, decoded_count, dimensions_consistent


def pixel_difference(first: np.ndarray, second: np.ndarray) -> np.ndarray:
    return np.mean(
        np.abs(first.astype(np.int16) - second.astype(np.int16)),
        axis=2,
    )


def changed_percent(
    difference: np.ndarray,
    mask: np.ndarray,
    threshold: float,
) -> float:
    pixel_count = int(np.count_nonzero(mask))
    if pixel_count == 0:
        return 0.0
    return float(np.mean(difference[mask] >= threshold) * 100.0)


def seed_connected_component(candidate: np.ndarray, seed: np.ndarray) -> np.ndarray:
    component_count, labels = cv2.connectedComponents(candidate.astype(np.uint8), 8)
    if component_count <= 1:
        raise RuntimeError("poster-derived calf segmentation produced no component")
    overlaps = [
        int(np.count_nonzero(seed & (labels == label)))
        for label in range(1, component_count)
    ]
    best_label = int(np.argmax(overlaps)) + 1
    if overlaps[best_label - 1] == 0:
        raise RuntimeError("poster-derived calf segmentation lost its held-out seed")
    return labels == best_label


def poster_derived_calf(
    poster: np.ndarray,
    rendition: EvidenceRendition,
) -> tuple[np.ndarray, dict[str, np.ndarray], dict[str, float | int | str]]:
    """Segment the real calf from poster pixels without the production matte.

    A small hand-traced interior seed supplies indisputable subject pixels.
    Lab colour likelihood initializes GrabCut, whose graph cut follows the
    poster's visible colour/edge boundary inside a broad search window. Only
    the seed-connected component survives. No generator mask or outline is
    imported, copied, rasterized, or compared during this operation.
    """

    width, height = rendition.width, rendition.height
    seed_polygons = PORTRAIT_CALF_SEED if rendition.portrait else LANDSCAPE_CALF_SEED
    evaluation_polygons = (
        PORTRAIT_CALF_EVALUATION
        if rendition.portrait
        else LANDSCAPE_CALF_EVALUATION
    )
    seed = mask_from_polygons(width, height, seed_polygons)
    evaluation = mask_from_polygons(width, height, evaluation_polygons)
    search_radius = max(
        20,
        round(min(width, height) * CALF_SEARCH_DILATION_FRACTION),
    )
    search = cv2.dilate(
        seed.astype(np.uint8),
        cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE,
            (search_radius * 2 + 1, search_radius * 2 + 1),
        ),
    ).astype(bool) & evaluation

    lab = cv2.cvtColor(poster, cv2.COLOR_BGR2LAB).astype(np.float32)
    seed_pixels = lab[seed]
    median = np.median(seed_pixels, axis=0)
    absolute_deviation = np.abs(seed_pixels - median)
    scale = np.maximum(np.percentile(absolute_deviation, 85, axis=0), (12.0, 7.0, 7.0))
    colour_distance = np.sqrt(np.sum(((lab - median) / scale) ** 2, axis=2))
    probable_skin = (colour_distance <= 3.6) & search

    grabcut_mask = np.full((height, width), cv2.GC_BGD, dtype=np.uint8)
    grabcut_mask[search] = cv2.GC_PR_BGD
    grabcut_mask[probable_skin] = cv2.GC_PR_FGD
    grabcut_mask[seed] = cv2.GC_FGD
    background_model = np.zeros((1, 65), np.float64)
    foreground_model = np.zeros((1, 65), np.float64)
    cv2.grabCut(
        poster,
        grabcut_mask,
        None,
        background_model,
        foreground_model,
        7,
        cv2.GC_INIT_WITH_MASK,
    )
    foreground = (
        (grabcut_mask == cv2.GC_FGD) | (grabcut_mask == cv2.GC_PR_FGD)
    ) & search
    calf = seed_connected_component(foreground, seed)
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
    filled = np.zeros_like(calf, dtype=np.uint8)
    cv2.drawContours(filled, contours, -1, 1, cv2.FILLED)
    calf = filled.astype(bool) & search

    eroded = cv2.erode(
        calf.astype(np.uint8),
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)),
    ).astype(bool)
    boundary = calf & ~eroded & evaluation
    poster_edges = cv2.Canny(cv2.cvtColor(poster, cv2.COLOR_BGR2GRAY), 45, 120)
    nearby_edges = cv2.dilate(
        (poster_edges > 0).astype(np.uint8),
        cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)),
    ).astype(bool)
    edge_support = (
        float(np.mean(nearby_edges[boundary]) * 100.0)
        if np.count_nonzero(boundary)
        else 0.0
    )
    seed_coverage = float(np.mean(calf[seed]) * 100.0)
    metrics: dict[str, float | int | str] = {
        "method": (
            "poster Lab-colour likelihood -> GrabCut visible-edge fit -> "
            "held-out seed-connected component"
        ),
        "calf_pixel_count": int(np.count_nonzero(calf)),
        "seed_pixel_count": int(np.count_nonzero(seed)),
        "seed_corridor_radius_pixels": search_radius,
        "seed_coverage_percent": round(seed_coverage, 2),
        "evaluated_boundary_pixel_count": int(np.count_nonzero(boundary)),
        "boundary_edge_support_percent": round(edge_support, 2),
    }
    masks = {
        "search": search,
        "seed": seed,
        "evaluation": evaluation,
        "boundary": boundary,
    }
    return calf, masks, metrics


def build_masks(
    poster: np.ndarray,
    rendition: EvidenceRendition,
) -> tuple[
    dict[str, np.ndarray],
    np.ndarray,
    np.ndarray,
    dict[str, np.ndarray],
    dict[str, np.ndarray],
    dict[str, float | int | str],
]:
    width, height = rendition.width, rendition.height
    region_polygons = PORTRAIT_REGIONS if rendition.portrait else LANDSCAPE_REGIONS
    floor_polygons = PORTRAIT_FLOOR if rendition.portrait else LANDSCAPE_FLOOR

    regions = {
        name: mask_from_polygons(width, height, polygons)
        for name, polygons in region_polygons.items()
    }
    calf, calf_masks, segmentation_metrics = poster_derived_calf(poster, rendition)
    outside_calf = (~calf).astype(np.uint8)
    distance_from_calf = cv2.distanceTransform(
        outside_calf,
        cv2.DIST_L2,
        cv2.DIST_MASK_PRECISE,
    )
    annulus = (
        (distance_from_calf >= ANNULUS_INNER_PIXELS)
        & (distance_from_calf <= ANNULUS_OUTER_PIXELS)
        & calf_masks["evaluation"]
    )
    free_floor = mask_from_polygons(width, height, floor_polygons)
    free_zone_masks = {
        "independent_far_floor": free_floor,
    }
    evidence_masks = {
        **calf_masks,
        "actual_calf": calf,
    }
    segmentation_metrics["annulus_pixel_count"] = int(np.count_nonzero(annulus))
    segmentation_metrics["annulus_subject_overlap_percent"] = round(
        float(np.mean(calf[annulus]) * 100.0) if np.count_nonzero(annulus) else 0.0,
        2,
    )
    return (
        regions,
        free_floor,
        annulus,
        free_zone_masks,
        evidence_masks,
        segmentation_metrics,
    )


def add_label(frame: np.ndarray, label: str, width: int, height: int) -> np.ndarray:
    card = cv2.resize(frame, (width, height), interpolation=cv2.INTER_AREA)
    cv2.rectangle(card, (0, 0), (width, 34), (8, 8, 10), -1)
    cv2.putText(
        card,
        label,
        (10, 23),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.40,
        (245, 245, 245),
        1,
        cv2.LINE_AA,
    )
    return card


def write_evidence(
    rendition: EvidenceRendition,
    frames: dict[int, np.ndarray],
    fps: float,
    free_floor: np.ndarray,
    annulus: np.ndarray,
    calf_masks: dict[str, np.ndarray],
) -> list[Path]:
    card_width = 300
    card_height = round(card_width * rendition.height / rendition.width)
    contact_frames = [frames[frame_index(seconds, fps)] for seconds in CONTACT_TIMES]
    cards = [
        add_label(frame, label, card_width, card_height)
        for frame, label in zip(contact_frames, LABELS, strict=True)
    ]
    contact_sheet = np.vstack((np.hstack(cards[:4]), np.hstack(cards[4:])))
    contact_path = OUTPUT / f"hero-motion-proof-{rendition.name}-contact-sheet.jpg"
    if not cv2.imwrite(
        str(contact_path),
        contact_sheet,
        [cv2.IMWRITE_JPEG_QUALITY, 95],
    ):
        raise RuntimeError(f"Unable to write {relative_path(contact_path)}")

    overlay = frames[0].copy()
    overlay[free_floor] = (
        overlay[free_floor].astype(np.float32) * 0.45
        + np.array((70, 220, 90), dtype=np.float32) * 0.55
    ).astype(np.uint8)
    actual_calf = calf_masks["actual_calf"]
    overlay[actual_calf] = (
        overlay[actual_calf].astype(np.float32) * 0.50
        + np.array((255, 180, 30), dtype=np.float32) * 0.50
    ).astype(np.uint8)
    overlay[annulus] = (
        overlay[annulus].astype(np.float32) * 0.35
        + np.array((230, 80, 220), dtype=np.float32) * 0.65
    ).astype(np.uint8)
    for name, color in (
        ("search", (255, 255, 255)),
        ("evaluation", (150, 150, 150)),
        ("seed", (30, 220, 255)),
        ("boundary", (0, 255, 255)),
    ):
        contours, _ = cv2.findContours(
            calf_masks[name].astype(np.uint8),
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE,
        )
        cv2.drawContours(overlay, contours, -1, color, 2, cv2.LINE_AA)
    cv2.putText(
        overlay,
        "CYAN: POSTER-DERIVED CALF | YELLOW: REAL EDGE | MAGENTA: 4-20 PX ANNULUS",
        (18, 34),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.56,
        (245, 245, 245),
        2,
        cv2.LINE_AA,
    )
    mask_path = OUTPUT / f"hero-motion-proof-{rendition.name}-evaluation-masks.jpg"
    if not cv2.imwrite(str(mask_path), overlay, [cv2.IMWRITE_JPEG_QUALITY, 95]):
        raise RuntimeError(f"Unable to write {relative_path(mask_path)}")
    return [contact_path, mask_path]


def build_rendition_proof(
    rendition: EvidenceRendition,
    expected_video_hash: str,
    failures: list[str],
) -> tuple[dict[str, object], list[Path]]:
    path = video_path(rendition)
    poster_path = IMAGES / rendition.poster
    poster = cv2.imread(str(poster_path), cv2.IMREAD_COLOR)
    if poster is None:
        raise RuntimeError(f"Unable to read {relative_path(poster_path)}")
    require(
        poster.shape[:2] == (rendition.height, rendition.width),
        failures,
        rendition,
        f"poster dimensions are {poster.shape[1]}x{poster.shape[0]}",
    )

    probe = ffprobe(path)
    streams = probe.get("streams", [])
    video_streams = [stream for stream in streams if stream.get("codec_type") == "video"]
    audio_streams = [stream for stream in streams if stream.get("codec_type") == "audio"]
    if not video_streams:
        raise RuntimeError(f"ffprobe found no video stream in {relative_path(path)}")
    stream = video_streams[0]
    fps = rate_as_float(stream.get("avg_frame_rate") or stream.get("r_frame_rate"))
    duration = float(stream.get("duration") or probe["format"]["duration"])
    probed_frame_count = int(stream.get("nb_frames") or round(duration * fps))
    payload_bytes = path.stat().st_size
    atoms = top_level_atoms(path)
    atom_positions = {atom["type"]: int(atom["offset"]) for atom in atoms}
    moov_offset = atom_positions.get("moov", -1)
    mdat_offset = atom_positions.get("mdat", -1)
    fast_start = moov_offset >= 0 and mdat_offset >= 0 and moov_offset < mdat_offset

    require(len(video_streams) == 1, failures, rendition, "must contain one video stream")
    require(not audio_streams, failures, rendition, "must be silent (audio stream found)")
    require(stream.get("codec_name") == "h264", failures, rendition, "codec is not H.264")
    require(
        (int(stream.get("width", 0)), int(stream.get("height", 0)))
        == (rendition.width, rendition.height),
        failures,
        rendition,
        "encoded dimensions do not match the exact rendition",
    )
    require(abs(fps - EXPECTED_FPS) <= 0.01, failures, rendition, f"fps is {fps:.6f}")
    require(
        abs(duration - EXPECTED_DURATION_SECONDS) <= (1.0 / EXPECTED_FPS),
        failures,
        rendition,
        f"duration is {duration:.6f}s",
    )
    require(
        probed_frame_count == EXPECTED_FRAME_COUNT,
        failures,
        rendition,
        f"ffprobe frame count is {probed_frame_count}",
    )
    require(
        MIN_PAYLOAD_BYTES < payload_bytes < MAX_PAYLOAD_BYTES,
        failures,
        rendition,
        f"payload is {payload_bytes} bytes (must be >128 KiB and <9 MiB)",
    )
    require(fast_start, failures, rendition, "moov atom is not before mdat")

    frames, last_frame, decoded_count, dimensions_consistent = decode_all_frames(path, fps)
    baseline = frames[0]
    require(
        baseline.shape[:2] == (rendition.height, rendition.width),
        failures,
        rendition,
        "decoded dimensions do not match the exact rendition",
    )
    require(
        dimensions_consistent,
        failures,
        rendition,
        "decoded frame dimensions changed within the stream",
    )
    require(
        decoded_count == EXPECTED_FRAME_COUNT == probed_frame_count,
        failures,
        rendition,
        f"decoded {decoded_count} frames, expected {EXPECTED_FRAME_COUNT}",
    )

    (
        regions,
        free_floor,
        annulus,
        free_zone_masks,
        calf_masks,
        calf_segmentation,
    ) = build_masks(poster, rendition)
    require(
        int(np.count_nonzero(free_floor)) >= 1000,
        failures,
        rendition,
        "held-out free-floor mask is unexpectedly small",
    )
    require(
        int(np.count_nonzero(annulus)) >= 1000,
        failures,
        rendition,
        "true 4-20px adjacent annulus is unexpectedly small",
    )
    require(
        int(calf_segmentation["calf_pixel_count"]) >= 1000,
        failures,
        rendition,
        "poster-derived actual-calf mask is unexpectedly small",
    )
    require(
        float(calf_segmentation["seed_coverage_percent"]) >= 99.5,
        failures,
        rendition,
        "poster-derived actual-calf mask does not retain its conservative seed",
    )
    require(
        int(calf_segmentation["evaluated_boundary_pixel_count"]) >= 100,
        failures,
        rendition,
        "poster-derived actual-calf boundary is unexpectedly small",
    )
    require(
        float(calf_segmentation["boundary_edge_support_percent"]) >= 10.0,
        failures,
        rendition,
        (
            "poster-derived actual-calf boundary has <10% support from "
            "visible poster edges"
        ),
    )
    require(
        float(calf_segmentation["annulus_subject_overlap_percent"]) == 0.0,
        failures,
        rendition,
        "adjacent annulus overlaps the poster-derived actual calf",
    )

    onset_samples: list[dict[str, float | int]] = []
    onset_seconds: float | None = None
    onset_last_index = int(np.floor(ONSET_DEADLINE_SECONDS * fps + 1e-9))
    for index in range(1, onset_last_index + 1):
        coverage = changed_percent(
            pixel_difference(frames[index], baseline),
            free_floor,
            COVERAGE_PIXEL_DELTA,
        )
        onset_samples.append(
            {
                "frame_index": index,
                "time_seconds": round(index / fps, 3),
                "free_floor_coverage_percent": round(coverage, 2),
            }
        )
        if onset_seconds is None and coverage >= ONSET_MIN_COVERAGE_PERCENT:
            onset_seconds = index / fps
    require(
        onset_seconds is not None and onset_seconds <= ONSET_DEADLINE_SECONDS,
        failures,
        rendition,
        (
            f"motion onset was not detected by {ONSET_DEADLINE_SECONDS:.2f}s "
            f"at {ONSET_MIN_COVERAGE_PERCENT:.1f}% free-floor coverage"
        ),
    )

    at_2s_difference = pixel_difference(
        frames[frame_index(2.0, fps)],
        baseline,
    )
    coverage_at_2s = changed_percent(
        at_2s_difference,
        free_floor,
        COVERAGE_PIXEL_DELTA,
    )
    zone_coverage_at_2s = {
        name: round(
            changed_percent(at_2s_difference, mask, COVERAGE_PIXEL_DELTA),
            2,
        )
        for name, mask in free_zone_masks.items()
    }
    require(
        coverage_at_2s >= FLOOR_COVERAGE_AT_2S_MIN_PERCENT,
        failures,
        rendition,
        (
            f"free-floor coverage at 2.0s is {coverage_at_2s:.2f}% "
            f"(< {FLOOR_COVERAGE_AT_2S_MIN_PERCENT:.1f}%)"
        ),
    )

    window_metrics: list[dict[str, float | int]] = []
    for start_seconds, end_seconds, start_index, end_index in hold_windows(fps):
        start_difference = pixel_difference(frames[start_index], baseline)
        temporal_difference = pixel_difference(frames[end_index], frames[start_index])
        free_coverage = changed_percent(
            start_difference,
            free_floor,
            COVERAGE_PIXEL_DELTA,
        )
        annulus_coverage = changed_percent(
            start_difference,
            annulus,
            COVERAGE_PIXEL_DELTA,
        )
        free_motion = changed_percent(
            temporal_difference,
            free_floor,
            TEMPORAL_PIXEL_DELTA,
        )
        annulus_motion = changed_percent(
            temporal_difference,
            annulus,
            TEMPORAL_PIXEL_DELTA,
        )
        window_metrics.append(
            {
                "start_seconds": start_seconds,
                "end_seconds": end_seconds,
                "start_frame_index": start_index,
                "end_frame_index": end_index,
                "free_floor_coverage_percent": round(free_coverage, 2),
                "free_floor_motion_percent": round(free_motion, 2),
                "adjacent_annulus_coverage_percent": round(annulus_coverage, 2),
                "adjacent_annulus_motion_percent": round(annulus_motion, 2),
            }
        )
        for label, value in (
            ("free-floor coverage", free_coverage),
            ("free-floor temporal motion", free_motion),
            ("adjacent-annulus coverage", annulus_coverage),
            ("adjacent-annulus temporal motion", annulus_motion),
        ):
            require(
                value >= HOLD_MIN_PERCENT,
                failures,
                rendition,
                (
                    f"{label} is {value:.2f}% in {start_seconds:.1f}-"
                    f"{end_seconds:.1f}s window (< {HOLD_MIN_PERCENT:.1f}%)"
                ),
            )

    first_vs_poster = pixel_difference(baseline, poster)
    loop_difference = pixel_difference(last_frame, baseline)
    first_vs_poster_mean = float(np.mean(first_vs_poster))
    first_vs_poster_p95 = float(np.percentile(first_vs_poster, 95))
    loop_mean = float(np.mean(loop_difference))
    loop_p95 = float(np.percentile(loop_difference, 95))
    require(
        first_vs_poster_mean <= POSTER_MEAN_DELTA_MAX,
        failures,
        rendition,
        f"decoded first-frame/poster mean delta is {first_vs_poster_mean:.3f}",
    )
    require(
        first_vs_poster_p95 <= POSTER_P95_DELTA_MAX,
        failures,
        rendition,
        f"decoded first-frame/poster p95 delta is {first_vs_poster_p95:.3f}",
    )
    require(
        loop_mean <= LOOP_MEAN_DELTA_MAX,
        failures,
        rendition,
        f"loop mean delta is {loop_mean:.3f}",
    )
    require(
        loop_p95 <= LOOP_P95_DELTA_MAX,
        failures,
        rendition,
        f"loop p95 delta is {loop_p95:.3f}",
    )

    subject_indices = sorted({index for window in hold_windows(fps) for index in window[2:]})
    subject_metrics: dict[str, dict[str, float]] = {}
    for name, mask in regions.items():
        codec_difference = first_vs_poster[mask]
        codec_mean = float(np.mean(codec_difference))
        codec_p95 = float(np.percentile(codec_difference, 95))
        mean_limit = min(3.0, max(2.0, codec_mean * 1.5))
        p95_limit = min(8.0, max(5.0, codec_p95 * 1.5))
        hold_means: list[float] = []
        hold_p95: list[float] = []
        for index in subject_indices:
            difference = pixel_difference(frames[index], baseline)[mask]
            hold_means.append(float(np.mean(difference)))
            hold_p95.append(float(np.percentile(difference, 95)))
        max_mean = max(hold_means)
        max_p95 = max(hold_p95)
        require(
            max_mean <= mean_limit,
            failures,
            rendition,
            (
                f"{name} subject mean contamination {max_mean:.3f} "
                f"exceeds codec-scale limit {mean_limit:.3f}"
            ),
        )
        require(
            max_p95 <= p95_limit,
            failures,
            rendition,
            (
                f"{name} subject p95 contamination {max_p95:.3f} "
                f"exceeds codec-scale limit {p95_limit:.3f}"
            ),
        )
        subject_metrics[name] = {
            "codec_baseline_mean_delta": round(codec_mean, 3),
            "codec_baseline_p95_delta": round(codec_p95, 3),
            "mean_delta_limit": round(mean_limit, 3),
            "p95_delta_limit": round(p95_limit, 3),
            "max_hold_mean_delta": round(max_mean, 3),
            "max_hold_p95_delta": round(max_p95, 3),
        }

    evidence = write_evidence(
        rendition,
        frames,
        fps,
        free_floor,
        annulus,
        calf_masks,
    )
    ending_video_hash = sha256(path)
    require(
        ending_video_hash == expected_video_hash,
        failures,
        rendition,
        "video bytes changed while the proof gate was decoding them",
    )

    metrics: dict[str, object] = {
        "name": rendition.name,
        "video_path": relative_path(path),
        "poster_path": relative_path(poster_path),
        "media": {
            "codec": stream.get("codec_name"),
            "width": int(stream.get("width", 0)),
            "height": int(stream.get("height", 0)),
            "fps": round(fps, 6),
            "duration_seconds": round(duration, 6),
            "probed_frame_count": probed_frame_count,
            "decoded_frame_count": decoded_count,
            "audio_stream_count": len(audio_streams),
            "payload_bytes": payload_bytes,
            "top_level_atoms": atoms,
            "fast_start": fast_start,
        },
        "masks": {
            "free_floor_pixel_count": int(np.count_nonzero(free_floor)),
            "adjacent_annulus_pixel_count": int(np.count_nonzero(annulus)),
            "adjacent_annulus_inner_pixels": ANNULUS_INNER_PIXELS,
            "adjacent_annulus_outer_pixels": ANNULUS_OUTER_PIXELS,
            "method": (
                "poster-derived actual calf plus OpenCV Euclidean distance transform; "
                "no production outline or matte"
            ),
            "actual_calf_segmentation": calf_segmentation,
        },
        "onset": {
            "detected_seconds": None if onset_seconds is None else round(onset_seconds, 3),
            "samples": onset_samples,
        },
        "free_floor_coverage_at_2s_percent": round(coverage_at_2s, 2),
        "free_floor_zone_coverage_at_2s_percent": zone_coverage_at_2s,
        "hold_windows": window_metrics,
        "subject_contamination": subject_metrics,
        "poster_fidelity": {
            "mean_delta": round(first_vs_poster_mean, 3),
            "p95_delta": round(first_vs_poster_p95, 3),
        },
        "loop_closure": {
            "mean_delta": round(loop_mean, 3),
            "p95_delta": round(loop_p95, 3),
        },
    }
    return metrics, evidence


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []
    expected_evidence_names = {
        f"hero-motion-proof-{rendition.name}-{suffix}.jpg"
        for rendition in RENDITIONS
        for suffix in ("contact-sheet", "evaluation-masks")
    }
    allowed_output_names = expected_evidence_names | {MANIFEST.name}
    def output_entries() -> set[str]:
        return {
            path.relative_to(OUTPUT).as_posix()
            for path in OUTPUT.rglob("*")
        }

    unexpected_entries = sorted(output_entries() - allowed_output_names)
    if unexpected_entries:
        failures.append(
            "canonical proof directory contains undeclared entries: "
            + ", ".join(unexpected_entries)
        )
    exact_video_paths = [video_path(rendition) for rendition in RENDITIONS]
    starting_video_records = [file_record(path) for path in exact_video_paths]
    starting_hashes = {
        record["path"]: str(record["sha256"])
        for record in starting_video_records
    }

    rendition_metrics: list[dict[str, object]] = []
    retained_evidence_paths: list[Path] = []
    for rendition in RENDITIONS:
        path = video_path(rendition)
        try:
            metrics, evidence = build_rendition_proof(
                rendition,
                starting_hashes[relative_path(path)],
                failures,
            )
            rendition_metrics.append(metrics)
            retained_evidence_paths.extend(evidence)
        except Exception as error:  # A broken decoder/input must fail the gate cleanly.
            failures.append(f"{rendition.name}: {type(error).__name__}: {error}")
            rendition_metrics.append(
                {
                    "name": rendition.name,
                    "video_path": relative_path(path),
                    "error": f"{type(error).__name__}: {error}",
                }
            )

    ending_video_records = [file_record(path) for path in exact_video_paths]
    for before, after in zip(starting_video_records, ending_video_records, strict=True):
        if before["sha256"] != after["sha256"]:
            failures.append(
                f"{before['path']}: SHA256 changed during the complete four-video gate"
            )

    retained_evidence = [
        file_record(path)
        for path in sorted(retained_evidence_paths, key=relative_path)
    ]
    retained_names = {Path(str(record["path"])).name for record in retained_evidence}
    if retained_names != expected_evidence_names:
        failures.append(
            "canonical retained evidence set differs from its exact inventory: "
            f"missing={sorted(expected_evidence_names - retained_names)}, "
            f"unexpected={sorted(retained_names - expected_evidence_names)}"
        )
    payload: dict[str, object] = {
        "schema_version": 2,
        "status": "PASS" if not failures else "FAIL",
        "authority": (
            "This clean canonical-r2 directory must contain exactly this fixed-name "
            "manifest and the files enumerated in retained_evidence. Any undeclared "
            "entry makes the proof gate fail; artifacts in ancestor directories are "
            "outside this proof and remain untouched."
        ),
        "gate": {
            "command": "npm run test:hero-motion",
            "method": (
                "All frames of all four exact MP4s are decoded. The calf is recovered "
                "from retained-poster Lab pixels and visible edges using GrabCut plus "
                "a conservative held-out interior seed. The proof never imports or "
                "rasterizes the production generator outline."
            ),
            "exact_video_paths": [relative_path(path) for path in exact_video_paths],
            "thresholds": {
                "fps": EXPECTED_FPS,
                "duration_seconds": EXPECTED_DURATION_SECONDS,
                "frame_count": EXPECTED_FRAME_COUNT,
                "payload_bytes_exclusive": [MIN_PAYLOAD_BYTES, MAX_PAYLOAD_BYTES],
                "onset_deadline_seconds": ONSET_DEADLINE_SECONDS,
                "onset_min_free_floor_coverage_percent": ONSET_MIN_COVERAGE_PERCENT,
                "coverage_pixel_delta": COVERAGE_PIXEL_DELTA,
                "temporal_pixel_delta": TEMPORAL_PIXEL_DELTA,
                "free_floor_coverage_at_2s_min_percent": FLOOR_COVERAGE_AT_2S_MIN_PERCENT,
                "hold_window_start_seconds": HOLD_START_SECONDS,
                "hold_window_end_seconds": HOLD_END_SECONDS,
                "hold_window_seconds": HOLD_WINDOW_SECONDS,
                "hold_min_coverage_and_motion_percent": HOLD_MIN_PERCENT,
                "adjacent_annulus_pixels_inclusive": [
                    ANNULUS_INNER_PIXELS,
                    ANNULUS_OUTER_PIXELS,
                ],
                "loop_mean_delta_max": LOOP_MEAN_DELTA_MAX,
                "loop_p95_delta_max": LOOP_P95_DELTA_MAX,
                "poster_mean_delta_max": POSTER_MEAN_DELTA_MAX,
                "poster_p95_delta_max": POSTER_P95_DELTA_MAX,
                "subject_contamination": (
                    "Per ROI across every hold-window endpoint: mean <= clamp(2, "
                    "1.5x codec baseline, 3), p95 <= clamp(5, 1.5x codec baseline, 8)."
                ),
            },
        },
        "inputs": {
            "videos": starting_video_records,
            "source_posters": [
                file_record(IMAGES / rendition.poster) for rendition in RENDITIONS
            ],
            "generator": file_record(GENERATOR),
            "proof_script": file_record(PROOF_SCRIPT),
            "test": file_record(PROOF_TEST),
        },
        "retained_evidence": retained_evidence,
        "canonical_directory_inventory": sorted(allowed_output_names),
        "renditions": rendition_metrics,
        "failures": failures,
    }
    payload["manifest_hash"] = {
        "algorithm": "sha256",
        "canonical_payload_sha256": canonical_payload_sha256(payload),
        "covers": "canonical JSON of this manifest with manifest_hash omitted",
    }
    MANIFEST.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    final_entries = output_entries()
    if final_entries != allowed_output_names:
        failures.append(
            "canonical proof directory final inventory mismatch: "
            f"missing={sorted(allowed_output_names - final_entries)}, "
            f"unexpected={sorted(final_entries - allowed_output_names)}"
        )
        payload["status"] = "FAIL"
        payload["failures"] = failures
        payload.pop("manifest_hash", None)
        payload["manifest_hash"] = {
            "algorithm": "sha256",
            "canonical_payload_sha256": canonical_payload_sha256(payload),
            "covers": "canonical JSON of this manifest with manifest_hash omitted",
        }
        MANIFEST.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    status = str(payload["status"])
    digest = payload["manifest_hash"]["canonical_payload_sha256"]
    print(
        f"{status} hero-motion proof: decoded {len(rendition_metrics)}/4 exact MP4s; "
        f"manifest={relative_path(MANIFEST)}; sha256={digest}"
    )
    if failures:
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
