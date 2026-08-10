import assert from "node:assert/strict";
import test from "node:test";
import {
  isHeroVideoReady,
  nextLazyMountState,
  nextHeroPlaybackIntentAfterRejection,
  shouldAnimateMetallicField,
  shouldAttachHeroVideoSource,
  shouldPlayHeroVideo,
} from "../lib/motion-policy.ts";
import { rewindHeroVideoIfEnded } from "../lib/hero-video.ts";

const visible = {
  reducedMotion: false,
  inViewport: true,
  pageVisible: true,
};

test("hero source attaches only when motion and data preferences allow it", () => {
  assert.equal(
    shouldAttachHeroVideoSource({
      sourceEnabled: true,
      reducedMotion: false,
      saveData: false,
    }),
    true,
  );
  assert.equal(
    shouldAttachHeroVideoSource({
      sourceEnabled: false,
      reducedMotion: false,
      saveData: false,
    }),
    false,
  );
  assert.equal(
    shouldAttachHeroVideoSource({
      sourceEnabled: true,
      reducedMotion: true,
      saveData: false,
    }),
    false,
  );
  assert.equal(
    shouldAttachHeroVideoSource({
      sourceEnabled: true,
      reducedMotion: false,
      saveData: true,
    }),
    false,
  );
});

test("hero video plays only when intent, asset and visibility agree", () => {
  assert.equal(
    shouldPlayHeroVideo({
      ...visible,
      playbackIntent: true,
      assetReady: true,
    }),
    true,
  );
});

test("hero video remains paused before its responsive source is ready", () => {
  assert.equal(
    shouldPlayHeroVideo({
      ...visible,
      playbackIntent: true,
      assetReady: false,
    }),
    false,
  );
});

test("slow media preserves autoplay intent until canplay retries it", () => {
  let playbackIntent = true;
  const loadingReadyState = 0;

  assert.equal(isHeroVideoReady(loadingReadyState), false);
  assert.equal(
    shouldPlayHeroVideo({
      ...visible,
      playbackIntent,
      assetReady: isHeroVideoReady(loadingReadyState),
    }),
    false,
  );

  playbackIntent = nextHeroPlaybackIntentAfterRejection({
    currentIntent: playbackIntent,
    errorName: "NotAllowedError",
    readyState: loadingReadyState,
  });
  assert.equal(playbackIntent, true, "an early rejection must stay retryable");

  const canPlayReadyState = 3;
  assert.equal(isHeroVideoReady(canPlayReadyState), true);
  assert.equal(
    shouldPlayHeroVideo({
      ...visible,
      playbackIntent,
      assetReady: isHeroVideoReady(canPlayReadyState),
    }),
    true,
    "canplay must trigger the single event-driven retry",
  );
});

test("a permanent autoplay policy refusal becomes a manual play affordance", () => {
  assert.equal(
    nextHeroPlaybackIntentAfterRejection({
      currentIntent: true,
      errorName: "NotAllowedError",
      readyState: 4,
    }),
    false,
  );
  assert.equal(
    nextHeroPlaybackIntentAfterRejection({
      currentIntent: true,
      errorName: "AbortError",
      readyState: 4,
    }),
    true,
  );
});

test("an ended hero rewinds exactly once before direct user replay", () => {
  const endedVideo = { ended: true, currentTime: 12.4 };
  assert.equal(rewindHeroVideoIfEnded(endedVideo), true);
  assert.equal(endedVideo.currentTime, 0);

  const pausedVideo = { ended: false, currentTime: 6.2 };
  assert.equal(rewindHeroVideoIfEnded(pausedVideo), false);
  assert.equal(pausedVideo.currentTime, 6.2);
});

test("hero video respects explicit pause and reduced-motion", () => {
  assert.equal(
    shouldPlayHeroVideo({
      ...visible,
      playbackIntent: false,
      assetReady: true,
    }),
    false,
  );
  assert.equal(
    shouldPlayHeroVideo({
      ...visible,
      reducedMotion: true,
      playbackIntent: true,
      assetReady: true,
    }),
    false,
  );
});

test("hero video pauses outside the viewport and in hidden tabs", () => {
  assert.equal(
    shouldPlayHeroVideo({
      ...visible,
      inViewport: false,
      playbackIntent: true,
      assetReady: true,
    }),
    false,
  );
  assert.equal(
    shouldPlayHeroVideo({
      ...visible,
      pageVisible: false,
      playbackIntent: true,
      assetReady: true,
    }),
    false,
  );
});

test("still metallic fields never schedule animation frames", () => {
  assert.equal(
    shouldAnimateMetallicField({ ...visible, motion: "still" }),
    false,
  );
});

test("animated metallic fields require viewport and page visibility", () => {
  assert.equal(
    shouldAnimateMetallicField({ ...visible, motion: "slow" }),
    true,
  );
  assert.equal(
    shouldAnimateMetallicField({
      ...visible,
      inViewport: false,
      motion: "normal",
    }),
    false,
  );
  assert.equal(
    shouldAnimateMetallicField({
      ...visible,
      pageVisible: false,
      motion: "normal",
    }),
    false,
  );
});

test("reduced-motion freezes every metallic animation", () => {
  assert.equal(
    shouldAnimateMetallicField({
      ...visible,
      reducedMotion: true,
      motion: "slow",
    }),
    false,
  );
});

test("lazy WebGL mounting starts on first intersection and stays mounted", () => {
  assert.equal(nextLazyMountState(false, false), false);
  assert.equal(nextLazyMountState(false, true), true);
  assert.equal(nextLazyMountState(true, false), true);
});
