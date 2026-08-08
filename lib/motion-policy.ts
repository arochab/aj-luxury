export type MetallicFieldMotion = "normal" | "slow" | "still";

export type VisibilityConditions = {
  reducedMotion: boolean;
  inViewport: boolean;
  pageVisible: boolean;
};

export function shouldPlayHeroVideo(
  conditions: VisibilityConditions & {
    playbackIntent: boolean;
    assetReady: boolean;
  },
): boolean {
  return (
    conditions.playbackIntent &&
    conditions.assetReady &&
    !conditions.reducedMotion &&
    conditions.inViewport &&
    conditions.pageVisible
  );
}

export function shouldAnimateMetallicField(
  conditions: VisibilityConditions & { motion: MetallicFieldMotion },
): boolean {
  return (
    conditions.motion !== "still" &&
    !conditions.reducedMotion &&
    conditions.inViewport &&
    conditions.pageVisible
  );
}

export function nextLazyMountState(
  alreadyMounted: boolean,
  inViewport: boolean,
): boolean {
  return alreadyMounted || inViewport;
}
