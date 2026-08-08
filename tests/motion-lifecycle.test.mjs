import assert from "node:assert/strict";
import test from "node:test";
import {
  nextLazyMountState,
  shouldAnimateMetallicField,
  shouldPlayHeroVideo,
} from "../lib/motion-policy.ts";

const visible = {
  reducedMotion: false,
  inViewport: true,
  pageVisible: true,
};

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
