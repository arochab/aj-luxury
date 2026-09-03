import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const baseUrl = process.env.AJ_QA_URL ?? "http://127.0.0.1:3036/";
const evidenceDir = new URL(
  "../docs/internal/evidence/prelaunch-2026-09-03/graphics-batch/",
  import.meta.url,
);
await mkdir(evidenceDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});

async function open(viewport, pathname = "/", isMobile = false) {
  const context = await browser.newContext({
    viewport,
    isMobile,
    hasTouch: isMobile,
    locale: "fr-FR",
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8_000);
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(new URL(pathname, baseUrl).href, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.evaluate(() => Promise.race([
    document.fonts.ready,
    new Promise((resolve) => setTimeout(resolve, 4_000)),
  ]));
  await page.waitForTimeout(900);
  return { context, errors, page };
}

const report = { home: [], story: [] };

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 430, height: 932, mobile: true },
  { width: 390, height: 844, mobile: true },
]) {
  console.log(`home ${viewport.width}x${viewport.height}`);
  const run = await open(viewport, "/", Boolean(viewport.mobile));
  const hero = await run.page.locator(".aj-film__hero-media").evaluate((media) => {
    const stage = media.querySelector(".aj-film__hero-stage");
    const poster = media.querySelector(".aj-film__hero-poster img");
    const video = media.querySelector(".aj-film__hero-video");
    const backdrop = media.querySelector(".aj-film__hero-backdrop");
    const mediaRect = media.getBoundingClientRect();
    const stageRect = stage?.getBoundingClientRect();
    return {
      documentOverflow: document.documentElement.scrollWidth - innerWidth,
      stageDelta: stageRect ? {
        left: Math.abs(stageRect.left - mediaRect.left),
        right: Math.abs(stageRect.right - mediaRect.right),
        top: Math.abs(stageRect.top - mediaRect.top),
        bottom: Math.abs(stageRect.bottom - mediaRect.bottom),
      } : null,
      objectFit: poster ? getComputedStyle(poster).objectFit : null,
      objectPosition: poster ? getComputedStyle(poster).objectPosition : null,
      posterMask: poster ? getComputedStyle(poster).maskImage : null,
      videoMask: video ? getComputedStyle(video).maskImage : null,
      backdropDisplay: backdrop ? getComputedStyle(backdrop).display : null,
      posterReady: Boolean(poster?.complete && poster.naturalWidth > 0),
    };
  });
  assert.equal(hero.documentOverflow, 0, `${viewport.width}: no homepage overflow`);
  assert.equal(hero.objectFit, "cover", `${viewport.width}: hero fills its canvas`);
  assert.equal(hero.posterReady, true, `${viewport.width}: hero poster decodes`);
  if (!viewport.mobile) {
    assert(hero.stageDelta && Object.values(hero.stageDelta).every((value) => value <= 1), `${viewport.width}: desktop stage is full bleed`);
    assert.equal(hero.posterMask, "none", `${viewport.width}: desktop poster has no feather rectangle`);
    assert.equal(hero.videoMask, "none", `${viewport.width}: desktop film has no feather rectangle`);
    assert.equal(hero.backdropDisplay, "none", `${viewport.width}: desktop has no blurred duplicate boundary`);
  }
  await run.page.locator(".aj-film").screenshot({
    path: fileURLToPath(new URL(`home-hero-${viewport.width}.png`, evidenceDir)),
  });

  const productImage = run.page.locator('img[src*="product-pourpre-detail"]').first();
  await productImage.scrollIntoViewIfNeeded();
  await productImage.evaluate((image) => image.decode());
  assert.match(await productImage.getAttribute("src"), /product-pourpre-detail\.webp/);
  assert.doesNotMatch(await productImage.getAttribute("src"), /product-pourpre-back/);

  const railImage = run.page.locator('img[src*="apollon-pourpre-model-color-v5"]').first();
  await railImage.scrollIntoViewIfNeeded();
  await railImage.evaluate((image) => image.decode());
  assert.match(await railImage.getAttribute("src"), /apollon-pourpre-model-color-v5\.webp/);
  await railImage.locator("xpath=ancestor::figure").screenshot({
    path: fileURLToPath(new URL(`pourpre-support-${viewport.width}.png`, evidenceDir)),
  });
  assert.deepEqual(run.errors, [], `${viewport.width}: homepage console errors`);
  report.home.push({ viewport, hero });
  await run.context.close();
}

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 430, height: 932, mobile: true },
  { width: 390, height: 844, mobile: true },
]) {
  console.log(`story ${viewport.width}x${viewport.height}`);
  const run = await open(viewport, "/notre-histoire", Boolean(viewport.mobile));
  const story = await run.page.locator("main").evaluate((main) => {
    const hero = main.querySelector("section");
    const figure = hero?.querySelector("figure");
    const image = figure?.querySelector("img");
    const figureRect = figure?.getBoundingClientRect();
    return {
      documentOverflow: document.documentElement.scrollWidth - innerWidth,
      heroBackground: hero ? getComputedStyle(hero).backgroundImage : null,
      figureWidth: figureRect?.width ?? 0,
      figureLeft: figureRect?.left ?? 0,
      imageReady: Boolean(image?.complete && image.naturalWidth > 0),
      imageFit: image ? getComputedStyle(image).objectFit : null,
    };
  });
  assert.equal(story.documentOverflow, 0, `${viewport.width}: no story overflow`);
  assert.equal(story.imageReady, true, `${viewport.width}: story hero decodes`);
  assert.equal(story.imageFit, "cover", `${viewport.width}: story models fill the frame`);
  assert(story.figureWidth >= (viewport.mobile ? viewport.width - 26 : viewport.width * 0.33), `${viewport.width}: story models are prominent`);
  await run.page.locator("main > section").first().screenshot({
    path: fileURLToPath(new URL(`story-hero-${viewport.width}.png`, evidenceDir)),
  });
  assert.deepEqual(run.errors, [], `${viewport.width}: story console errors`);
  report.story.push({ viewport, story });
  await run.context.close();
}

await browser.close();
await writeFile(
  new URL("report.json", evidenceDir),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify(report, null, 2));
