export const HERO_FUSION_VERSION = "v4";
export const HERO_PHOTO_ASPECT = 1464 / 2200;

export type ContainRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function metalAmountFromLoop(loopPhase: number): number {
  if (loopPhase < 0.32) return 0;
  if (loopPhase < 0.5) return smoothstep(0.32, 0.5, loopPhase) * 0.35;
  if (loopPhase < 0.58) return 0.35;
  if (loopPhase < 0.76) return 0.35 * (1 - smoothstep(0.58, 0.76, loopPhase));
  return 0;
}

/** Screen-space rect where the full photo is visible (object-fit: contain). */
export function containRect(
  screenAspect: number,
  imageAspect: number,
): ContainRect {
  if (screenAspect > imageAspect) {
    const width = imageAspect / screenAspect;
    const left = (1 - width) / 2;
    return { left, right: 1 - left, top: 0, bottom: 1, width, height: 1 };
  }

  const height = screenAspect / imageAspect;
  const top = (1 - height) / 2;
  return { left: 0, right: 1, top, bottom: 1 - top, width: 1, height };
}

export function containPhotoUV(
  screenUV: { x: number; y: number },
  imageAspect: number,
  screenAspect: number,
): { x: number; y: number; inBounds: boolean } {
  const rect = containRect(screenAspect, imageAspect);
  const x = (screenUV.x - rect.left) / rect.width;
  const y = (screenUV.y - rect.top) / rect.height;
  return {
    x,
    y,
    inBounds: x >= 0 && x <= 1 && y >= 0 && y <= 1,
  };
}

/** Distance outside the photo rect, 0 when inside. */
export function outsidePhotoDistance(
  screenUV: { x: number; y: number },
  rect: ContainRect,
): number {
  if (screenUV.x < rect.left) {
    return (rect.left - screenUV.x) / Math.max(rect.left, 0.001);
  }
  if (screenUV.x > rect.right) {
    return (screenUV.x - rect.right) / Math.max(1 - rect.right, 0.001);
  }
  if (screenUV.y < rect.top) {
    return (rect.top - screenUV.y) / Math.max(rect.top, 0.001);
  }
  if (screenUV.y > rect.bottom) {
    return (screenUV.y - rect.bottom) / Math.max(1 - rect.bottom, 0.001);
  }
  return 0;
}

/**
 * Soft fusion: photo intact in center, delicate violet→metal on side pillars
 * and a whisper of metal on photo background near horizontal edges.
 */
export function subtleFusionMix(
  screenUV: { x: number; y: number },
  rect: ContainRect,
  subjectAlpha: number,
  loopMetal: number,
): number {
  const outside = outsidePhotoDistance(screenUV, rect);
  const pillarMetal = smoothstep(0.02, 0.55, outside) * 0.68;

  const halfWidth = rect.width * 0.5;
  const distFromCenterX = Math.abs(screenUV.x - 0.5) / halfWidth;
  const insideEdgeBleed =
    outside === 0
      ? smoothstep(0.42, 0.92, distFromCenterX) *
        smoothstep(0.08, 0.52, 1 - subjectAlpha) *
        0.1
      : 0;

  const subjectShield = smoothstep(0.04, 0.38, subjectAlpha);
  let mix = pillarMetal + insideEdgeBleed;
  mix += loopMetal * smoothstep(0.12, 0.58, 1 - subjectAlpha) * 0.06;
  mix = Math.min(1, Math.max(0, mix));
  return mix * (1 - subjectShield);
}

export function juryGradientSanity(
  screenUV: { x: number; y: number },
  screenAspect: number,
  subjectAlpha: number,
): {
  centerPhotoDominant: boolean;
  edgeMetalDominant: boolean;
  fullPhotoVisible: boolean;
} {
  const rect = containRect(screenAspect, HERO_PHOTO_ASPECT);
  const centerMix = subtleFusionMix(screenUV, rect, subjectAlpha, 0);
  const edgeMix = subtleFusionMix({ x: 0.03, y: screenUV.y }, rect, subjectAlpha, 0);
  const photo = containPhotoUV({ x: 0.5, y: 0.5 }, HERO_PHOTO_ASPECT, screenAspect);

  return {
    centerPhotoDominant: centerMix < 0.08,
    edgeMetalDominant: edgeMix > 0.35,
    fullPhotoVisible: photo.inBounds,
  };
}
