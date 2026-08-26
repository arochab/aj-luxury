import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const projectFile = (path) => new URL(`../${path}`, import.meta.url);

const videoFiles = [
  "public/videos/aj-luxury-hero-v4-motion-portrait-720x934.mp4",
  "public/videos/aj-luxury-hero-v4-motion-tablet-1440x810.mp4",
  "public/videos/aj-luxury-hero-v4-motion-desktop-1920x1080.mp4",
  "public/videos/aj-luxury-hero-v4-motion-xl-native-1920x1080.mp4",
];

test("the hero film uses only responsive derivatives of the approved V4 poster", async () => {
  const [hero, motion, builder] = await Promise.all([
    readFile(projectFile("app/components/StaticProductionHero.tsx"), "utf8"),
    readFile(projectFile("app/components/ProductionHeroMotion.tsx"), "utf8"),
    readFile(projectFile("scripts/build_hero_v4_motion.py"), "utf8"),
  ]);

  assert.match(hero, /v4-motion-from-approved-poster/);
  assert.match(hero, /hero-v4-portrait-480x623-poster\.webp/);
  assert.match(hero, /hero-v4-tablet-1440x810-poster\.webp/);
  assert.match(motion, /prefers-reduced-motion: reduce/);
  assert.match(motion, /saveData/);
  assert.match(motion, /IntersectionObserver/);
  assert.match(motion, /visibilitychange/);
  assert.match(motion, /preload="none"/);
  assert.match(motion, /\sloop(?:\s|=)/);
  assert.match(motion, /\.mp4\?v=2/);
  assert.doesNotMatch(`${hero}\n${motion}`, /https?:\/\//i);
  assert.match(builder, /Only retained AJ Luxury pixels are used/);
  assert.match(builder, /hero-v4-portrait-720x934-poster\.webp/);
  assert.doesNotMatch(builder, /imagegen|generated_images|hero-v6|hero-v7/i);

  for (const file of videoFiles) {
    assert.match(motion, new RegExp(file.replace("public", "").replaceAll(".", "\\.")));
  }
});

test("the responsive V4 films are HD, silent and optimized for progressive start", async () => {
  for (const file of videoFiles) {
    const [bytes, metadata] = await Promise.all([
      readFile(projectFile(file)),
      stat(projectFile(file)),
    ]);
    const ftyp = bytes.indexOf(Buffer.from("ftyp"));
    const moov = bytes.indexOf(Buffer.from("moov"));
    const mdat = bytes.indexOf(Buffer.from("mdat"));

    assert.ok(metadata.size > 128 * 1024, `${file} is unexpectedly small`);
    assert.ok(metadata.size < 9 * 1024 * 1024, `${file} exceeds 9 MB`);
    assert.ok(ftyp >= 0 && ftyp < 32, `${file} has no MP4 header`);
    assert.ok(moov > ftyp && mdat > moov, `${file} is not fast-start encoded`);
    assert.ok(bytes.indexOf(Buffer.from("avc1")) >= 0, `${file} has no H.264 track`);
    assert.equal(bytes.indexOf(Buffer.from("mp4a")), -1, `${file} contains audio`);
    assert.equal(bytes.indexOf(Buffer.from("soun")), -1, `${file} contains audio`);
  }
});
