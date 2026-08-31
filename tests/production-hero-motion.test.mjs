import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const execFileAsync = promisify(execFile);
const landscapePath = "public/videos/aj-luxury-hero-openart-desktop-1920x1080.mp4";
const portraitPath = "public/videos/aj-luxury-hero-openart-mobile-1080x1920.mp4";

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

test("the welcome film uses only the approved Isabelle V2 runtime assets", async () => {
  const [hero, motion] = await Promise.all([
    readFile(projectFile("app/components/StaticProductionHero.tsx"), "utf8"),
    readFile(projectFile("app/components/ProductionHeroMotion.tsx"), "utf8"),
  ]);

  assert.match(hero, /data-hero-version="openart-dual-v1"/);
  assert.match(hero, /className="aj-film__hero-backdrop"/);
  assert.match(hero, /aj-luxury-hero-openart-mobile-poster-540\.webp 540w/);
  assert.match(hero, /aj-luxury-hero-openart-mobile-poster-1080\.webp 1080w/);
  assert.match(hero, /aj-luxury-hero-openart-desktop-poster\.webp/);
  assert.match(motion, /prefers-reduced-motion: reduce/);
  assert.match(motion, /saveData/);
  assert.match(motion, /IntersectionObserver/);
  assert.match(motion, /visibilitychange/);
  assert.match(motion, /preload="none"/);
  assert.match(motion, /\sloop(?:\s|=)/);
  assert.match(motion, /window\.matchMedia\("\(max-aspect-ratio: 4 \/ 5\)"\)/);
  assert.match(motion, /addEventListener\("change", syncPortraitSource\)/);
  assert.match(motion, /removeEventListener\("change", syncPortraitSource\)/);
  assert.match(motion, /\[portraitSource, sourceEnabled\]/);
  assert.match(motion, /aj-luxury-hero-openart-mobile-1080x1920\.mp4/);
  assert.match(motion, /aj-luxury-hero-openart-desktop-1920x1080\.mp4/);
  assert.doesNotMatch(`${hero}\n${motion}`, /https?:\/\//i);
  assert.doesNotMatch(motion, /aj-luxury-hero-v4-motion/);

  for (const poster of [
    "public/images/client/aj-luxury-hero-openart-mobile-poster-540.webp",
    "public/images/client/aj-luxury-hero-openart-mobile-poster-1080.webp",
    "public/images/client/aj-luxury-hero-openart-desktop-poster.webp",
  ]) {
    assert.ok((await stat(projectFile(poster))).size > 0, `${poster} is empty`);
  }
});

test("the approved desktop and mobile films decode with their exact runtime geometry", async () => {
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
  assert.equal(await sha256(landscapePath), "fd4ef29158865597b261c5239df41caad86b5c3f0c3a3797d246539889c71b2a");
  assert.ok(Number(landscape.format.size) < 5 * 1024 * 1024);
  assert.ok(Math.abs(Number(landscape.format.duration) - 5.041667) < 0.01);
  assert.deepEqual(
    [portrait.streams[0].width, portrait.streams[0].height, portrait.streams[0].r_frame_rate],
    [1080, 1920, "24/1"],
  );
  assert.equal(await sha256(portraitPath), "e52d3a1aa3d61e8231ee8e32b9a2a3a76f459fc32c4268c47d43b860a32e2717");
  assert.ok(Number(portrait.format.size) < 5 * 1024 * 1024);
  assert.ok(Math.abs(Number(portrait.format.duration) - 6.041667) < 0.01);
});

test("the hero hands its measured plum floor to the horizontal chromatic rail", async () => {
  const [page, rail, css, homeCss] = await Promise.all([
    readFile(projectFile("app/page.tsx"), "utf8"),
    readFile(projectFile("app/components/HomeHorizontalChromaticRail.tsx"), "utf8"),
    readFile(projectFile("app/components/HomeHorizontalChromaticRail.module.css"), "utf8"),
    readFile(projectFile("app/components/ProductionHome.module.css"), "utf8"),
  ]);

  assert.match(page, /<HomeHorizontalChromaticRail\s*\/>/);
  assert.match(page, /<h1>Reveal Your Inner Beauty<\/h1>/);
  assert.doesNotMatch(page, /<HomeChromaticBridge\s*\/>/);
  assert.doesNotMatch(page, /className="aj-section-break"/);
  assert.match(rail, /data-home-horizontal-rail="v48"/);
  assert.match(rail, /prefers-reduced-motion: no-preference/);
  assert.match(rail, /desktop:\s*"\(min-width: 901px\)"/);
  assert.match(rail, /pin:\s*stage/);
  assert.match(rail, /scrub:\s*true/);
  assert.match(rail, /anticipatePin:\s*0/);
  assert.doesNotMatch(rail, /anticipatePin:\s*1/);
  assert.doesNotMatch(rail, /scrub:\s*0\./);
  assert.match(rail, /x:\s*\(\) => -panelOffset\(1\)/);
  assert.match(rail, /x:\s*\(\) => -panelOffset\(2\)/);
  assert.match(rail, /--rail-panel-width/);
  assert.match(rail, /onRefreshInit:\s*syncPanelWidth/);
  assert.match(rail, /stage\.clientHeight \* 3\.15/);
  assert.doesNotMatch(rail, /window\.innerHeight \* 3\.15/);
  assert.match(rail, /className=\{styles\.compactCopy\}/);
  assert.match(rail, /ref=\{viewportRef\}/);
  assert.match(rail, /addEventListener\("scroll", onScroll, \{ passive: true \}\)/);
  assert.match(rail, /addEventListener\("wheel", onWheel, \{ passive: false \}\)/);
  assert.match(rail, /Math\.abs\(event\.deltaX\) > Math\.abs\(event\.deltaY\)/);
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
  assert.match(homeCss, /--hero-rail-seam:\s*#261019/);
  assert.match(homeCss, /var\(--hero-rail-seam\) 100%/);
  assert.match(css, /background:\s*var\(--hero-rail-seam, #261019\)/);
  assert.match(css, /\.track::after\s*\{[\s\S]*var\(--hero-rail-seam, #261019\) 0%[\s\S]*transparent 100%/);
  assert.match(css, /--rail-divider-size:\s*clamp\(14px, 1\.25vw, 20px\)/);
  assert.match(css, /\.sequence\s*\{[\s\S]*border-top:\s*var\(--rail-divider-size\) solid #f6f3ef/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*--rail-divider-size:\s*16px/);
  assert.match(css, /\.trackViewport\s*\{/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*overflow-x:\s*auto[\s\S]*scroll-snap-type:\s*x mandatory/);
  assert.match(css, /touch-action:\s*pan-x pan-y/);
  assert.match(css, /#777a9d/);
  assert.match(css, /#08080a/);
  assert.match(
    css,
    /#5b1233 18%[\s\S]*#777a9d 50%[\s\S]*#ad777c 76%[\s\S]*#a76f79 82%[\s\S]*#95616d 87%[\s\S]*#7c505e 92%[\s\S]*#5a3c48 96%[\s\S]*#34252d 98\.5%[\s\S]*#111014 100%/,
  );
  assert.doesNotMatch(css, /#ad777c 77%,\s*#161014 92%/);
  assert.match(css, /\.track::before\s*\{[\s\S]*pointer-events:\s*none/);
  assert.doesNotMatch(css, /\.panel::(?:before|after)/);
  assert.match(css, /\.frame\s*\{[\s\S]*border:\s*1px solid rgba\(255, 255, 255, 0\.78\)/);
  assert.match(css, /object-fit:\s*contain/);
  assert.doesNotMatch(rail, /progressTrack|progressFill/);
  assert.doesNotMatch(rail, /stageFooter|01 \/ 03/);
  assert.doesNotMatch(rail, /styles\.modelFrame/);
  assert.doesNotMatch(css, /\.modelFrame::after/);
  assert.match(rail, /apollon-pourpre-alex-bordeaux-v1\.webp/);
  assert.match(rail, /Apollon Pourpre Impérial porté par Alex/);
  assert.doesNotMatch(rail, /Pourpre Impérial porté par Jérémy et Alex/);
  assert.match(
    css,
    /@media \(max-width: 560px\)[\s\S]*\.panelInner\s*\{[\s\S]*width:\s*min\(calc\(100vw - 12px\), 440px\)[\s\S]*\.frame\s*\{[\s\S]*aspect-ratio:\s*2 \/ 3[\s\S]*\.frame img\s*\{[\s\S]*object-fit:\s*contain/,
  );
  assert.match(css, /flex:\s*0 0 var\(--rail-panel-width/);
  assert.match(css, /\.moment\s*\{[\s\S]*font-size:\s*var\(--t0\)/);
  assert.doesNotMatch(rail, /exitBridge/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /transition:\s*all/);

  assert.match(
    homeCss,
    /@media \(max-aspect-ratio: 4 \/ 5\)[\s\S]*\.aj-film__hero-poster img[\s\S]*\.aj-film__hero-video[\s\S]*object-fit:\s*cover[\s\S]*@media \(max-width: 560px\)[\s\S]*inset:\s*0[\s\S]*width:\s*100%/,
  );
  assert.match(homeCss, /@media \(max-aspect-ratio: 4 \/ 5\)[\s\S]*mask-image:\s*none/);

  for (const path of [
    "public/images/editorial/isabelle-apollon/apollon-pourpre-lyre-v1-360.webp",
    "public/images/editorial/isabelle-apollon/apollon-pourpre-lyre-v1-720.webp",
    "public/images/editorial/isabelle-apollon/apollon-lilas-lyre-v1-360.webp",
    "public/images/editorial/isabelle-apollon/apollon-lilas-lyre-v1-720.webp",
    "public/images/editorial/isabelle-apollon/apollon-rose-lyre-v1-360.webp",
    "public/images/editorial/isabelle-apollon/apollon-rose-lyre-v1-720.webp",
    "public/images/client/apollon-world/apollon-pourpre-alex-bordeaux-v1-360.webp",
    "public/images/client/apollon-world/apollon-pourpre-alex-bordeaux-v1-720.webp",
    "public/images/client/apollon-world/apollon-pourpre-alex-bordeaux-v1-1080.webp",
    "public/images/client/apollon-world/apollon-lilas-model-color-v2-360.webp",
    "public/images/client/apollon-world/apollon-lilas-model-color-v2-720.webp",
    "public/images/client/apollon-world/apollon-lilas-model-color-v2-1080.webp",
    "public/images/client/apollon-world/apollon-rose-model-color-v2-360.webp",
    "public/images/client/apollon-world/apollon-rose-model-color-v2-720.webp",
    "public/images/client/apollon-world/apollon-rose-model-color-v2-1080.webp",
    "public/images/client/raw/product-card-pourpre-480.webp",
    "public/images/client/raw/product-card-pourpre-960.webp",
    "public/images/client/raw/product-rose-profile-480.webp",
    "public/images/client/raw/product-rose-profile-960.webp",
    "public/images/client/raw/product-lilas-model-480.webp",
    "public/images/client/raw/product-lilas-model-960.webp",
  ]) {
    assert.ok((await stat(projectFile(path))).size > 0, `${path} is empty`);
  }
});

test("the Apollon collection serves responsive deterministic image derivatives", async () => {
  const [shop, home, css] = await Promise.all([
    readFile(projectFile("app/shop/page.tsx"), "utf8"),
    readFile(projectFile("app/page.tsx"), "utf8"),
    readFile(projectFile("app/shop/Shop.module.css"), "utf8"),
  ]);

  assert.match(shop, /function productSrcSet/);
  assert.match(shop, /srcSet=\{productSrcSet\(product\.image\)\}/);
  assert.match(shop, /loading="eager"/);
  assert.match(shop, /fetchPriority=\{index === 0 \? "high" : "auto"\}/);
  assert.match(home, /srcSet=\{productCardSrcSet\(image\)\}/);
  assert.match(css, /\.productVisual img\s*\{[\s\S]*position:\s*absolute[\s\S]*width:\s*100%[\s\S]*height:\s*100%/);
});
