"""Build deterministic identity overlays from the client-owned campaign photo.

The hero master is not edited. The two homographies were fitted from stable
garment/body keypoints shared by the approved campaign photo and the existing
hero renders. Only the interior facial regions are retained; the validated
master keeps its original hair and silhouette. Their alpha feather is
strictly inward so no source-background pixel can become visible around the
subjects after projection. No pixels are generated.
"""

from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/images/client/campaign-duo-lilas-seated.webp"
OUTPUT = ROOT / "public/images/client"

FACE_MATTES = [
    ((575, 470), (64, 105), -18),
    ((958, 385), (65, 108), 3),
]

RENDITIONS = {
    "landscape": {
        "size": (1920, 1080),
        "homography": np.array(
            [
                [4.73333436e-01, 8.04542576e-04, 5.91582682e02],
                [-4.18249494e-05, 4.81049338e-01, -3.93828517e01],
                [-2.60788628e-06, 1.52697335e-06, 1.0],
            ],
            dtype=np.float64,
        ),
    },
    "portrait": {
        "size": (720, 934),
        "homography": np.array(
            [
                [4.13482722e-01, 9.23393284e-05, 3.93957132e01],
                [3.03554834e-04, 4.18867273e-01, -3.63905752e01],
                [-1.94210543e-06, 1.90252173e-06, 1.0],
            ],
            dtype=np.float64,
        ),
    },
}


def build() -> None:
    source = cv2.imread(str(SOURCE), cv2.IMREAD_COLOR)
    if source is None:
        raise RuntimeError(f"Cannot read {SOURCE}")

    source_mask = np.zeros(source.shape[:2], dtype=np.uint8)
    for center, axes, angle in FACE_MATTES:
        cv2.ellipse(source_mask, center, axes, angle, 0, 360, 255, -1)

    # Feather only inside the retained subject. A Gaussian blur expands alpha
    # outside the matte and can reveal the campaign backdrop as a dark halo.
    # The distance transform keeps every exterior pixel fully transparent.
    inward_distance = cv2.distanceTransform(source_mask, cv2.DIST_L2, 5)
    source_alpha = np.clip(inward_distance / 14.0, 0.0, 1.0)
    source_alpha = np.rint(source_alpha * 255.0).astype(np.uint8)

    for name, rendition in RENDITIONS.items():
        width, height = rendition["size"]
        homography = rendition["homography"]
        projected = cv2.warpPerspective(
            source,
            homography,
            (width, height),
            flags=cv2.INTER_LANCZOS4,
            borderMode=cv2.BORDER_CONSTANT,
        )
        alpha = cv2.warpPerspective(
            source_alpha,
            homography,
            (width, height),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_CONSTANT,
        )
        # Keep fully transparent RGB black. This prevents texture filtering and
        # image-inspection tools from surfacing irrelevant warped source color.
        projected[alpha == 0] = 0
        blue, green, red = cv2.split(projected)
        overlay = cv2.merge((blue, green, red, alpha))
        target = OUTPUT / f"hero-identity-overlay-{name}-v1.png"
        if not cv2.imwrite(
            str(target),
            overlay,
            # PNG preserves the RGB value of fully transparent pixels. WebP
            # decoders are allowed to return arbitrary RGB when alpha is zero.
            [cv2.IMWRITE_PNG_COMPRESSION, 9],
        ):
            raise RuntimeError(f"Cannot write {target}")

        retained = cv2.imread(str(target), cv2.IMREAD_UNCHANGED)
        if retained is None or retained.shape[2] != 4:
            raise RuntimeError(f"Cannot verify {target}")
        transparent_rgb = retained[:, :, :3][retained[:, :, 3] == 0]
        if np.any(transparent_rgb):
            raise RuntimeError(f"Transparent RGB must remain black in {target}")


if __name__ == "__main__":
    build()
