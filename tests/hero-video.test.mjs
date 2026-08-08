import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import {
  HERO_VIDEO_ASSETS,
  HERO_VIDEO_VERSION,
  selectHeroVideoAsset,
} from "../lib/hero-video.ts";

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

test("hero video asset selection is deterministic at every breakpoint", () => {
  assert.equal(HERO_VIDEO_VERSION, "v1");
  assert.equal(selectHeroVideoAsset(320), HERO_VIDEO_ASSETS.mobile);
  assert.equal(selectHeroVideoAsset(600), HERO_VIDEO_ASSETS.mobile);
  assert.equal(selectHeroVideoAsset(601), HERO_VIDEO_ASSETS.tablet);
  assert.equal(selectHeroVideoAsset(1199), HERO_VIDEO_ASSETS.tablet);
  assert.equal(selectHeroVideoAsset(1200), HERO_VIDEO_ASSETS.desktop);
  assert.equal(selectHeroVideoAsset(3840), HERO_VIDEO_ASSETS.desktop);
});

test("responsive MP4 variants exist, stay bounded and are fast-start files", async () => {
  const limits = {
    mobile: 2.5 * 1024 * 1024,
    tablet: 2.5 * 1024 * 1024,
    desktop: 5 * 1024 * 1024,
  };

  for (const [name, asset] of Object.entries(HERO_VIDEO_ASSETS)) {
    const path = projectFile(`public${asset.src}`);
    const info = await stat(path);
    assert.ok(info.size > 128 * 1024, `${name} video is unexpectedly small`);
    assert.ok(info.size <= limits[name], `${name} video exceeds its byte budget`);

    const bytes = await readFile(path);
    const ftyp = bytes.indexOf(Buffer.from("ftyp"));
    const moov = bytes.indexOf(Buffer.from("moov"));
    const mdat = bytes.indexOf(Buffer.from("mdat"));
    assert.ok(ftyp >= 0 && ftyp < 32, `${name} has no valid MP4 header`);
    assert.ok(moov > ftyp, `${name} has no moov atom`);
    assert.ok(mdat > moov, `${name} is not optimized for progressive start`);
  }
});

test("video posters are lightweight and available before playback", async () => {
  const posters = new Set(
    Object.values(HERO_VIDEO_ASSETS).map((asset) => asset.poster),
  );

  for (const poster of posters) {
    const info = await stat(projectFile(`public${poster}`));
    assert.ok(info.size > 8 * 1024, `${poster} is unexpectedly small`);
    assert.ok(info.size < 160 * 1024, `${poster} exceeds the poster byte budget`);
  }
});

test("hero playback is accessible, resource-aware and subject-safe", async () => {
  const [videoComponent, heroComponent, stylesheet] = await Promise.all([
    readFile(projectFile("app/components/HeroBackgroundVideo.tsx"), "utf8"),
    readFile(projectFile("app/components/HeroComposition.tsx"), "utf8"),
    readFile(projectFile("app/globals.css"), "utf8"),
  ]);

  assert.match(videoComponent, /muted/);
  assert.match(videoComponent, /loop/);
  assert.match(videoComponent, /playsInline/);
  assert.match(videoComponent, /prefers-reduced-motion: reduce/);
  assert.match(videoComponent, /IntersectionObserver/);
  assert.match(videoComponent, /visibilitychange/);
  assert.match(videoComponent, /src=\{asset\?\.src\}/);
  assert.doesNotMatch(videoComponent, /<source\b/);
  assert.doesNotMatch(videoComponent, /autoPlay/);
  assert.match(heroComponent, /hero-duo-cutout\.png/);
  assert.match(stylesheet, /\.aj-film__hero-video[\s\S]*object-fit: cover/);
  assert.match(stylesheet, /\.aj-film__hero-photo-frame--subjects/);
  assert.match(stylesheet, /@media \(max-aspect-ratio: 1464 \/ 2200\)/);
  assert.match(stylesheet, /ellipse 78% 65% at 50% 35%/);
  assert.match(stylesheet, /transparent 92%,\s*transparent 100%/);
  assert.match(
    stylesheet,
    /\.aj-film__hero-photo-frame--subjects[\s\S]*transparent 100%/,
  );
});
