export type MetallicFieldMotion = "normal" | "slow" | "still";

export type VisibilityConditions = {
  reducedMotion: boolean;
  inViewport: boolean;
  pageVisible: boolean;
};

export type HeroVideoSourceConditions = {
  sourceEnabled: boolean;
  reducedMotion: boolean;
  saveData: boolean;
};

export const HERO_VIDEO_CAN_PLAY_READY_STATE = 3;

export function isHeroVideoReady(readyState: number): boolean {
  return readyState >= HERO_VIDEO_CAN_PLAY_READY_STATE;
}

export function nextHeroPlaybackIntentAfterRejection({
  currentIntent,
  errorName,
  readyState,
}: {
  currentIntent: boolean;
  errorName: string | null;
  readyState: number;
}): boolean {
  if (!currentIntent) return false;
  return errorName === "AbortError" || !isHeroVideoReady(readyState);
}

export function shouldAttachHeroVideoSource({
  sourceEnabled,
  reducedMotion,
  saveData,
}: HeroVideoSourceConditions): boolean {
  return sourceEnabled && !reducedMotion && !saveData;
}

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
