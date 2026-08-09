import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import {
  HERO_VIDEO_ASSETS,
  HERO_VIDEO_VERSION,
  selectHeroVideoAsset,
} from "../lib/hero-video.ts";
import { products } from "../lib/products.ts";

const projectFile = (path) => new URL(`../${path}`, import.meta.url);
const publicAssetFile = (url) => projectFile(`public${url.split("?")[0]}`);

test("hero video asset selection is deterministic at every breakpoint", () => {
  assert.equal(HERO_VIDEO_VERSION, "v3");
  assert.equal(selectHeroVideoAsset(390, 844), HERO_VIDEO_ASSETS.portrait);
  assert.equal(selectHeroVideoAsset(768, 1024), HERO_VIDEO_ASSETS.portrait);
  assert.equal(selectHeroVideoAsset(800, 1000), HERO_VIDEO_ASSETS.portrait);
  assert.equal(selectHeroVideoAsset(801, 1000), HERO_VIDEO_ASSETS.tablet);
  assert.equal(selectHeroVideoAsset(1440, 900), HERO_VIDEO_ASSETS.tablet);
  assert.equal(selectHeroVideoAsset(1441, 900), HERO_VIDEO_ASSETS.desktop);
  assert.equal(selectHeroVideoAsset(2199, 1200), HERO_VIDEO_ASSETS.desktop);
  assert.equal(selectHeroVideoAsset(2200, 1200), HERO_VIDEO_ASSETS.xl);
  assert.equal(selectHeroVideoAsset(3840, 2160), HERO_VIDEO_ASSETS.xl);
  assert.equal(
    new Set(Object.values(HERO_VIDEO_ASSETS).map((asset) => asset.src)).size,
    4,
    "every responsive role must have a dedicated HD rendition",
  );
});

test("the responsive HD MP4 set stays bounded and starts progressively", async () => {
  const limits = {
    portrait: 1.1 * 1024 * 1024,
    tablet: 2.2 * 1024 * 1024,
    desktop: 2.9 * 1024 * 1024,
    xl: 5 * 1024 * 1024,
  };

  for (const [name, asset] of Object.entries(HERO_VIDEO_ASSETS)) {
    const path = publicAssetFile(asset.src);
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
    assert.match(asset.src, /aj-luxury-hero-v3-[\w-]+\.mp4\?v=v3$/);
  }
});

test("responsive first-frame posters stay within explicit byte budgets", async () => {
  const limits = {
    portrait: 160 * 1024,
    tablet: 230 * 1024,
    desktop: 350 * 1024,
    xl: 550 * 1024,
  };
  const posters = new Set(
    Object.values(HERO_VIDEO_ASSETS).map((asset) => asset.poster),
  );
  assert.equal(posters.size, 4);

  for (const [role, asset] of Object.entries(HERO_VIDEO_ASSETS)) {
    const info = await stat(publicAssetFile(asset.poster));
    assert.ok(info.size > 32 * 1024, `${role} poster is unexpectedly small`);
    assert.ok(info.size <= limits[role], `${role} poster exceeds its byte budget`);
    assert.match(asset.poster, /hero-v3-[\w-]+-poster\.webp\?v=v3$/);
  }

  const avifMinimums = {
    tablet: 96 * 1024,
    desktop: 144 * 1024,
    xl: 220 * 1024,
  };

  for (const [role, asset] of Object.entries(HERO_VIDEO_ASSETS).filter(
    ([, candidate]) => candidate.posterAvif,
  )) {
    const [webpInfo, avifInfo] = await Promise.all([
      stat(publicAssetFile(asset.poster)),
      stat(publicAssetFile(asset.posterAvif)),
    ]);
    assert.ok(avifInfo.size > avifMinimums[role]);
    assert.ok(
      avifInfo.size <= webpInfo.size * 0.5,
      `${role} AVIF exceeds its WebP-relative byte budget`,
    );
    assert.match(asset.posterAvif, /hero-v3-[\w-]+-poster\.avif\?v=v3$/);
  }

  const compactPortrait = HERO_VIDEO_ASSETS.portrait.posterCompact;
  const compactInfo = await stat(publicAssetFile(compactPortrait));
  assert.ok(compactInfo.size > 60 * 1024);
  assert.ok(compactInfo.size < 66 * 1024);
  assert.match(compactPortrait, /hero-v3-portrait-480x623-poster\.webp\?v=v3$/);
});

test("every runtime rendition contains video only", async () => {
  for (const [role, asset] of Object.entries(HERO_VIDEO_ASSETS)) {
    const bytes = await readFile(publicAssetFile(asset.src));
    assert.ok(
      bytes.indexOf(Buffer.from("avc1")) >= 0,
      `${role} H.264 track is missing`,
    );
    assert.equal(bytes.indexOf(Buffer.from("mp4a")), -1, `${role} has audio`);
    assert.equal(bytes.indexOf(Buffer.from("soun")), -1, `${role} has audio`);
  }
});

test("product blur-up placeholders preserve continuity at a negligible byte cost", async () => {
  const gallerySources = new Set(
    products.flatMap((product) => product.gallery.map((image) => image.src)),
  );
  assert.equal(gallerySources.size, 14);

  for (const src of gallerySources) {
    const placeholder = `${src.replace(/\.[^.]+$/, "-placeholder-v1.webp")}?v=v1`;
    const info = await stat(publicAssetFile(placeholder));
    assert.ok(info.size > 128, `${placeholder} is unexpectedly empty`);
    assert.ok(info.size < 1024, `${placeholder} exceeds its one-kilobyte budget`);
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
  assert.match(videoComponent, /requestIdleCallback/);
  assert.match(videoComponent, /document\.readyState === "complete"/);
  assert.match(videoComponent, /preload="none"/);
  assert.match(videoComponent, /className="aj-film__hero-backdrop"/);
  assert.match(videoComponent, /className="aj-film__hero-stage"/);
  assert.match(videoComponent, /<picture className=\{className\}>/);
  assert.match(videoComponent, /HERO_VIDEO_ASSETS\.portrait\.poster/);
  assert.match(videoComponent, /type="image\/avif"/);
  assert.match(videoComponent, /HERO_VIDEO_ASSETS\.portrait\.posterCompact/);
  assert.match(videoComponent, /HERO_VIDEO_ASSETS\.tablet\.posterAvif/);
  assert.match(videoComponent, /HERO_VIDEO_ASSETS\.desktop\.posterAvif/);
  assert.match(videoComponent, /HERO_VIDEO_ASSETS\.xl\.posterAvif/);
  assert.match(videoComponent, /type: "image\/avif"/);
  assert.match(videoComponent, /HERO_VIDEO_ASSETS\.xl\.poster/);
  assert.match(videoComponent, /HERO_VIDEO_ASSETS\[role\]\.posterAvif/);
  assert.match(videoComponent, /imageSrcSet: PORTRAIT_POSTER_SRC_SET/);
  assert.match(videoComponent, /imageSizes: PORTRAIT_POSTER_SIZES/);
  assert.match(videoComponent, /media: HERO_POSTER_MEDIA\[role\]/);
  assert.match(videoComponent, /selectHeroVideoAsset\([\s\S]*window\.innerHeight/);
  assert.match(videoComponent, /src=\{asset\?\.src\}/);
  assert.doesNotMatch(videoComponent, /SOURCE_LOAD_CEILING|ceilingHandle/);
  assert.doesNotMatch(videoComponent, /autoPlay/);
  assert.doesNotMatch(heroComponent, /hero-duo-(?:static|cutout)/);
  assert.match(heroComponent, /<figcaption>/);
  assert.match(stylesheet, /\.aj-film__hero-video[\s\S]*object-fit: cover/);
  assert.match(stylesheet, /@media \(max-aspect-ratio: 4 \/ 5\)/);
  assert.match(stylesheet, /aspect-ratio: 720 \/ 934/);
  assert.match(stylesheet, /width: min\(100%, calc\(70svh \* 720 \/ 934\)\)/);
  assert.match(stylesheet, /filter: blur\(18px\) brightness\(0\.44\)/);
});

test("critical fonts and static assets keep an explicit cache contract", async () => {
  const [layout, stylesheet, worker, viteConfig, font] = await Promise.all([
    readFile(projectFile("app/layout.tsx"), "utf8"),
    readFile(projectFile("app/globals.css"), "utf8"),
    readFile(projectFile("worker/index.ts"), "utf8"),
    readFile(projectFile("vite.config.ts"), "utf8"),
    stat(projectFile("public/fonts/manrope-latin-v1.woff2")),
  ]);

  assert.doesNotMatch(layout, /next\/headers/);
  assert.doesNotMatch(layout, /next\/font/);
  assert.match(layout, /metadataBase: new URL\("https:\/\/ajluxurystore\.com"\)/);
  assert.match(layout, /preload\("\/fonts\/manrope-latin-v1\.woff2"/);
  assert.match(stylesheet, /@font-face[\s\S]*font-family: "AJ Manrope"/);
  assert.ok(font.size < 32 * 1024);
  assert.match(worker, /max-age=31536000, immutable/);
  assert.match(worker, /endsWith\("\.avif"\).*"image\/avif"/);
  assert.match(worker, /stale-while-revalidate=86400/);
  assert.match(worker, /s-maxage=300/);
  assert.match(worker, /HTML_CACHE_VERSION/);
  assert.match(worker, /CACHEABLE_HTML_ROUTES/);
  assert.match(worker, /pathname\.startsWith\("\/products\/"\)/);
  assert.match(worker, /cache\.match\(cacheKey\)/);
  assert.match(worker, /ctx\.waitUntil\(/);
  assert.match(worker, /cache\.put\(cacheKey, publicResponse\.clone\(\)\)/);
  assert.match(worker, /X-AJ-Edge-Cache/);
  assert.match(worker, /\/\^v\\d\+\$\/\.test\(assetVersion/);
  assert.match(worker, /no-cache/);
  assert.match(worker, /no-store/);
  assert.match(worker, /hasPrivateContext/);
  assert.match(worker, /createStaticFileSignal/);
  assert.match(worker, /process\.platform === "win32"/);
  assert.match(worker, /localStaticPath\(url\.pathname\)/);
  assert.match(worker, /env === undefined/);
  assert.match(worker, /env\?\.ASSETS/);
  assert.match(worker, /returnsHtml/);
  assert.match(viteConfig, /run_worker_first/);
  assert.match(viteConfig, /"\/i18n\/\*"/);
});

test("noncritical visual media stays outside the initial render path", async () => {
  const [
    homepage,
    productPage,
    gallery,
    header,
    footer,
    deferredMetal,
  ] = await Promise.all([
    readFile(projectFile("app/page.tsx"), "utf8"),
    readFile(projectFile("app/products/[slug]/page.tsx"), "utf8"),
    readFile(projectFile("app/components/ProductGalleryZoom.tsx"), "utf8"),
    readFile(projectFile("app/components/StoreHeader.tsx"), "utf8"),
    readFile(projectFile("app/components/StoreFooter.tsx"), "utf8"),
    readFile(projectFile("app/components/DeferredMetallicField.tsx"), "utf8"),
  ]);

  for (const source of [homepage, productPage, gallery, header, footer]) {
    assert.doesNotMatch(source, /next\/image/);
  }

  assert.ok((homepage.match(/fetchPriority="low"/g) ?? []).length >= 3);
  assert.match(productPage, /fetchPriority="low"/);
  assert.match(gallery, /const ready = eager \|\| \(visible && criticalPathComplete\)/);
  assert.match(gallery, /IntersectionObserver/);
  assert.match(gallery, /document\.readyState === "complete"/);
  assert.match(gallery, /requestIdleCallback/);
  assert.match(gallery, /"wheel",\s*"touchstart",\s*"pointerdown",\s*"keydown"/);
  assert.match(gallery, /fetchPriority=\{eager \? "high" : "low"\}/);
  assert.match(gallery, /galleryPlaceholderSrc/);
  assert.match(gallery, /-placeholder-v1\.webp/);
  assert.match(gallery, /data-gallery-media="placeholder"/);
  assert.match(gallery, /data-gallery-media="full"/);
  assert.match(deferredMetal, /lazy\(\(\) => import\("\.\/MetallicField"\)\)/);
  assert.match(deferredMetal, /rootMargin: "0px"/);
});
