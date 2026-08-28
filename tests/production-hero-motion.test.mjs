import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const execFileAsync = promisify(execFile);
const sourcePath = "artifacts/source-assets/isabelle/2026-08-26/video-accueil-v2-aj-luxury-original.mp4";
const landscapePath = "public/videos/aj-luxury-hero-isabelle-v2-landscape-1920x1080-realesrgan.mp4";
const portraitPath = "public/videos/aj-luxury-hero-isabelle-v2-portrait-720x934.mp4";

const sha256 = async (path) => createHash("sha256")
  .update(await readFile(projectFile(path)))
  .digest("hex");

const probe = async (path) => {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate,color_range,color_space,color_transfer,color_primaries,nb_frames:format=duration,size",
    "-of", "json",
    fileURLToPath(projectFile(path)),
  ]);
  return JSON.parse(stdout);
};

test("the welcome film uses only the supplied Isabelle V2 asset and its responsive derivative", async () => {
  const [hero, motion, sourceHash] = await Promise.all([
    readFile(projectFile("app/components/StaticProductionHero.tsx"), "utf8"),
    readFile(projectFile("app/components/ProductionHeroMotion.tsx"), "utf8"),
    sha256(sourcePath),
  ]);

  assert.equal(
    sourceHash,
    "0a1b1489d467c7938c4f90bfe2489eda402d53a1952aa10f07af3dc2ffbdb8bc",
    "the supplied landscape master must remain byte-exact",
  );
  assert.match(hero, /data-hero-version="isabelle-welcome-v2"/);
  assert.match(hero, /className="aj-film__hero-backdrop"/);
  assert.match(hero, /aj-luxury-hero-isabelle-v2-portrait-poster\.webp/);
  assert.match(hero, /aj-luxury-hero-isabelle-v2-landscape-1920x1080-poster\.webp/);
  assert.match(motion, /prefers-reduced-motion: reduce/);
  assert.match(motion, /saveData/);
  assert.match(motion, /IntersectionObserver/);
  assert.match(motion, /visibilitychange/);
  assert.match(motion, /preload="none"/);
  assert.match(motion, /\sloop(?:\s|=)/);
  assert.match(motion, /aj-luxury-hero-isabelle-v2-portrait-720x934\.mp4\?v=5/);
  assert.match(motion, /aj-luxury-hero-isabelle-v2-landscape-1920x1080-realesrgan\.mp4\?v=2/);
  assert.doesNotMatch(`${hero}\n${motion}`, /https?:\/\//i);
  assert.doesNotMatch(motion, /aj-luxury-hero-v4-motion/);

  for (const poster of [
    "public/images/client/aj-luxury-hero-isabelle-v2-portrait-poster.webp",
    "public/images/client/aj-luxury-hero-isabelle-v2-landscape-1920x1080-poster.webp",
  ]) {
    assert.ok((await stat(projectFile(poster))).size > 0, `${poster} is empty`);
  }
});

test("the supplied and portrait films decode with their exact responsive geometry", async () => {
  const [landscape, portrait] = await Promise.all([
    probe(landscapePath),
    probe(portraitPath),
  ]);

  assert.deepEqual(
    [landscape.streams[0].width, landscape.streams[0].height, landscape.streams[0].r_frame_rate],
    [1920, 1080, "24/1"],
  );
  assert.deepEqual(
    [
      landscape.streams[0].color_range,
      landscape.streams[0].color_space,
      landscape.streams[0].color_transfer,
      landscape.streams[0].color_primaries,
      landscape.streams[0].nb_frames,
    ],
    ["tv", "bt709", "bt709", "bt709", "121"],
  );
  assert.equal(await sha256(landscapePath), "9ee1447fd4630b37b53dbadfe24db48da1c4e354a90d3a8f13b2a8229c823ac1");
  assert.ok(Number(landscape.format.size) < 5 * 1024 * 1024);
  assert.deepEqual(
    [portrait.streams[0].width, portrait.streams[0].height, portrait.streams[0].r_frame_rate],
    [720, 934, "24/1"],
  );
  assert.ok(Math.abs(Number(landscape.format.duration) - 5.041667) < 0.01);
  assert.ok(Math.abs(Number(portrait.format.duration) - 5.041667) < 0.01);
});

test("the hero hands its measured plum floor to the horizontal chromatic rail", async () => {
  const [page, rail, css] = await Promise.all([
    readFile(projectFile("app/page.tsx"), "utf8"),
    readFile(projectFile("app/components/HomeHorizontalChromaticRail.tsx"), "utf8"),
    readFile(projectFile("app/components/HomeHorizontalChromaticRail.module.css"), "utf8"),
  ]);

  assert.match(page, /<HomeHorizontalChromaticRail\s*\/>/);
  assert.doesNotMatch(page, /<HomeChromaticBridge\s*\/>/);
  assert.doesNotMatch(page, /className="aj-section-break"/);
  assert.match(rail, /data-home-horizontal-rail="v46"/);
  assert.match(rail, /prefers-reduced-motion: no-preference/);
  assert.match(rail, /pin:\s*stage/);
  assert.match(rail, /scrub:\s*true/);
  assert.doesNotMatch(rail, /scrub:\s*0\./);
  assert.match(rail, /x:\s*\(\) => -panelOffset\(1\)/);
  assert.match(rail, /x:\s*\(\) => -panelOffset\(2\)/);
  assert.match(rail, /--rail-panel-width/);
  assert.match(rail, /onRefreshInit:\s*syncPanelWidth/);
  assert.match(rail, /className=\{styles\.compactCopy\}/);
  assert.match(rail, /srcSet=\{responsiveSrcSet/);
  assert.match(rail, /sizes=\{RAIL_IMAGE_SIZES\}/);
  assert.ok(
    rail.indexOf('slug: "pourpre"') <
      rail.indexOf('slug: "lilas-bleu-clair"') &&
      rail.indexOf('slug: "lilas-bleu-clair"') <
        rail.indexOf('slug: "rose-pale"'),
  );
  assert.match(rail, /apollon-pourpre-lyre-v1\.webp/);
  assert.match(rail, /apollon-lilas-lyre-v1\.webp/);
  assert.match(rail, /apollon-rose-lyre-v1\.webp/);
  assert.match(css, /#261019/);
  assert.match(css, /#777780/);
  assert.match(css, /#08080a/);
  assert.match(css, /\.frame\s*\{[\s\S]*border:\s*1px solid rgba\(255, 255, 255, 0\.78\)/);
  assert.match(css, /object-fit:\s*contain/);
  assert.match(css, /flex:\s*0 0 var\(--rail-panel-width/);
  assert.match(css, /\.exitBridge\s*\{[\s\S]*height:\s*clamp\(28px, 2\.8vw, 42px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /transition:\s*all/);

  for (const path of [
    "public/images/editorial/isabelle-apollon/apollon-pourpre-lyre-v1-360.webp",
    "public/images/editorial/isabelle-apollon/apollon-pourpre-lyre-v1-720.webp",
    "public/images/editorial/isabelle-apollon/apollon-lilas-lyre-v1-360.webp",
    "public/images/editorial/isabelle-apollon/apollon-lilas-lyre-v1-720.webp",
    "public/images/editorial/isabelle-apollon/apollon-rose-lyre-v1-360.webp",
    "public/images/editorial/isabelle-apollon/apollon-rose-lyre-v1-720.webp",
    "public/images/client/apollon-world/apollon-pourpre-model-color-v2-360.webp",
    "public/images/client/apollon-world/apollon-pourpre-model-color-v2-720.webp",
    "public/images/client/apollon-world/apollon-pourpre-model-color-v2-1080.webp",
    "public/images/client/apollon-world/apollon-lilas-model-color-v2-360.webp",
    "public/images/client/apollon-world/apollon-lilas-model-color-v2-720.webp",
    "public/images/client/apollon-world/apollon-lilas-model-color-v2-1080.webp",
    "public/images/client/apollon-world/apollon-rose-model-color-v2-360.webp",
    "public/images/client/apollon-world/apollon-rose-model-color-v2-720.webp",
    "public/images/client/apollon-world/apollon-rose-model-color-v2-1080.webp",
  ]) {
    assert.ok((await stat(projectFile(path))).size > 0, `${path} is empty`);
  }
});
