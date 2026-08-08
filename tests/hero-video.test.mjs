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
    assert.match(asset.src, /\?v=v1$/);
  }
});

test("video posters are lightweight and available before playback", async () => {
  const posters = new Set(
    Object.values(HERO_VIDEO_ASSETS).map((asset) => asset.poster),
  );

  for (const poster of posters) {
    const info = await stat(publicAssetFile(poster));
    assert.ok(info.size > 8 * 1024, `${poster} is unexpectedly small`);
    assert.ok(info.size < 160 * 1024, `${poster} exceeds the poster byte budget`);
    assert.match(poster, /\?v=v1$/);
  }
});

test("the lossless hero cutout stays below its critical byte budget", async () => {
  const [source, optimized, mobile, tablet, retina] = await Promise.all([
    stat(projectFile("public/images/client/hero-duo-cutout.png")),
    stat(projectFile("public/images/client/hero-duo-cutout-v1.webp")),
    stat(projectFile("public/images/client/hero-duo-cutout-768-v1.webp")),
    stat(projectFile("public/images/client/hero-duo-cutout-1024-v1.webp")),
    stat(projectFile("public/images/client/hero-duo-cutout-1280-v1.webp")),
  ]);

  assert.ok(optimized.size < 1.5 * 1024 * 1024);
  assert.ok(optimized.size < source.size * 0.65);
  assert.ok(mobile.size < 600 * 1024);
  assert.ok(tablet.size < 950 * 1024);
  assert.ok(retina.size < optimized.size);
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
  assert.match(videoComponent, /<picture className="aj-film__hero-poster"/);
  assert.match(videoComponent, /HERO_VIDEO_ASSETS\.mobile\.poster/);
  assert.match(videoComponent, /media: "\(max-width: 600px\)"/);
  assert.match(videoComponent, /media: "\(min-width: 601px\)"/);
  assert.match(videoComponent, /src=\{asset\?\.src\}/);
  assert.doesNotMatch(videoComponent, /SOURCE_LOAD_CEILING|ceilingHandle/);
  assert.doesNotMatch(videoComponent, /autoPlay/);
  assert.match(heroComponent, /hero-duo-cutout-v1\.webp/);
  assert.match(heroComponent, /hero-duo-cutout-768-v1\.webp 768w/);
  assert.equal(
    heroComponent.match(/fetchPriority="auto"/g)?.length,
    2,
    "poster priority must precede the two subject layers",
  );
  assert.doesNotMatch(heroComponent, /next\/image/);
  assert.match(heroComponent, /<figcaption>/);
  assert.equal(
    heroComponent.match(/hero-duo-static\.webp/g)?.length,
    1,
    "the accessible caption must not trigger a duplicate priority image",
  );
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
  assert.match(worker, /stale-while-revalidate=86400/);
  assert.match(worker, /s-maxage=300/);
  assert.match(worker, /HTML_CACHE_VERSION/);
  assert.match(worker, /CACHEABLE_HTML_ROUTES/);
  assert.match(worker, /pathname\.startsWith\("\/products\/"\)/);
  assert.match(worker, /cache\.match\(cacheKey\)/);
  assert.match(worker, /ctx\.waitUntil\(/);
  assert.match(worker, /cache\.put\(cacheKey, publicResponse\.clone\(\)\)/);
  assert.match(worker, /X-AJ-Edge-Cache/);
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
