import assert from "node:assert/strict";
import test from "node:test";
import {
  HERO_FUSION_VERSION,
  HERO_PHOTO_ASPECT,
  containPhotoUV,
  containRect,
  juryGradientSanity,
  metalAmountFromLoop,
  outsidePhotoDistance,
  subtleFusionMix,
  smoothstep,
} from "../lib/hero-fusion.ts";

test("hero fusion version is v4", () => {
  assert.equal(HERO_FUSION_VERSION, "v4");
});

test("contain keeps the full photo visible on wide screens", () => {
  const screenAspect = 16 / 9;
  const rect = containRect(screenAspect, HERO_PHOTO_ASPECT);
  const top = containPhotoUV({ x: 0.5, y: 0.02 }, HERO_PHOTO_ASPECT, screenAspect);
  const bottom = containPhotoUV({ x: 0.5, y: 0.98 }, HERO_PHOTO_ASPECT, screenAspect);

  assert.ok(rect.width < 1, "wide screens must letterbox left/right, not crop bodies");
  assert.equal(top.y, 0.02, "top maps to top of photo");
  assert.ok(bottom.y > 0.95, "bottom maps to bottom of photo — full bodies visible");
  assert.ok(top.y < bottom.y, "orientation must not be upside down");
});

test("contain maps heads above feet", () => {
  const screenAspect = 16 / 9;
  const head = containPhotoUV({ x: 0.5, y: 0.18 }, HERO_PHOTO_ASPECT, screenAspect);
  const feet = containPhotoUV({ x: 0.5, y: 0.82 }, HERO_PHOTO_ASPECT, screenAspect);

  assert.ok(head.y < feet.y, "heads must map above feet in photo space");
});

test("pillar zones sit outside the photo rect", () => {
  const screenAspect = 16 / 9;
  const rect = containRect(screenAspect, HERO_PHOTO_ASPECT);
  const leftPillar = outsidePhotoDistance({ x: 0.04, y: 0.5 }, rect);
  const center = outsidePhotoDistance({ x: 0.5, y: 0.5 }, rect);

  assert.ok(leftPillar > 0.2, "left pillar must be outside photo");
  assert.equal(center, 0, "center must be inside photo");
});

test("fusion is subtle at center and stronger on side pillars", () => {
  const screenAspect = 16 / 9;
  const rect = containRect(screenAspect, HERO_PHOTO_ASPECT);
  const subject = 0;
  const center = subtleFusionMix({ x: 0.5, y: 0.5 }, rect, subject, 0);
  const mid = subtleFusionMix({ x: rect.left + 0.02, y: 0.5 }, rect, subject, 0);
  const edge = subtleFusionMix({ x: 0.03, y: 0.5 }, rect, subject, 0);

  assert.ok(center < 0.06, `center must stay photo-dominant, got ${center}`);
  assert.ok(edge > mid, "edge must be more metallic than photo border");
  assert.ok(edge > 0.35, `pillar metal too weak: ${edge}`);
});

test("subjects stay untouched by metal fusion", () => {
  const screenAspect = 16 / 9;
  const rect = containRect(screenAspect, HERO_PHOTO_ASPECT);
  const centerSubject = subtleFusionMix({ x: 0.5, y: 0.5 }, rect, 0.94, 1);
  const edgeSubject = subtleFusionMix({ x: 0.9, y: 0.5 }, rect, 0.9, 1);

  assert.equal(centerSubject, 0);
  assert.equal(edgeSubject, 0);
});

test("loop metal stays subtle", () => {
  assert.equal(metalAmountFromLoop(0), 0);
  assert.ok(metalAmountFromLoop(0.5) <= 0.35);
});

test("jury sanity passes for desktop hero", () => {
  const verdict = juryGradientSanity({ x: 0.5, y: 0.5 }, 16 / 9, 0);
  assert.equal(verdict.centerPhotoDominant, true);
  assert.equal(verdict.fullPhotoVisible, true);
  const edge = juryGradientSanity({ x: 0.03, y: 0.5 }, 16 / 9, 0);
  assert.equal(edge.edgeMetalDominant, true);
});

test("smoothstep behaves monotonically", () => {
  const a = smoothstep(0.2, 0.8, 0.1);
  const b = smoothstep(0.2, 0.8, 0.5);
  const c = smoothstep(0.2, 0.8, 0.9);
  assert.ok(a < b && b < c);
});
