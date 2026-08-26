"""Extract and measure the approved hero's liquid-motion cycle."""

from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np

from build_hero_v4_motion import protection_matte


ROOT = Path(__file__).resolve().parents[1]
VIDEO = ROOT / "public" / "videos" / "aj-luxury-hero-v4-motion-portrait-720x934.mp4"
OUTPUT = ROOT / "artifacts" / "hero-motion-v2-proof"
TIMES = (0.0, 1.0, 3.0, 5.0, 6.5, 7.92)
LABELS = (
    "0.00 s - SOURCE",
    "1.00 s - APPARITION",
    "3.00 s - EXPANSION",
    "5.00 s - PLEIN CADRE",
    "6.50 s - MAINTIEN",
    "7.92 s - DISSOLUTION",
)


def read_frame(capture: cv2.VideoCapture, seconds: float) -> np.ndarray:
    capture.set(cv2.CAP_PROP_POS_MSEC, seconds * 1000.0)
    ok, frame = capture.read()
    if not ok:
        raise RuntimeError(f"Unable to decode {VIDEO} at {seconds:.2f}s")
    return frame


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    capture = cv2.VideoCapture(str(VIDEO))
    if not capture.isOpened():
        raise RuntimeError(f"Unable to open {VIDEO}")
    frames = [read_frame(capture, seconds) for seconds in TIMES]
    capture.release()

    height, width = frames[0].shape[:2]
    protect = protection_matte(width, height, True)
    protected = protect >= 0.86
    floor = np.zeros((height, width), dtype=bool)
    floor[round(height * 0.705) :, :] = True
    measurable_floor = floor & (protect <= 0.20)
    architecture = (~floor) & (protect <= 0.20)
    baseline = frames[0].astype(np.int16)

    cards: list[np.ndarray] = []
    floor_cards: list[np.ndarray] = []
    metrics: list[dict[str, float | str]] = []
    for index, (seconds, label, frame) in enumerate(zip(TIMES, LABELS, frames, strict=True)):
        difference = np.mean(np.abs(frame.astype(np.int16) - baseline), axis=2)
        metrics.append(
            {
                "time_seconds": seconds,
                "stage": label.split(" - ", 1)[1],
                "floor_changed_percent": round(
                    float(np.mean(difference[measurable_floor] >= 6.0) * 100.0),
                    2,
                ),
                "architecture_changed_percent": round(
                    float(np.mean(difference[architecture] >= 4.0) * 100.0),
                    2,
                ),
                "protected_subject_mean_delta": round(
                    float(np.mean(difference[protected])),
                    3,
                ),
            }
        )
        cv2.imwrite(str(OUTPUT / f"frame-{index + 1}.jpg"), frame, [cv2.IMWRITE_JPEG_QUALITY, 94])
        card = cv2.resize(frame, (360, 467), interpolation=cv2.INTER_AREA)
        cv2.rectangle(card, (0, 0), (360, 38), (8, 8, 10), -1)
        cv2.putText(
            card,
            label,
            (12, 25),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.44,
            (245, 245, 245),
            1,
            cv2.LINE_AA,
        )
        cards.append(card)

        floor_card = cv2.resize(
            frame[round(height * 0.64) :, :],
            (360, 170),
            interpolation=cv2.INTER_AREA,
        )
        cv2.rectangle(floor_card, (0, 0), (360, 30), (8, 8, 10), -1)
        cv2.putText(
            floor_card,
            label,
            (10, 21),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.39,
            (245, 245, 245),
            1,
            cv2.LINE_AA,
        )
        floor_cards.append(floor_card)

    sheet = np.vstack((np.hstack(cards[:3]), np.hstack(cards[3:])))
    cv2.imwrite(str(OUTPUT / "contact-sheet.jpg"), sheet, [cv2.IMWRITE_JPEG_QUALITY, 95])
    floor_sheet = np.vstack(
        (np.hstack(floor_cards[:3]), np.hstack(floor_cards[3:]))
    )
    cv2.imwrite(
        str(OUTPUT / "floor-contact-sheet.jpg"),
        floor_sheet,
        [cv2.IMWRITE_JPEG_QUALITY, 95],
    )
    (OUTPUT / "metrics.json").write_text(
        json.dumps({"video": VIDEO.name, "frames": metrics}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(metrics, ensure_ascii=False))


if __name__ == "__main__":
    main()
